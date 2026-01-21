DROP TABLE "app_bootstrap" CASCADE;--> statement-breakpoint
CREATE VIEW "public"."usercount" AS (SELECT count(*) AS user_count FROM auth.users);