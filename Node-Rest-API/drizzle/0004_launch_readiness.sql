CREATE TABLE "email_tokens" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tokens_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "email_tokens_kind" CHECK ("email_tokens"."kind" in ('verify', 'reset'))
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_target_type";--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "circle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_tokens_user_idx" ON "email_tokens" USING btree ("user_id","kind");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_circle_scope" CHECK (("reports"."target_type" in ('thread', 'comment')) = ("reports"."circle_id" is not null));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_type" CHECK ("reports"."target_type" in ('thread', 'comment', 'post', 'user'));