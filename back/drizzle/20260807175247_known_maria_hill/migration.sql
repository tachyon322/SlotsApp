CREATE TABLE "affiliate_clicks" (
	"id" text PRIMARY KEY,
	"source_id" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_groups" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"comment" text,
	"commission_percent" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_redirects" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_redirect_urls" (
	"id" text PRIMARY KEY,
	"redirect_id" text NOT NULL,
	"url" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_signups" (
	"id" text PRIMARY KEY,
	"source_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"bonus_granted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_sources" (
	"id" text PRIMARY KEY,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"registration_bonus" integer,
	"group_id" text,
	"redirect_id" text,
	"comment" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "affiliate_clicks_source_id_idx" ON "affiliate_clicks" ("source_id");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_created_at_idx" ON "affiliate_clicks" ("created_at");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_source_created_idx" ON "affiliate_clicks" ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_groups_created_at_idx" ON "affiliate_groups" ("created_at");--> statement-breakpoint
CREATE INDEX "affiliate_redirects_created_at_idx" ON "affiliate_redirects" ("created_at");--> statement-breakpoint
CREATE INDEX "affiliate_redirect_urls_redirect_id_idx" ON "affiliate_redirect_urls" ("redirect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_signups_source_user_kind_unique" ON "affiliate_signups" ("source_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "affiliate_signups_source_id_idx" ON "affiliate_signups" ("source_id");--> statement-breakpoint
CREATE INDEX "affiliate_signups_user_id_idx" ON "affiliate_signups" ("user_id");--> statement-breakpoint
CREATE INDEX "affiliate_signups_created_at_idx" ON "affiliate_signups" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_sources_code_unique" ON "affiliate_sources" ("code");--> statement-breakpoint
CREATE INDEX "affiliate_sources_group_id_idx" ON "affiliate_sources" ("group_id");--> statement-breakpoint
CREATE INDEX "affiliate_sources_redirect_id_idx" ON "affiliate_sources" ("redirect_id");--> statement-breakpoint
CREATE INDEX "affiliate_sources_created_at_idx" ON "affiliate_sources" ("created_at");--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_source_id_affiliate_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "affiliate_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "affiliate_redirect_urls" ADD CONSTRAINT "affiliate_redirect_urls_redirect_id_affiliate_redirects_id_fkey" FOREIGN KEY ("redirect_id") REFERENCES "affiliate_redirects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "affiliate_signups" ADD CONSTRAINT "affiliate_signups_source_id_affiliate_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "affiliate_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "affiliate_sources" ADD CONSTRAINT "affiliate_sources_group_id_affiliate_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "affiliate_groups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "affiliate_sources" ADD CONSTRAINT "affiliate_sources_redirect_id_affiliate_redirects_id_fkey" FOREIGN KEY ("redirect_id") REFERENCES "affiliate_redirects"("id") ON DELETE SET NULL;