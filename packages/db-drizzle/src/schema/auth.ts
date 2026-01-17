import { pgTableWithSchema, uuid } from "drizzle-orm/pg-core";

export const usersInAuth = pgTableWithSchema(
  "users",
  {
    id: uuid("id").primaryKey().notNull(),
  },
  undefined,
  "auth",
);
