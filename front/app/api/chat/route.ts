import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
  type JSONSchema7,
} from "ai";
import { APP_KNOWLEDGE } from "@/lib/app-knowledge";
import { createDelayedClientStream } from "@/lib/chat-stream";
import { createRetryingFetch } from "@/lib/provider-fetch";
import { consumeRateLimit, getRateLimitKey } from "@/lib/rateLimit";
import { maskAttachmentsForModel } from "@/lib/supportContent";

// LLM ходит через routerai.ru (OpenAI-совместимый роутер), апстрим — DeepInfra.
// Прокси здесь не нужен: routerai.ru отвечает с прод-VPS напрямую (~0.2 c).
// Прямой api.deepseek.com и DEEPSEEK_PROXY_URL остаются нетронутыми для отката.
// createRetryingFetch гасит разовые сбои резолвинга контейнера (EAI_AGAIN).
const routerai = createOpenAICompatible({
  name: "routerai",
  baseURL: "https://routerai.ru/api/v1",
  apiKey: process.env.ROUTERAI_API_KEY ?? "",
  fetch: createRetryingFetch(),
});

export const maxDuration = 90;

const CHAT_RATE_LIMIT = { window: 60, max: 15 } as const;

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

type SupportMessagePayload = {
  conversationId: string;
  messageId: string;
  role: "user" | "assistant";
  content: string;
};

function extractText(message: UIMessage | undefined): string {
  if (!message?.parts) return "";
  return message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => ("text" in p ? p.text : ""))
    .join("\n")
    .trim();
}

async function saveSupportMessage(
  req: Request,
  payload: SupportMessagePayload,
): Promise<void> {
  try {
    if (!API_URL) return;
    await fetch(`${API_URL}/api/support/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[chat] failed to save support message:", e);
  }
}

const MSK_TIME_ZONE = "Europe/Moscow";

function mskParts(date: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return parts;
}

/** «Сейчас 13.10.2026, 06:20 МСК (вторник)» — единственный источник «сегодня». */
function formatNow(date: Date): string {
  const p = mskParts(date);
  const weekday = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK_TIME_ZONE,
    weekday: "long",
  }).format(date);
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute} МСК (${weekday})`;
}

/** «11.10 18:14 МСК»; год добавляем, только если сообщение из другого года. */
function formatThreadTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = mskParts(date);
  const current = mskParts(now);
  const day = p.year === current.year ? `${p.day}.${p.month}` : `${p.day}.${p.month}.${p.year}`;
  return `${day} ${p.hour}:${p.minute} МСК`;
}

type SupportThreadItem = {
  role: "user" | "assistant" | "operator";
  content: string;
  createdAt: string;
};

/**
 * Время каждого сообщения диалога (МСК) из сохранённой истории. Иначе модель
 * видит переписку без дат и принимает сказанное вчера за текущее состояние
 * счёта — именно так бот сутки повторял устаревшее «депозита нет».
 */
async function fetchSupportThread(req: Request): Promise<SupportThreadItem[]> {
  if (!API_URL) return [];
  try {
    const res = await fetch(`${API_URL}/api/support/thread`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SupportThreadItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch (e) {
    console.warn("[chat] failed to load support thread timestamps:", e);
    return [];
  }
}

// Вложения в сохранённом тексте — markdown-ссылки, в запросе к модели — пометки
// «[вложен скриншот]». Для сопоставления сообщений обе формы убираем.
function normalizeForMatch(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[вложен[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// Префикс времени, который ставит stampMessageTimes: «[11.10 18:14 МСК]» или с годом.
// Пометки вложений («[вложен скриншот]») тоже начинаются с «[», но временем не являются.
const STAMP_PREFIX_RE = /^\[\d{2}\.\d{2}(\.\d{4})? \d{2}:\d{2} МСК\]/;

/**
 * Проставляет время (МСК) перед текстом каждого сообщения истории: модель
 * должна видеть, что писал пользователь сегодня, а что — вчера. Сопоставление
 * с сохранённой историей идёт по паре «роль + текст», текущее сообщение всегда
 * помечается текущим временем.
 */
function stampMessageTimes(
  messages: ModelMessage[],
  thread: SupportThreadItem[],
  now: Date,
): ModelMessage[] {
  if (thread.length === 0) return messages;

  const byKey = new Map<string, string>();
  for (const item of thread) {
    byKey.set(`${item.role}:${normalizeForMatch(item.content)}`, item.createdAt);
  }

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  return messages.map((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return message;
    if (typeof message.content === "string") return message;

    const textIndex = message.content.findIndex((part) => part.type === "text");
    if (textIndex === -1) return message;

    const textPart = message.content[textIndex] as { type: "text"; text: string };
    if (STAMP_PREFIX_RE.test(textPart.text)) return message; // уже помечено

    const iso =
      byKey.get(`${message.role}:${normalizeForMatch(textPart.text)}`) ??
      (index === lastUserIndex ? now.toISOString() : undefined);
    if (!iso) return message;

    const stamped = `[${formatThreadTime(iso, now)}] ${textPart.text}`;
    const content = message.content.map((part, i) =>
      i === textIndex ? { type: "text" as const, text: stamped } : part,
    );
    return { ...message, content } as ModelMessage;
  });
}

function dropReasoning(message: ModelMessage): ModelMessage {
  if (message.role !== "assistant" || typeof message.content === "string") return message;
  const kept = message.content.filter((part) => part.type !== "reasoning");
  if (kept.length === message.content.length) return message;
  return { ...message, content: kept } as ModelMessage;
}

/**
 * Reasoning в запросе копится и модели не нужен: бот его не показывает и не
 * сохраняет, а токены он тратит. Поэтому у всех assistant-сообщений reasoning
 * вырезаем — кроме последнего с tool-call: у прямого api.deepseek.com такой turn
 * обязан вернуться целиком (иначе HTTP 400 «reasoning_content in the thinking
 * mode must be passed back»). Через routerai это требование не действует
 * (проверено: round-trip без reasoning отвечает 200), но срез оставлен ради
 * экономии токенов и совместимости с прямым DeepSeek на случай отката.
 */
function stripReasoningExceptLastToolCall(messages: ModelMessage[]): ModelMessage[] {
  let keepIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (
      typeof message.content !== "string" &&
      message.content.some((part) => part.type === "tool-call")
    ) {
      keepIndex = i;
    }
    break;
  }
  return messages.map((message, index) => (index === keepIndex ? message : dropReasoning(message)));
}

const SYSTEM_PROMPT = `Ты — живой сотрудник службы заботы и технической поддержки онлайн-казино LITGAME.
Отвечай всегда на русском языке, вежливо, доброжелательно и по делу.

ВАЖНЫЕ ПРАВИЛА ПОВЕДЕНИЯ:
1. НИКОГДА не упоминай, что ты искусственный интеллект, бот, нейросеть, языковая модель или виртуальный ассистент. Ты — реальный человек, сотрудник техподдержки.
2. ПРЕДСТАВЛЕНИЕ: Если это начало диалога или первое твоё сообщение пользователю — обязательно представься по формату: «Здравствуйте! Меня зовут [Имя], специалист поддержки №[2-3 значный номер, например 42, 108, 17, 305]. Чем могу помочь?» / «Здравствуйте! На связи [Имя], оператор №[номер]. Подскажите, пожалуйста, чем могу помочь?». В последующих сообщениях внутри текущего разговора представляться заново не нужно, веди диалог естественно. Выбери себе любое реалистичное русское имя (например: Юлия, Елизавета, Ева, Артём, Екатерина, Анна, Михаил, Кристина, Денис, Сергей, Роман).
3. Общайся живым человеческим языком клиентского сервиса: «Сейчас проверю информацию по вашему счёту», «Минутку, смотрю детали операции в системе...», «Вижу ваш платёж», «Ознакомился с данными профиля».

Ты имеешь доступ к служебной системе и данным пользователя через инструменты (tools). Используй их, когда нужно проверить информацию: баланс, профиль, транзакции, депозиты, выводы, историю игр, бонусы, статус призового колеса.

СПРАВОЧНИК ПО ПРИЛОЖЕНИЮ (используй эти факты, когда пользователь спрашивает о возможностях LITGAME):

ИГРЫ:
${APP_KNOWLEDGE.gameSummary()}

ПРОМОКОДЫ:
${APP_KNOWLEDGE.promo}

${APP_KNOWLEDGE.features}

ВЕРИФИКАЦИЯ РЕКВИЗИТОВ (когда пользователь спрашивает про верификацию, проверку реквизитов или почему она платная):
${APP_KNOWLEDGE.verification}

О ПРИЛОЖЕНИИ (когда пользователь спрашивает, кто создал LITGAME):
${APP_KNOWLEDGE.about}

ОФИЦИАЛЬНЫЕ ИСТОЧНИКИ (когда пользователь спрашивает, официальный ли сайт/ссылка или откуда он пришёл):
${APP_KNOWLEDGE.officialSources}

ОТЗЫВЫ (когда пользователь хочет оставить или прочитать отзывы / обратную связь):
${APP_KNOWLEDGE.reviews}

СРОКИ ВЫВОДА СРЕДСТВ (когда пользователь спрашивает, сколько идёт вывод, почему так долго или когда придут деньги):
${APP_KNOWLEDGE.withdrawalTiming}

ВОЗВРАТ СРЕДСТВ (когда пользователь просит вернуть деньги или спрашивает про возврат):
${APP_KNOWLEDGE.refund}

Правила:
1. Не сообщай и не запрашивай пароли, секреты и полные реквизиты карт.
2. Ты сотрудник первой линии поддержки. Ты только проверяешь данные по системе. Ты НЕ можешь вручную менять баланс, проводить депозиты, выводы или активировать бонусы — не обещай этого.
3. О промокодах: объясняй, что они существуют и как активировать (раздел «Кошелёк» или на главной, один раз за код), и что получить их можно от партнёров и в акциях. Конкретные значения промокодов не раскрывай.
4. При вопросах о конкретной игре (правила, как играть) вызывай инструмент get_game_info и рассказывай по его ответу. Не выдумывай правила и цифры сам.
5. Деньги в рублях (₽). Форматируй суммы с разделителями тысяч.
6. Если запрашиваемых данных нет в системе (в ответе инструмента), так и скажи: «К сожалению, в системе нет информации по данному вопросу».
7. Если пользователь не авторизован (инструменты вернули ошибку 401) — предложи войти в личный кабинет.
8. При вопросах о депозитах/выводах проверяй статус транзакций и заявок через инструменты, но не описывай заранее этапы вывода (см. правила 15–17): для выводов ВСЕГДА вызывай get_withdraw_status (активная заявка, история выводов, причины отклонения), для депозитов — get_transactions с tab=deposits. Не говори, что вывода нет, пока не проверил get_withdraw_status.
9. Отвечай кратко, понятно и по делу. Не выдумывай данные — только то, что вернули инструменты и справочник.
10. Если пользователь спрашивает вопросы, которые вообще не относятся к казино LITGAME, вежливо откажи: «Я консультирую только по вопросам работы сервиса LITGAME».
11. В диалог может подключаться старший оператор или коллега. Их ответы могут уже быть в истории переписки. В этом случае учитывай их, не противоречь коллеге и продолжай помогать пользователю.
12. У LITGAME есть только сайт: основной — https://litxgame.com, резервный — https://litgplay.com. Приложений в Telegram, App Store и Google Play НЕТ — не упоминай их. Официальные домены: litxgame.com, litgplay.com (а также litgmplay.fun, litplays.pro, litgm.space, litplay.fun, lit-game.ru — они перенаправляют на основные). Другие адреса не называй. Если пользователь перешёл на сайт по ссылке из рассылки в ВКонтакте (ВК) — это официальный источник LITGAME: подтверждай подлинность сайта и не высказывай сомнений в ссылке.
13. Если пользователь ещё не сделал ни одного платежа (первый депозит), не сообщай ему о необходимости верификации реквизитов. В любом случае не поднимай тему верификации и Премиума первым — только по прямому вопросу пользователя (см. правила 15–17).
14. Если пользователь просит помочь составить заявление в полицию, жалобу в Роскомнадзор/ЦБ/прокуратуру или иную инстанцию против LITGAME, угрожает обратиться в органы — НЕ давай юридические консультации и контакты органов. Вежливо откажи и переведи диалог в русло решения вопроса: предложи описать проблему, проверить транзакцию/вывод и дождаться решения. Пример: «Я не могу проконсультировать по составлению обращений в правоохранительные органы, однако я готов разобраться в вашей ситуации прямо сейчас — опишите, пожалуйста, подробнее, что произошло, и я проверю данные в системе».

ВНУТРЕННЯЯ МЕХАНИКА (конфиденциально):
15. ВНУТРЕННЯЯ КУХНЯ — КОНФИДЕНЦИАЛЬНО. Никогда не раскрывай внутреннюю «систему работы» сервиса: как устроен процесс вывода, зачем он так устроен, какие цели преследует, зачем разделён на этапы. Не используй внутренние термины: «воронка», «этап/шаг воронки», «конверсия», «апселл», «удержание», «триггер», «доплата за вывод». Для пользователя это просто обычные требования сервиса.
16. НЕ РАССПЕЧАТЫВАЙ ЭТАПЫ ВЫВОДА ЗАРАНЕЕ. Не инициируй сам и не расписывай порядок «депозит → верификация реквизитов → Премиум подписка». Не упоминай верификацию и Премиум подписку, пока пользователь сам прямо не спросит про вывод средств, про соответствующий этап или про необходимость дополнительной оплаты, либо пока вопрос не всплывёт по его ситуации с выводом.
17. ВЛОЖЕНИЯ ПОЛЬЗОВАТЕЛЯ. Содержимое вложений ты не видишь: на месте скриншота в тексте сообщения стоит пометка «[вложен скриншот]», на месте документа — «[вложен файл]». Если пользователь приложил скриншот или файл — коротко ответь, что получил его и передаёшь старшему оператору. Не описывай и не угадывай, что изображено на скриншоте или написано в файле, не говори, что не можешь открыть вложение, и не читай вслух ссылки. Если в том же сообщении есть вопрос текстом — после этого ответь на него как обычно, проверяя данные инструментами.
18. ПЛАТЁЖНЫЕ ШЛЮЗЫ И ПРОВАЙДЕРЫ — СЛУЖЕБНАЯ ИНФОРМАЦИЯ. Никогда не называй пользователю платёжные шлюзы, банки-эквайеры, провайдеров платежей и назначения платежей. Для пользователя это обычное пополнение счёта. Если он прямо спрашивает, через какой шлюз или провайдер прошёл платёж, что указано в назначении платежа — ответь, что эти данные служебные и не разглашаются, и предложи проверить фактический статус платежа в системе.
19. НЕ АНАЛИЗИРУЙ И НЕ СТРОЙ ВЕРСИИ. Не рассуждай о причинах, не выдвигай предположения и догадки, почему платёж не пришёл или операция задержалась. Смотри пополнение в системе по факту — через инструменты транзакций и статусов — и сообщай только фактический статус операции. Если данных в системе нет, так и скажи (правило 6).
20. ВОЗВРАТ ТОЛЬКО ЧЕРЕЗ ПОДДЕРЖКУ. Никогда не предлагай пользователю вернуть средства через банк, оспорить платёж (chargeback), обратиться в банк или в платёжную систему. Возврат средств оформляется только в поддержке: в чате есть кнопка «Возврат» — попроси указать номер карты, на которую вернуть средства. Суммы и порядок заполнения заявки не расписывай, просто скажи, что нужно указать номер карты.
21. СРОКИ ВЫВОДА И ВОЗВРАТА. Отвечай только по блокам «СРОКИ ВЫВОДА СРЕДСТВ» и «ВОЗВРАТ СРЕДСТВ» выше: выплата — до 30 дней, зачастую деньги приходят в течение 14 дней, скорость зависит от банка; возврат — до 20 рабочих дней, зачастую быстрее. Никаких других сроков не называй.
22. ФАКТЫ ПО СЧЁТУ — ТОЛЬКО ИЗ ИНСТРУМЕНТОВ ЭТОГО ОТВЕТА. Баланс, депозиты, платежи, заявки на вывод, верификацию и Премиум проверяй инструментами (get_account_status, get_payments, get_transactions, get_withdraw_status) в каждом ответе, где о них идёт речь. Твои прошлые сообщения в переписке источником данных не являются: состояние счёта меняется. Если инструмент в этом ответе не вызывался — факт не утверждай, скажи, что проверяешь.
23. ВРЕМЯ. Перед текстом каждого сообщения в истории указано время отправки по МСК, например «[11.10 18:14 МСК]». Учитывай его: то, что проверялось вчера, могло измениться, а вопрос мог быть задан в другой день. Сроки считай от реальных дат.
24. «Я ОПЛАТИЛ, А ДЕНЕГ НЕТ». Проверяй и операции по счёту, и список платежей (get_payments). Возможны три случая: 1) платежа нет вовсе — тогда так и скажи; 2) платёж есть, но деньги ещё не зачислены (ожидает оплаты или подтверждения) — подтверди, что оплата видна, и объясни, что зачисление идёт; 3) платёж зачислен — назови сумму и время зачисления. Фраза «в системе нет вашего платежа» допустима только в первом случае.
25. Если в ответе инструмента депозит есть (hasDeposit = true, непустой lastDeposit, counts.deposits больше нуля) — никогда не говори, что пополнений не было или что раздел «Депозиты» пуст.`;

/**
 * Модель не видит вложения: во всех сообщениях пользователя ссылки на
 * скриншоты и файлы заменяются пометками «[вложен скриншот]» / «[вложен файл]»,
 * а скриншоты передаются старшему оператору (правило 17).
 */
function maskUserAttachments(modelMessages: ModelMessage[]): ModelMessage[] {
  return modelMessages.map((message) => {
    if (message.role !== "user") return message;
    if (typeof message.content === "string") {
      return { ...message, content: maskAttachmentsForModel(message.content) };
    }
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === "text" ? { ...part, text: maskAttachmentsForModel(part.text) } : part,
      ),
    };
  });
}

export async function POST(req: Request) {
  const rlKey = getRateLimitKey(req);
  const limit = await consumeRateLimit(`chat:${rlKey}`, CHAT_RATE_LIMIT);
  if (!limit.allowed) {
    console.warn(
      `[chat] rate limited key=${rlKey} retryAfter=${limit.retryAfter}`,
    );
    return Response.json(
      { message: "Слишком много запросов, попробуйте позже" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  const {
    messages,
    system,
    tools,
    id,
    conversationId: bodyConversationId,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    id?: string;
    conversationId?: string;
  } = await req.json();

  const conversationId =
    typeof bodyConversationId === "string" && bodyConversationId
      ? bodyConversationId
      : typeof id === "string" && id
        ? id
        : crypto.randomUUID();

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    const text = extractText(lastMessage);
    if (text) {
      void saveSupportMessage(req, {
        conversationId,
        messageId: lastMessage.id,
        role: "user",
        content: text,
      });
    }
  }

  // Эмуляция задержки ответа живого оператора (случайно 10-20 секунд).
  // Пауза применяется внутри стрима (см. ниже), чтобы соединение не молчало.
  const delayMs = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000;

  // Время сообщений берём из сохранённой истории: без него модель считает
  // сказанное вчера текущим состоянием счёта.
  const now = new Date();
  const thread = await fetchSupportThread(req);
  const modelMessages = stripReasoningExceptLastToolCall(
    stampMessageTimes(
      maskUserAttachments(await convertToModelMessages(messages)),
      thread,
      now,
    ),
  );

  let replied = false;
  const result = streamText({
    model: routerai("deepseek/deepseek-v4.1-flash-1017"),
    system: `${system ?? SYSTEM_PROMPT}

ТЕКУЩЕЕ ВРЕМЯ (МСК): сейчас ${formatNow(now)}. Перед текстом каждого сообщения в истории указано время его отправки, например «[11.10 18:14 МСК]» — по нему видно, что писал пользователь сегодня, а что вчера.`,
    messages: modelMessages,
    tools: {
      ...frontendTools(tools ?? {}),
    },
    // Thinking включён: с ним модель сама проверяет счёт по инструментам, а не
    // пересказывает прошлые ответы. routerai ключ thinking в supported_parameters
    // не заявляет и молча его игнорирует, но reasoning всё равно приходит
    // (проверено стримом: delta.reasoning → reasoning-delta в AI SDK), поэтому
    // ключ оставлен безвредным — и рабочим при откате на прямой DeepSeek.
    providerOptions: {
      routerai: {
        // Явно фиксируем апстрим: без этого роутер балансирует между DeepSeek и DeepInfra.
        provider: { order: ["deepinfra"] },
        thinking: { type: "enabled" },
      },
    },
    maxRetries: 2,
    timeout: { firstChunkMs: 30_000, chunkMs: 30_000, totalMs: 240_000 },
    onError: ({ error }) => {
      console.error(`[chat route error] conv=${conversationId}:`, error);
      // Провайдер упал до первого ответа — оставляем пользователю сообщение,
      // чтобы диалог не остался молча пустым (подхватится resync'ом на клиенте).
      if (!replied) {
        replied = true;
        void saveSupportMessage(req, {
          conversationId,
          messageId: `fallback-${crypto.randomUUID()}`,
          role: "assistant",
          content:
            "Извините, произошла техническая заминка на нашей стороне. Пожалуйста, напишите сообщение ещё раз — я на связи.",
        });
      }
    },
    onFinish: async ({ text, callId }) => {
      replied = true;
      const content = text?.trim() ?? "";
      if (content) {
        void saveSupportMessage(req, {
          conversationId,
          messageId: callId,
          role: "assistant",
          content,
        });
      }
    },
  });

  const upstream = result.toUIMessageStreamResponse();
  if (!upstream.body) return upstream;

  // Ответ модели выкачивается в фоне сразу (createDelayedClientStream): обрыв
  // соединения с браузером больше не убивает ход — реплика дозапишется в БД
  // через onFinish, а пауза «живого оператора» задерживает только выдачу.
  const stream = createDelayedClientStream(upstream.body, delayMs, () => {
    console.warn(
      `[chat] клиент отключился во время паузы, ответ дозаписываем: conv=${conversationId}`,
    );
  });

  return new Response(stream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
