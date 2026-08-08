import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  type JSONSchema7,
} from "ai";
import { APP_KNOWLEDGE } from "@/lib/app-knowledge";

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

export const maxDuration = 60;

const SYSTEM_PROMPT = `Ты — ассистент технической поддержки онлайн-казино LITGAME. Отвечай всегда на русском языке, вежливо и по делу.

Ты имеешь доступ к данным авторизованного пользователя через инструменты (tools). Используй их, когда нужно узнать информацию о пользователе: баланс, профиль, транзакции, депозиты, выводы, история игр, бонусы, статус призового колеса.

СПРАВОЧНИК ПО ПРИЛОЖЕНИЮ (используй эти факты, когда пользователь спрашивает о возможностях LITGAME):

ИГРЫ:
${APP_KNOWLEDGE.gameSummary()}

ПРОМОКОДЫ:
${APP_KNOWLEDGE.promo}

${APP_KNOWLEDGE.features}

Правила:
1. Не сообщай и не запрашивай пароли, секреты и платёжные данные.
2. Ты только читаешь данные. Ты НЕ можешь менять баланс, проводить депозиты, выводы или активировать бонусы — не обещай этого.
3. О промокодах: объясняй, что они существуют и как активировать (раздел «Кошелёк» или на главной, один раз за код), и что получить их можно от партнёров и в акциях. Конкретные значения промокодов не раскрывай.
4. При вопросах о конкретной игре (правила, как играть) вызывай инструмент get_game_info и рассказывай по его ответу. Не выдумывай правила и цифры сам.
5. Деньги в рублях (₽). Форматируй суммы красиво, с разделителями тысяч.
6. Если запрашиваемых данных нет в ответе инструмента, так и скажи.
7. Если пользователь не авторизован (инструменты вернули ошибку 401) — предложи войти в аккаунт.
8. При вопросах о депозитах/выводах проверяй статус транзакций и заявок на вывод через инструменты.
9. Отвечай кратко и структурировано. Не выдумывай данные — только то, что вернули инструменты и справочник.`;

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  const result = streamText({
    model: openrouter("poolside/laguna-s-2.1:free"),
    system: system ?? SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      ...frontendTools(tools ?? {}),
    },
  });

  return result.toUIMessageStreamResponse();
}
