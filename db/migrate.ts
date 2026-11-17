import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, close } from './index.js';

async function main() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations applied.');
  } finally {
    await close();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
