import imageCompression from 'browser-image-compression';

const TARGET_KB = 280;
const TARGET_MB = TARGET_KB / 1024;
const MAX_DIM = 1280;

export async function compressToWebp(
  file: File,
  maxDim = MAX_DIM,
  quality = 0.65,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/webp' && file.size <= TARGET_KB * 1024) return file;

  try {
    const out = await imageCompression(file, {
      maxSizeMB: TARGET_MB,
      maxWidthOrHeight: maxDim,
      initialQuality: quality,
      fileType: 'image/webp',
      useWebWorker: true,
      alwaysKeepResolution: false,
    });

    // Library may fallback to original type on some browsers; keep webp if possible
    if (out.type !== 'image/webp') {
      return out as File;
    }

    const webpName = file.name.replace(/\.[^.]+$/, '') + '.webp';
    // imageCompression preserves name but may keep original ext; force .webp
    if (out.name.endsWith('.webp')) return out as File;
    return new File([out], webpName, { type: 'image/webp' });
  } catch {
    return file;
  }
}
