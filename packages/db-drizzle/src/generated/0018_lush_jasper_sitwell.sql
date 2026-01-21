CREATE TABLE IF NOT EXISTS "app_bootstrap" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"first_moderator_assigned" boolean DEFAULT false NOT NULL
);
