CREATE TABLE "books" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"published_year" smallint,
	"description" text DEFAULT '' NOT NULL,
	"cover_color" text DEFAULT '#2f7553' NOT NULL,
	"source_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_slug_unique" UNIQUE("slug"),
	CONSTRAINT "books_cover_color_hex" CHECK ("books"."cover_color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"book_id" text NOT NULL,
	"seq" smallint NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "chapters_pk" PRIMARY KEY("book_id","seq"),
	CONSTRAINT "chapters_seq_nonneg" CHECK ("chapters"."seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "circle_members" (
	"circle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_members_pk" PRIMARY KEY("circle_id","user_id"),
	CONSTRAINT "circle_members_role" CHECK ("circle_members"."role" in ('owner', 'moderator', 'member'))
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"book_id" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"owner_id" text NOT NULL,
	"invite_code" text NOT NULL,
	"schedule" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circles_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "circles_visibility" CHECK ("circles"."visibility" in ('public', 'private')),
	CONSTRAINT "circles_name_length" CHECK (char_length("circles"."name") between 3 and 60)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_length" CHECK (char_length("comments"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"circle_id" text NOT NULL,
	"chapter_seq" smallint NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_title_length" CHECK (char_length("threads"."title") between 3 and 120),
	CONSTRAINT "threads_body_length" CHECK (char_length("threads"."body") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "user_books" (
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"shelf" text NOT NULL,
	"chapter_seq" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_books_pk" PRIMARY KEY("user_id","book_id"),
	CONSTRAINT "user_books_shelf" CHECK ("user_books"."shelf" in ('want', 'reading', 'finished')),
	CONSTRAINT "user_books_chapter_nonneg" CHECK ("user_books"."chapter_seq" >= 0)
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_members_user_idx" ON "circle_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_thread_idx" ON "comments" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "threads_circle_chapter_idx" ON "threads" USING btree ("circle_id","chapter_seq");