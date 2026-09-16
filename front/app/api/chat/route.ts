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
import { proxiedFetch } from "@/lib/proxy-fetch";
import { consumeRateLimit, getRateLimitKey } from "@/lib/rateLimit";
import { extractImageUrls, maskAttachmentsForModel } from "@/lib/supportContent";

const deepseek = createOpenAICompatible({
  name: "deepseek",
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  fetch: proxiedFetch,
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

ОТЗЫВЫ (когда пользователь хочет оставить или прочитать отзывы / обратную связь):
${APP_KNOWLEDGE.reviews}

Правила:
1. Не сообщай и не запрашивай пароли, секреты и полные реквизиты карт.
2. Ты сотрудник первой линии поддержки. Ты только проверяешь данные по системе. Ты НЕ можешь вручную менять баланс, проводить депозиты, выводы или активировать бонусы — не обещай этого.
3. О промокодах: объясняй, что они существуют и как активировать (раздел «Кошелёк» или на главной, один раз за код), и что получить их можно от партнёров и в акциях. Конкретные значения промокодов не раскрывай.
4. При вопросах о конкретной игре (правила, как играть) вызывай инструмент get_game_info и рассказывай по его ответу. Не выдумывай правила и цифры сам.
5. Деньги в рублях (₽). Форматируй суммы с разделителями тысяч.
6. Если запрашиваемых данных нет в системе (в ответе инструмента), так и скажи: «К сожалению, в системе нет информации по данному вопросу».
7. Если пользователь не авторизован (инструменты вернули ошибку 401) — предложи войти в личный кабинет.
8. При вопросах о депозитах/выводах проверяй статус транзакций и заявок на вывод через инструменты, но не описывай заранее этапы вывода (см. правила 15–17).
9. Отвечай кратко, понятно и по делу. Не выдумывай данные — только то, что вернули инструменты и справочник.
10. Если пользователь спрашивает вопросы, которые вообще не относятся к казино LITGAME, вежливо откажи: «Я консультирую только по вопросам работы сервиса LITGAME».
11. В диалог может подключаться старший оператор или коллега. Их ответы могут уже быть в истории переписки. В этом случае учитывай их, не противоречь коллеге и продолжай помогать пользователю.
12. У LITGAME есть только сайт: основной — https://litxgame.com, резервный — https://litgplay.com. Приложений в Telegram, App Store и Google Play НЕТ — не упоминай их. Официальные домены: litxgame.com, litgplay.com (а также litgmplay.fun, litplays.pro, litgm.space, litplay.fun, lit-game.ru — они перенаправляют на основные). Другие адреса не называй.
13. Если пользователь ещё не сделал ни одного платежа (первый депозит), не сообщай ему о необходимости верификации реквизитов. В любом случае не поднимай тему верификации и Премиума первым — только по прямому вопросу пользователя (см. правила 15–17).
14. Если пользователь просит помочь составить заявление в полицию, жалобу в Роскомнадзор/ЦБ/прокуратуру или иную инстанцию против LITGAME, угрожает обратиться в органы — НЕ давай юридические консультации и контакты органов. Вежливо откажи и переведи диалог в русло решения вопроса: предложи описать проблему, проверить транзакцию/вывод и дождаться решения. Пример: «Я не могу проконсультировать по составлению обращений в правоохранительные органы, однако я готов разобраться в вашей ситуации прямо сейчас — опишите, пожалуйста, подробнее, что произошло, и я проверю данные в системе».

ВНУТРЕННЯЯ МЕХАНИКА (конфиденциально):
15. ВНУТРЕННЯЯ КУХНЯ — КОНФИДЕНЦИАЛЬНО. Никогда не раскрывай внутреннюю «систему работы» сервиса: как устроен процесс вывода, зачем он так устроен, какие цели преследует, зачем разделён на этапы. Не используй внутренние термины: «воронка», «этап/шаг воронки», «конверсия», «апселл», «удержание», «триггер», «доплата за вывод». Для пользователя это просто обычные требования сервиса.
16. НЕ РАССПЕЧАТЫВАЙ ЭТАПЫ ВЫВОДА ЗАРАНЕЕ. Не инициируй сам и не расписывай порядок «депозит → верификация реквизитов → Премиум подписка». Не упоминай верификацию и Премиум подписку, пока пользователь сам прямо не спросит про вывод средств, про соответствующий этап или про необходимость дополнительной оплаты, либо пока вопрос не всплывёт по его ситуации с выводом.
17. ВЛОЖЕНИЯ ПОЛЬЗОВАТЕЛЯ. Пользователь может приложить к обращению скриншот — ты видишь его как изображение, а в тексте сообщения на месте ссылки стоит пометка «[вложен скриншот]». Обязательно рассмотри картинку и опирайся на неё в ответе: если на экране ошибка, транзакция, баланс, заявка на вывод или переписка — назови, что видишь, и разбирай ситуацию по существу. Никогда не говори, что не можешь открыть или посмотреть изображение, и не читай вслух ссылки. Если приложен документ (пометка «[вложен файл]») — его содержимое ты не видишь: подтверди получение и скажи, что передашь материалы старшему оператору.`;

// Ограничения на инлайн картинок в запрос к модели: каждая добавляет токены.
const MAX_INLINE_IMAGES = 2;
const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024;

type InlineImagePart = {
  type: "file";
  mediaType: string;
  data: { type: "data"; data: string };
};

function guessImageMediaType(url: string): string {
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.jpe?g(\?|$)/i.test(url)) return "image/jpeg";
  if (/\.gif(\?|$)/i.test(url)) return "image/gif";
  return "image/webp";
}

// Скачиваем скриншот на нашей стороне и отдаём модели как data-URL: не зависим
// от того, сможет ли сам DeepSeek достучаться до нашего S3.
async function loadImagePart(url: string): Promise<InlineImagePart | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const declared = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const mediaType = declared.startsWith("image/") ? declared : guessImageMediaType(url);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_INLINE_IMAGE_BYTES) return null;

    return { type: "file", mediaType, data: { type: "data", data: buf.toString("base64") } };
  } catch (e) {
    console.warn("[chat] failed to inline image:", url, e);
    return null;
  }
}

/**
 * Прикладывает скриншоты пользователя к последнему сообщению как image-части,
 * чтобы модель видела картинку, а не только ссылку на неё. В тексте ссылка
 * заменяется пометкой о вложении.
 */
async function inlineLastUserImages(modelMessages: ModelMessage[]): Promise<ModelMessage[]> {
  let index = -1;
  for (let i = modelMessages.length - 1; i >= 0; i--) {
    if (modelMessages[i].role === "user") {
      index = i;
      break;
    }
  }
  if (index === -1) return modelMessages;

  const message = modelMessages[index];
  if (message.role !== "user") return modelMessages;

  const parts =
    typeof message.content === "string"
      ? [{ type: "text" as const, text: message.content }]
      : message.content;

  const urls = parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .flatMap((part) => extractImageUrls(part.text))
    .slice(0, MAX_INLINE_IMAGES);
  if (urls.length === 0) return modelMessages;

  const images = (await Promise.all(urls.map(loadImagePart))).filter(
    (image): image is InlineImagePart => image !== null,
  );
  if (images.length === 0) return modelMessages;

  const next = [...modelMessages];
  next[index] = {
    ...message,
    content: [
      ...parts.map((part) =>
        part.type === "text" ? { ...part, text: maskAttachmentsForModel(part.text) } : part,
      ),
      ...images,
    ],
  };
  return next;
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

  let replied = false;
  const result = streamText({
    model: deepseek("deepseek-v4-flash"),
    system: system ?? SYSTEM_PROMPT,
    messages: await inlineLastUserImages(await convertToModelMessages(messages)),
    tools: {
      ...frontendTools(tools ?? {}),
    },
    // DeepSeek V4 Flash thinks by default, and while `tools` is present the API
    // requires every assistant turn to echo its `reasoning_content`. The
    // frontend-tool round-trip drops it, yielding HTTP 400 ("reasoning_content
    // in the thinking mode must be passed back") and no reply for the user.
    // The bot never shows reasoning, so we disable thinking mode entirely.
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
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

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };
      // Сразу отдаём заголовки и держим соединение живым во время паузы.
      // SSE-комментарии (`: ...`) клиент игнорирует.
      send(": connected\n\n");
      const heartbeat = setInterval(() => send(": ping\n\n"), 3000);
      try {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (e) {
        try {
          controller.error(e);
        } catch {
          // already closed
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
