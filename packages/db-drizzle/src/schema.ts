import * as generatedSchema from "./generated/schema";
import { usersInAuth } from "./schema/auth";

type GeneratedSchema = typeof generatedSchema;

export type Schema = GeneratedSchema & {
  usersInAuth: typeof usersInAuth;
};

export const schema: Schema = {
  ...generatedSchema,
  usersInAuth,
};

export type UsersInAuth = typeof usersInAuth;
export { usersInAuth };
