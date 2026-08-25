export async function compressToWebp(
  file: File,
  maxDim = 1920,
  quality = 0.8,
): Promise<File> {
  // If already webp and small, return as is
  if (file.type === 'image/webp' && file.size < 300 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    if (scale < 1) {
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve as BlobCallback, 'image/webp', quality),
    );
    if (!blob) return file;

    // If webp is larger than original, keep original (except for png which benefits)
    if (blob.size >= file.size && file.type !== 'image/png') {
      return file;
    }

    const webpName = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], webpName, { type: 'image/webp' });
  } catch {
    return file;
  }
}
