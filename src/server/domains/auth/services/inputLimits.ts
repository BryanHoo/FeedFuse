export const MAX_USERNAME_LENGTH = 128;
export const MAX_PASSWORD_BYTES = 1024;

export function isPasswordWithinLimit(value: string): boolean {
  // 先限制原始输入，再限制 NFKC 展开后的 UTF-8 字节数；绝不截断密码。
  return Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES &&
    Buffer.byteLength(value.normalize('NFKC'), 'utf8') <= MAX_PASSWORD_BYTES;
}
