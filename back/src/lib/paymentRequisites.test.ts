import { describe, expect, test } from "bun:test";
import { parseStoredRequisites, sanitizeRequisites } from "./paymentRequisites";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("sanitizeRequisites", () => {
  test("QR-картинка и поля проходят", () => {
    expect(
      sanitizeRequisites({ method: "qr-code", kind: "text", value: PNG, bank: "Сбер", payAmount: "499.00" }),
    ).toEqual({ method: "qr-code", kind: "image", value: PNG, bank: "Сбер", payAmount: "499.00" });
  });

  test("вид определяем по содержимому, а не по заявленному kind", () => {
    expect(sanitizeRequisites({ kind: "image", value: "https://qr.nspk.ru/x" })?.kind).toBe("link");
    expect(sanitizeRequisites({ kind: "link", value: "2200 7007 1234 5678" })?.kind).toBe("text");
  });

  test("опасные значения отбрасываются", () => {
    expect(sanitizeRequisites({ value: "data:image/svg+xml;base64,PHN2Zz4=" })).toBeNull();
    expect(sanitizeRequisites({ value: "data:text/html;base64,PGgxPg==" })).toBeNull();
    expect(sanitizeRequisites({ value: "" })).toBeNull();
    expect(sanitizeRequisites(null)).toBeNull();
    expect(sanitizeRequisites("строка")).toBeNull();
    // javascript: не http(s) — остаётся текстом и в href не попадёт (kind=text)
    expect(sanitizeRequisites({ value: "javascript:alert(1)" })?.kind).toBe("text");
  });

  test("битый JSON из БД не ломает ответ", () => {
    expect(parseStoredRequisites("{нет")).toBeNull();
    expect(parseStoredRequisites(null)).toBeNull();
    expect(parseStoredRequisites(JSON.stringify({ value: PNG }))?.kind).toBe("image");
  });
});
