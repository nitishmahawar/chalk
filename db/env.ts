import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL in .env; see .env.example.");
export const databaseUrl = url;
