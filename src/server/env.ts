import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_INITIAL_PASSWORD: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim().length === 0 ? undefined : value,
    z.string().min(1).optional(),
  ),
  IMAGE_PROXY_SECRET: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim().length === 0 ? undefined : value,
    z.string().min(1).optional(),
  ),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, unknown>): ServerEnv {
  return envSchema.parse(input);
}

export function getServerEnv(): ServerEnv {
  return parseEnv(process.env as Record<string, unknown>);
}
