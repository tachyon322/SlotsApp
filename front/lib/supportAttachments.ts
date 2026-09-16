import { supportApi } from "./api";
import { compressToWebp } from "./imageCompress";

export const MAX_SUPPORT_FILE_SIZE = 10 * 1024 * 1024;

export const ALLOWED_SUPPORT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

export type SupportAttachmentKind = "image" | "file";

export type SupportContentPart =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "file"; url: string; label: string };

// Может поймать как markdown-картинку (![a](url)), так и обычную ссылку ([a](url)).
const ATTACHMENT_RE = /(!?)\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
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

/**
 * Разбирает текст сообщения на части, выделяя ссылки на прикреплённые файлы.
 * Обычные ссылки (не картинка и не файл) остаются текстом как есть.
 */
export function parseSupportContent(content: string): SupportContentPart[] {
  const parts: SupportContentPart[] = [];
  const re = new RegExp(ATTACHMENT_RE.source, "g");
  let last = 0;

  for (const match of content.matchAll(re)) {
    const index = match.index ?? 0;
    const isMarkdownImage = match[1] === "!";
    const label = match[2].trim();
    const url = match[3];
    const asImage = isMarkdownImage || isImageUrl(url);
    const asFile = !asImage && FILE_EXT_RE.test(url);
    if (!asImage && !asFile) continue;

    const text = content.slice(last, index).trim();
    if (text) parts.push({ type: "text", text });

    if (asImage) parts.push({ type: "image", url });
    else parts.push({ type: "file", url, label: label || fileNameFromUrl(url) });

    last = index + match[0].length;
  }

  const tail = content.slice(last).trim();
  if (tail) parts.push({ type: "text", text: tail });

  return parts;
}

/** Короткое превью для списков: ссылки на файлы заменяются на пометку. */
export function stripSupportAttachments(content: string): string {
  return content.replace(
    new RegExp(ATTACHMENT_RE.source, "g"),
    (full: string, bang: string, label: string, url: string) => {
      if (bang === "!" || isImageUrl(url)) return "📎 изображение";
      if (FILE_EXT_RE.test(url)) return `📎 ${label.trim() || fileNameFromUrl(url)}`;
      return full;
    },
  );
}

/** Заливает файл напрямую в S3 по presigned-URL и отдаёт публичную ссылку. */
export async function uploadSupportFile(
  file: File,
): Promise<{ publicUrl: string; kind: SupportAttachmentKind; name: string }> {
  const contentType = (file.type || "").toLowerCase();
  if (!ALLOWED_SUPPORT_MIME.has(contentType)) {
    throw new Error("Можно прикрепить изображение PNG, JPG, WEBP или PDF");
  }
  if (file.size <= 0 || file.size > MAX_SUPPORT_FILE_SIZE) {
    throw new Error("Размер файла должен быть до 10 МБ");
  }

  const toUpload =
    contentType.startsWith("image/") ? await compressToWebp(file) : file;
  const uploadType = (toUpload.type || contentType).toLowerCase();

  const presign = await supportApi.presignUpload({
    filename: toUpload.name,
    contentType: uploadType,
    size: toUpload.size,
  });

  const res = await fetch(presign.url, {
    method: "PUT",
    body: toUpload,
    headers: { "Content-Type": uploadType },
  });
  if (!res.ok) {
    throw new Error("Не удалось загрузить файл, попробуйте ещё раз");
  }

  return {
    publicUrl: presign.publicUrl,
    kind: uploadType.startsWith("image/") ? "image" : "file",
    name: file.name,
  };
}

/** Markdown-сниппет вложения, который подставляется в текст сообщения. */
export function supportAttachmentSnippet(
  url: string,
  kind: SupportAttachmentKind,
  name: string,
): string {
  return kind === "image"
    ? `![скриншот](${url})`
    : `[${name || "файл"}](${url})`;
}
