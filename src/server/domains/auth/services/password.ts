import { randomBytes, scrypt } from 'node:crypto';
import { safeEqualText } from '@/server/domains/auth/services/shared';
import { ValidationError } from '@/server/infra/http/errors';
import { isPasswordWithinLimit, MAX_PASSWORD_BYTES } from '@/server/domains/auth/services/inputLimits';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PREFIX = 'scrypt';

function derivePassword(password: string, salt: string): Promise<Buffer> {
  // 显式包装回调，保证不同 Node.js 类型定义下仍有准确的 Buffer 返回类型。
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

function normalizePassword(value: string): string {
  if (!isPasswordWithinLimit(value)) {
    throw new ValidationError('密码过长', { password: `密码最多允许 ${MAX_PASSWORD_BYTES} 个 UTF-8 字节` });
  }
  return value.normalize('NFKC');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  // 保留旧盐值、参数和格式，将昂贵的派生计算交给 Node.js 工作线程池。
  const derived = (await derivePassword(normalizePassword(password), salt)).toString('hex');
  return `${SCRYPT_PREFIX}$${salt}$${derived}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [prefix, salt, expectedHash, extra] = storedHash.split('$');
  if (prefix !== SCRYPT_PREFIX || !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{128}$/.test(expectedHash ?? '') || extra !== undefined) {
    return false;
  }

  const actualHash = (await derivePassword(normalizePassword(password), salt)).toString('hex');
  return safeEqualText(actualHash, expectedHash);
}

export function verifyPlainPassword(password: string, expectedPassword: string): boolean {
  return safeEqualText(normalizePassword(password), normalizePassword(expectedPassword));
}
