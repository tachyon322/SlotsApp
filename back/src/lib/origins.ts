export function allowedOrigins(): string[] {
  const list = (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return list;
  const single = process.env.FRONTEND_ORIGIN;
  return single ? [single] : [];
}
