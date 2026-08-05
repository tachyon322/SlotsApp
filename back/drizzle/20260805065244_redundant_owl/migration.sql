CREATE TABLE "payments" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"payment_id" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'rub' NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"credited" boolean DEFAULT false NOT NULL,
	"link" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" ("user_id");--> statement-breakpoint
CREATE INDEX "payments_payment_id_idx" ON "payments" ("payment_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;