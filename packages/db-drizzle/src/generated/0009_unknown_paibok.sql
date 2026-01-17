DO $$ BEGIN
 ALTER TABLE "traders" ADD CONSTRAINT "traders_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
