CREATE TABLE IF NOT EXISTS "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "traders" ADD COLUMN "strategy_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "traders" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategies" ADD CONSTRAINT "strategies_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "public"."traders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "traders" ADD CONSTRAINT "traders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
