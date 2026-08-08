import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Коллизия имён в Tailwind v4: шкала --spacing-{xs..4xl} из @theme
// перетирает именованные контейнерные размеры max-w-{xs..4xl},
// из-за чего они компилируются в десятки пикселей вместо сотен.
const POISONED_MAX_W =
  /(?:^|\s)max-w-(?:2xs|xs|sm|md|lg|xl|2xl|3xl|4xl)(?:\s|$)/;

const noPoisonedMaxW = {
  meta: {
    type: "problem",
    docs: {
      description:
        "max-w-{2xs..4xl} компилируется в маленькую ширину из-за коллизии со шкалой --spacing-*. Используйте max-w-5xl или произвольное max-w-[...].",
    },
    messages: {
      poisoned:
        "Запрещённый класс '{{ cls }}': max-w-{xs..4xl} перекрывается токенами --spacing-* и даёт ширину в пикселях. Используйте max-w-5xl или max-w-[...].",
    },
    schema: [],
  },
  create(context) {
    const check = (text, node) => {
      const match = text.match(POISONED_MAX_W);
      if (match) {
        context.report({
          node,
          messageId: "poisoned",
          data: { cls: match[0].trim() },
        });
      }
    };

    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" || !node.value) return;
        if (node.value.type === "Literal" && typeof node.value.value === "string") {
          check(node.value.value, node.value);
        } else if (node.value.type === "TemplateLiteral") {
          const text = node.value.quasis.map((q) => q.value.raw).join("");
          check(text, node.value);
        }
      },
    };
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    plugins: {
      custom: {
        rules: {
          "no-poisoned-max-w": noPoisonedMaxW,
        },
      },
    },
    rules: {
      "custom/no-poisoned-max-w": "error",
    },
  },
];

export default eslintConfig;
