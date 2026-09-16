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
