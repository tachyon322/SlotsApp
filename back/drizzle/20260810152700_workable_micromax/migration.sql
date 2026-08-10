CREATE TABLE IF NOT EXISTS "support_conversations" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" text PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_conversations_user_id_idx" ON "support_conversations" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_conversations_updated_at_idx" ON "support_conversations" ("updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_messages_conversation_message_unique" ON "support_messages" ("conversation_id","message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_conversation_created_idx" ON "support_messages" ("conversation_id","created_at");
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_conversations_user_id_users_id_fkey') THEN
   ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_conversation_id_support_conversations_id_fkey') THEN
   ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE;
 END IF;
END $$;
