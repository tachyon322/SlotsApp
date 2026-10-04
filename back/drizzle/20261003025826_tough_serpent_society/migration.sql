CREATE TABLE "refund_requests" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"requisites" text NOT NULL,
	"method" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_comment" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "refund_requests_user_id_idx" ON "refund_requests" ("user_id");--> statement-breakpoint
CREATE INDEX "refund_requests_status_idx" ON "refund_requests" ("status");--> statement-breakpoint
CREATE INDEX "refund_requests_created_at_idx" ON "refund_requests" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_one_pending_per_user" ON "refund_requests" ("user_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;