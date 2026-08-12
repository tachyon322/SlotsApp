ALTER TABLE "payments" ADD COLUMN "receipt_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_uploaded_at" timestamp with time zone;