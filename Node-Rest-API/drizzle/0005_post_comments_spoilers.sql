CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_comments_body_length" CHECK (char_length("post_comments"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type";--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_target_type";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "thread_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "post_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "post_comment_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "spoiler" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "spoiler_for" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_comment_id_post_comments_id_fk" FOREIGN KEY ("post_comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target" CHECK (("notifications"."type" = 'reply' and "notifications"."thread_id" is not null) or ("notifications"."type" = 'post_comment' and "notifications"."post_id" is not null));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" in ('reply', 'post_comment'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_spoiler_for_length" CHECK ("posts"."spoiler_for" is null or char_length("posts"."spoiler_for") <= 80);--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_type" CHECK ("reports"."target_type" in ('thread', 'comment', 'post', 'post_comment', 'user'));