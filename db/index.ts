import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./schema";
import { databaseUrl } from "./env";

const client = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client, relations });
export const close = () => client.end();
