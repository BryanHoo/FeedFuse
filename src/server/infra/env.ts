import ipaddr from 'ipaddr.js';
import { z } from 'zod';

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseOptionalCsv(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [];
}

function parseOptionalBoolean(value: unknown): boolean | string | undefined {
  const normalized = parseOptionalString(value)?.toLowerCase();
  if (normalized === undefined) return undefined;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return normalized;
}

export const RSS_NETWORK_MODES = ['public', 'fake-ip', 'lan', 'custom'] as const;
export type RssNetworkMode = (typeof RSS_NETWORK_MODES)[number];

export interface RssNetworkConfig {
  mode: RssNetworkMode;
  allowedCidrs: string[];
}

const rssNetworkModeOverrideSchema = z.preprocess(
  (value) => {
    const normalized = parseOptionalString(value);
    return normalized?.toLowerCase();
  },
  z.enum(RSS_NETWORK_MODES).optional(),
);
const rssAllowedCidrsSchema = z.preprocess(
  parseOptionalCsv,
  z.array(z.string()).superRefine((cidrs, ctx) => {
    for (const cidr of cidrs) {
      try {
        ipaddr.parseCIDR(cidr);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid CIDR: ${cidr}`,
        });
      }
    }
  }),
).default([]);
const optionalBooleanSchema = z.preprocess(parseOptionalBoolean, z.boolean().optional());

const rssNetworkConfigSchema = z
  .object({
    RSS_NETWORK_MODE: rssNetworkModeOverrideSchema,
    RSS_ALLOWED_CIDRS: rssAllowedCidrsSchema,
  })
  .transform(({ RSS_NETWORK_MODE, RSS_ALLOWED_CIDRS }): RssNetworkConfig => ({
    mode: RSS_NETWORK_MODE ?? 'public',
    allowedCidrs: RSS_ALLOWED_CIDRS,
  }));

const envSchema = z
  .object({
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
    AUTH_COOKIE_SECURE: optionalBooleanSchema,
    AUTH_TRUST_PROXY: optionalBooleanSchema,
    RSS_NETWORK_MODE: rssNetworkModeOverrideSchema,
    RSS_ALLOWED_CIDRS: rssAllowedCidrsSchema,
  })
  .transform((env) => ({
    ...env,
    RSS_NETWORK_MODE: env.RSS_NETWORK_MODE ?? 'public',
  }));

export type ServerEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, unknown>): ServerEnv {
  return envSchema.parse(input);
}

export function getServerEnv(): ServerEnv {
  return parseEnv(process.env as Record<string, unknown>);
}

export function getRssNetworkConfig(input: Record<string, unknown>): RssNetworkConfig {
  return rssNetworkConfigSchema.parse(input);
}
