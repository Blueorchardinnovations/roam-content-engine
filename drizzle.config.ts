import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error('Invalid DATABASE_URL in environment configuration.');
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema/*.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: parsedEnv.data.DATABASE_URL
  },
  strict: true,
  verbose: true
});
