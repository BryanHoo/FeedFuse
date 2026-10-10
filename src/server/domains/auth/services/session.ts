import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { fail } from '@/server/infra/http/apiResponse';
import { ServiceUnavailableError, UnauthorizedError } from '@/server/infra/http/errors';
import { getServerEnv } from '@/server/infra/env';
import { getPool } from '@/server/infra/db/pool';
import { getAuthSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { safeEqualText } from '@/server/domains/auth/services/shared';
import { hashPassword, verifyPassword, verifyPlainPassword } from '@/server/domains/auth/services/password';
import {
  findUserByUsername,
  getUserById,
  persistInitialAdminPassword,
  type UserRow,
  type UserRole,
} from '@/server/domains/auth/repositories/usersRepo';

export const AUTH_SESSION_COOKIE_NAME = 'feedfuse_session';
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface ApiSession {
  userId: string;
  role: UserRole;
  sessionVersion: number;
}

const INITIAL_USER_ID = '1';

export type ApiSessionResult =
  | (ApiSession & { response?: never })
  | { response: Response };

interface SessionPayload extends ApiSession {
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
      typeof parsed.iat !== 'number' ||
      typeof parsed.userId !== 'string' ||
      (parsed.role !== 'admin' && parsed.role !== 'member') ||
      typeof parsed.sessionVersion !== 'number'
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

function shouldUseSecureSessionCookie(): boolean {
  const secureOverride = getServerEnv().AUTH_COOKIE_SECURE;
  return secureOverride ?? (process.env.NODE_ENV === 'production');
}

export function createSessionToken(input: {
  secret: string;
  userId: string;
  role: UserRole;
  sessionVersion: number;
  nowMs?: number;
  maxAgeSeconds?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeSeconds = input.maxAgeSeconds ?? AUTH_SESSION_MAX_AGE_SECONDS;
  const payload = encodePayload({
    userId: input.userId,
    role: input.role,
    sessionVersion: input.sessionVersion,
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
}): SessionPayload | null {
  const [payloadPart, signaturePart] = input.token.split('.');
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = signPayload(payloadPart, input.secret);
  if (!safeEqualText(expectedSignature, signaturePart)) {
    return null;
  }

  const payload = decodePayload(payloadPart);
  if (!payload) {
    return null;
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  return payload.exp > nowSeconds ? payload : null;
}

export function serializeSessionCookie(
  token: string,
  maxAgeSeconds = AUTH_SESSION_MAX_AGE_SECONDS,
): string {
  // 默认生产环境启用 Secure；内网 HTTP 自托管可通过 AUTH_COOKIE_SECURE=false 关闭。
  const secureAttribute = shouldUseSecureSessionCookie() ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttribute}`;
}

export function serializeExpiredSessionCookie(): string {
  const secureAttribute = shouldUseSecureSessionCookie() ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`;
}

async function getInitialUser(): Promise<UserRow | null> {
  return getUserById(getPool(), INITIAL_USER_ID);
}

async function verifyPasswordForUser(
  user: UserRow | null,
  password: string,
): Promise<{
  ok: boolean;
  user?: ApiSession;
  reason?: 'invalid_password' | 'missing_initial_password';
}> {
  if (!user || user.status !== 'active') {
    return { ok: false, reason: 'invalid_password' };
  }

  if (user.passwordHash.trim()) {
    return (await verifyPassword(password, user.passwordHash))
      ? {
          ok: true,
          user: { userId: user.id, role: user.role, sessionVersion: user.sessionVersion },
        }
      : { ok: false, reason: 'invalid_password' };
  }

  if (user.id !== INITIAL_USER_ID) {
    return { ok: false, reason: 'invalid_password' };
  }

  const envPassword = getServerEnv().AUTH_INITIAL_PASSWORD?.trim();
  if (!envPassword) {
    return { ok: false, reason: 'missing_initial_password' };
  }

  if (!verifyPlainPassword(password, envPassword)) {
    return { ok: false, reason: 'invalid_password' };
  }

  const updated = await persistInitialAdminPassword(getPool(), {
    userId: user.id,
    passwordHash: await hashPassword(password),
  });
  const nextUser = updated ?? user;

  return {
    ok: true,
    user: {
      userId: nextUser.id,
      role: nextUser.role,
      sessionVersion: nextUser.sessionVersion,
    },
  };
}

export async function createSessionCookieHeader(input?: {
  userId: string;
  role: UserRole;
  sessionVersion: number;
  secret?: string;
} | string): Promise<string> {
  const legacySecret = typeof input === 'string' ? input : undefined;
  const sessionInput = typeof input === 'object' ? input : undefined;
  const resolvedSecret =
    sessionInput?.secret ??
    legacySecret ??
    (await getAuthSettings(getPool())).authSessionSecret;
  const initialUser = sessionInput ? null : await getInitialUser();
  const session = sessionInput ?? {
    // 兼容旧调用点；后续 route 会改为显式传入当前用户。
    userId: initialUser?.id ?? INITIAL_USER_ID,
    role: initialUser?.role ?? 'admin',
    sessionVersion: initialUser?.sessionVersion ?? 1,
  };

  return serializeSessionCookie(createSessionToken({
    secret: resolvedSecret,
    userId: session.userId,
    role: session.role,
    sessionVersion: session.sessionVersion,
  }));
}

export async function verifyUserPassword(input: {
  username: string;
  password: string;
}): Promise<{
  ok: boolean;
  user?: ApiSession;
  reason?: 'invalid_password' | 'missing_initial_password';
}> {
  return verifyPasswordForUser(
    await findUserByUsername(getPool(), input.username),
    input.password,
  );
}

export async function verifyPasswordAgainstAuthConfig(password: string): Promise<{
  ok: boolean;
  reason?: 'invalid_password' | 'missing_initial_password';
}> {
  const result = await verifyPasswordForUser(await getInitialUser(), password);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function isAuthenticated(): Promise<boolean> {
  if (shouldBypassSessionGuard()) {
    return true;
  }

  return (await getApiSession()) !== null;
}

export async function getApiSession(): Promise<ApiSession | null> {
  const token = (await cookies()).get(AUTH_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const authSettings = await getAuthSettings(getPool());
  if (!authSettings.authSessionSecret.trim()) {
    return null;
  }

  const payload = verifySessionToken({
    token,
    secret: authSettings.authSessionSecret,
  });

  if (!payload) {
    return null;
  }

  const user = await getUserById(getPool(), payload.userId);
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== payload.role ||
    user.sessionVersion !== payload.sessionVersion
  ) {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}

export async function requireApiSession(): Promise<ApiSessionResult> {
  if (shouldBypassSessionGuard()) {
    return { userId: '1', role: 'admin', sessionVersion: 1 };
  }

  const session = await getApiSession();
  if (session) {
    return session;
  }

  const envPassword = getServerEnv().AUTH_INITIAL_PASSWORD?.trim();
  const initialUser = await getInitialUser();
  if (initialUser && !initialUser.passwordHash.trim() && !envPassword) {
    return { response: fail(new ServiceUnavailableError('未配置初始登录密码，暂时无法提供服务')) };
  }

  return { response: fail(new UnauthorizedError('请先登录后再继续')) };
}
