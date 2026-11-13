ALTER TABLE "books" ADD COLUMN "subjects" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "page_count" smallint;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "details_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "chapters_set_by" text;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_chapters_set_by_users_id_fk" FOREIGN KEY ("chapters_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_page_count" CHECK ("books"."page_count" is null or "books"."page_count" between 1 and 20000);