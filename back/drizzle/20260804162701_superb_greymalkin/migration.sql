CREATE TABLE "wheel_spins" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"prize" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wheel_spins_user_id_idx" ON "wheel_spins" ("user_id");--> statement-breakpoint
CREATE INDEX "wheel_spins_created_at_idx" ON "wheel_spins" ("created_at");--> statement-breakpoint
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;