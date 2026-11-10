ALTER TABLE "cards" ALTER COLUMN "public_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "holder_id" text;