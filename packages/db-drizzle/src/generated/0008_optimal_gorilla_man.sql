ALTER TABLE "strategies" DROP CONSTRAINT "strategies_bot_id_fkey";
--> statement-breakpoint
ALTER TABLE "strategies" DROP COLUMN IF EXISTS "bot_id";