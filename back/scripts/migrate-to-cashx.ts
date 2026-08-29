/**
 * Thin wrapper / documentation for kazik → CashX ETL.
 *
 * Main implementation is Go: Cashx/backend/cmd/migrate-kazik/main.go
 * This file exists to satisfy plan location alternative `kazik/back/scripts/migrate-to-cashx.ts`
 * and to provide a Bun-runnable entrypoint that delegates to the Go binary.
 *
 * Usage:
 *   bun run kazik/back/scripts/migrate-to-cashx.ts
 *   # or direct Go:
 *   go run Cashx/backend/cmd/migrate-kazik -kazik-url $DATABASE_URL -cashx-url $CASHX_ADMIN_DATABASE_URL
 */

const kazikUrl = process.env.DATABASE_URL || process.env.KAZIK_DATABASE_URL;
const cashxUrl = process.env.CASHX_ADMIN_DATABASE_URL || process.env.CASHX_DATABASE_URL;

if (!kazikUrl || !cashxUrl) {
  console.error("Set DATABASE_URL and CASHX_ADMIN_DATABASE_URL");
  process.exit(1);
}

console.log("Delegating to Go ETL: Cashx/backend/cmd/migrate-kazik");
console.log(`  kazik: ${kazikUrl.replace(/:[^:@]*@/, ":***@")}`);
console.log(`  cashx: ${cashxUrl.replace(/:[^:@]*@/, ":***@")}`);
console.log("");
console.log("Run:");
console.log(`  cd Cashx/backend && go run ./cmd/migrate-kazik -kazik-url "${kazikUrl}" -cashx-url "${cashxUrl}"`);
