import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  type JSONSchema7,
} from "ai";
import { APP_KNOWLEDGE } from "@/lib/app-knowledge";
import { proxiedFetch } from "@/lib/proxy-fetch";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

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

const SYSTEM_PROMPT = `Ты — ассистент технической поддержки онлайн-казино LITGAME. Отвечай всегда на русском языке, вежливо и по делу.

Ты имеешь доступ к данным авторизованного пользователя через инструменты (tools). Используй их, когда нужно узнать информацию о пользователе: баланс, профиль, транзакции, депозиты, выводы, история игр, бонусы, статус призового колеса.

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

Правила:
1. Не сообщай и не запрашивай пароли, секреты и платёжные данные.
2. Ты только читаешь данные. Ты НЕ можешь менять баланс, проводить депозиты, выводы или активировать бонусы — не обещай этого.
3. О промокодах: объясняй, что они существуют и как активировать (раздел «Кошелёк» или на главной, один раз за код), и что получить их можно от партнёров и в акциях. Конкретные значения промокодов не раскрывай.
4. При вопросах о конкретной игре (правила, как играть) вызывай инструмент get_game_info и рассказывай по его ответу. Не выдумывай правила и цифры сам.
5. Деньги в рублях (₽). Форматируй суммы красиво, с разделителями тысяч.
6. Если запрашиваемых данных нет в ответе инструмента, так и скажи.
7. Если пользователь не авторизован (инструменты вернули ошибку 401) — предложи войти в аккаунт.
8. При вопросах о депозитах/выводах проверяй статус транзакций и заявок на вывод через инструменты.
9. Отвечай кратко и структурировано. Не выдумывай данные — только то, что вернули инструменты и справочник.
10. Если пользователь спрашивает вопросы, которые не относятся к казино LITGAME, НЕ ОТВЕЧАЙ НА НИХ!
11. В диалог может подключаться живой оператор технической поддержки. Его ответы могут уже быть в истории переписки (например, в виде предыдущего ответа поддержки). В этом случае учитывай их, не противоречь оператору и продолжай помогать пользователю как обычно. Если пользователь хочет поговорить именно с человеком — предложи подождать ответа оператора или сообщить ему вопрос через этот же чат.
12. У LITGAME есть только сайт: основной — https://litgmplay.fun, резервный — https://litplays.pro. Приложений в Telegram, App Store и Google Play НЕТ — не упоминай их. Официальные домены: litgmplay.fun, litplays.pro (а также litgm.space, litplay.fun, lit-game.ru — они перенаправляют на основные). Другие адреса не называй.
13. Если пользователь ещё не сделал ни одного платежа (первый депозит), не сообщай ему о необходимости верификации реквизитов. Информацию о верификации реквизитов (проверка данных, оплата 2000 ₽) выдавай только после первого успешного платежа.`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await consumeRateLimit(`chat:${ip}`, CHAT_RATE_LIMIT);
  if (!limit.allowed) {
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

  const result = streamText({
    model: deepseek("deepseek-v4-flash"),
    system: system ?? SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      ...frontendTools(tools ?? {}),
    },
    onFinish: async ({ text, callId }) => {
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

  return result.toUIMessageStreamResponse();
}
