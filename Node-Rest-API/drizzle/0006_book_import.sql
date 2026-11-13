ALTER TABLE "books" ADD COLUMN "ol_work_id" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_ol_work_id_unique" UNIQUE("ol_work_id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_ol_work_id_format" CHECK ("books"."ol_work_id" is null or "books"."ol_work_id" ~ '^OL[0-9]+W$');--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_cover_url_open_library" CHECK ("books"."cover_url" is null or "books"."cover_url" like 'https://covers.openlibrary.org/%');