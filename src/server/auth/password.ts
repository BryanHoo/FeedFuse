import { randomBytes, scryptSync } from 'node:crypto';
import { safeEqualText } from './shared';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PREFIX = 'scrypt';

function normalizePassword(value: string): string {
  return value.normalize('NFKC');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(normalizePassword(password), salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${SCRYPT_PREFIX}$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, expectedHash] = storedHash.split('$');
  if (prefix !== SCRYPT_PREFIX || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(normalizePassword(password), salt, SCRYPT_KEY_LENGTH).toString('hex');
  return safeEqualText(actualHash, expectedHash);
}

export function verifyPlainPassword(password: string, expectedPassword: string): boolean {
  return safeEqualText(normalizePassword(password), normalizePassword(expectedPassword));
}
