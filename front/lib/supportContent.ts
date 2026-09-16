export type SupportContentPart =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "file"; url: string; label: string };

// Может поймать как markdown-картинку (![a](url)), так и обычную ссылку ([a](url)).
export const ATTACHMENT_RE_SOURCE = "(!?)\\[([^\\]]*)\\]\\((https?:\\/\\/[^\\s)]+)\\)";

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;
const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|txt|csv|zip)(\?.*)?$/i;

export function isImageUrl(url: string): boolean {
  return IMAGE_EXT_RE.test(url);
}

function fileNameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    return decodeURIComponent(name) || "файл";
  } catch {
    return "файл";
  }
}

function isAttachment(url: string, isMarkdownImage: boolean): boolean {
  return isMarkdownImage || isImageUrl(url) || FILE_EXT_RE.test(url);
}

/**
 * Разбирает текст сообщения на части, выделяя ссылки на прикреплённые файлы.
 * Обычные ссылки (не картинка и не файл) остаются текстом как есть.
 */
export function parseSupportContent(content: string): SupportContentPart[] {
  const parts: SupportContentPart[] = [];
  const re = new RegExp(ATTACHMENT_RE_SOURCE, "g");
  let last = 0;

  for (const match of content.matchAll(re)) {
    const index = match.index ?? 0;
    const isMarkdownImage = match[1] === "!";
    const label = match[2].trim();
    const url = match[3];
    if (!isAttachment(url, isMarkdownImage)) continue;

    const text = content.slice(last, index).trim();
    if (text) parts.push({ type: "text", text });

    if (isMarkdownImage || isImageUrl(url)) {
      parts.push({ type: "image", url });
    } else {
      parts.push({ type: "file", url, label: label || fileNameFromUrl(url) });
    }

    last = index + match[0].length;
  }

  const tail = content.slice(last).trim();
  if (tail) parts.push({ type: "text", text: tail });

  return parts;
}

/** Ссылки на изображения из текста сообщения (в порядке появления). */
export function extractImageUrls(content: string): string[] {
  return parseSupportContent(content)
    .filter((part): part is { type: "image"; url: string } => part.type === "image")
    .map((part) => part.url);
}

/** Короткое превью для списков: ссылки на файлы заменяются на пометку. */
export function stripSupportAttachments(content: string): string {
  return content.replace(
    new RegExp(ATTACHMENT_RE_SOURCE, "g"),
    (full: string, bang: string, label: string, url: string) => {
      if (!isAttachment(url, bang === "!")) return full;
      if (bang === "!" || isImageUrl(url)) return "📎 изображение";
      return `📎 ${label.trim() || fileNameFromUrl(url)}`;
    },
  );
}

/**
 * Текст для модели: вместо ссылок на файлы — пометка о вложении.
 * Сами картинки уходят в модель отдельными image-частями.
 */
export function maskAttachmentsForModel(content: string): string {
  return content.replace(
    new RegExp(ATTACHMENT_RE_SOURCE, "g"),
    (full: string, bang: string, _label: string, url: string) => {
      if (!isAttachment(url, bang === "!")) return full;
      if (bang === "!" || isImageUrl(url)) return "[вложен скриншот]";
      return "[вложен файл]";
    },
  );
}
