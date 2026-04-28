import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { fail } from '@/server/http/apiResponse';
import { ServiceUnavailableError, UnauthorizedError } from '@/server/http/errors';
import { getServerEnv } from '@/server/env';
import { getPool } from '@/server/db/pool';
import { getAuthSettings } from '@/server/repositories/settingsRepo';
import { safeEqualText } from './shared';
import { verifyPassword, verifyPlainPassword } from './password';

export const AUTH_SESSION_COOKIE_NAME = 'feedfuse_session';
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface SessionPayload {
  exp: number;
  iat: number;
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as SessionPayload;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.exp !== 'number' ||
      typeof parsed.iat !== 'number'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function shouldBypassSessionGuard(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function createSessionToken(input: {
  secret: string;
  nowMs?: number;
  maxAgeSeconds?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeSeconds = input.maxAgeSeconds ?? AUTH_SESSION_MAX_AGE_SECONDS;
  const payload = encodePayload({
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + maxAgeSeconds,
  });
  const signature = signPayload(payload, input.secret);
  return `${payload}.${signature}`;
}

export function verifySessionToken(input: {
  token: string;
  secret: string;
  nowMs?: number;
}): boolean {
  const [payloadPart, signaturePart] = input.token.split('.');
  if (!payloadPart || !signaturePart) {
    return false;
  }

  const expectedSignature = signPayload(payloadPart, input.secret);
  if (!safeEqualText(expectedSignature, signaturePart)) {
    return false;
  }

  const payload = decodePayload(payloadPart);
  if (!payload) {
    return false;
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  return payload.exp > nowSeconds;
}

export function serializeSessionCookie(
  token: string,
  maxAgeSeconds = AUTH_SESSION_MAX_AGE_SECONDS,
): string {
  return `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function serializeExpiredSessionCookie(): string {
  return `${AUTH_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function createSessionCookieHeader(secret?: string): Promise<string> {
  const resolvedSecret =
    secret ??
    (await getAuthSettings(getPool())).authSessionSecret;

  return serializeSessionCookie(createSessionToken({ secret: resolvedSecret }));
}

export async function verifyPasswordAgainstAuthConfig(password: string): Promise<{
  ok: boolean;
  reason?: 'invalid_password' | 'missing_initial_password';
}> {
  const pool = getPool();
  const authSettings = await getAuthSettings(pool);

  if (authSettings.authPasswordHash.trim()) {
    return verifyPassword(password, authSettings.authPasswordHash)
      ? { ok: true }
      : { ok: false, reason: 'invalid_password' };
  }

  const envPassword = getServerEnv().AUTH_INITIAL_PASSWORD?.trim();
  if (!envPassword) {
    return { ok: false, reason: 'missing_initial_password' };
  }

  return verifyPlainPassword(password, envPassword)
    ? { ok: true }
    : { ok: false, reason: 'invalid_password' };
}

export async function isAuthenticated(): Promise<boolean> {
  if (shouldBypassSessionGuard()) {
    return true;
  }

  const token = (await cookies()).get(AUTH_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return false;
  }

  const authSettings = await getAuthSettings(getPool());
  if (!authSettings.authSessionSecret.trim()) {
    return false;
  }

  return verifySessionToken({
    token,
    secret: authSettings.authSessionSecret,
  });
}

export async function requireApiSession() {
  const authenticated = await isAuthenticated();
  if (authenticated) {
    return null;
  }

  const authSettings = await getAuthSettings(getPool());
  const envPassword = getServerEnv().AUTH_INITIAL_PASSWORD?.trim();
  if (!authSettings.authPasswordHash.trim() && !envPassword) {
    return fail(new ServiceUnavailableError('未配置初始登录密码，暂时无法提供服务'));
  }

  return fail(new UnauthorizedError('请先登录后再继续'));
}
