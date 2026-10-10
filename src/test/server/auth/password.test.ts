import { scryptSync } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/server/domains/auth/services/password';

describe('asynchronous password service', () => {
  it('returns a promise and preserves the existing hash format', async () => {
    const pending = hashPassword('  Ａ-password  ');
    expect(pending).toBeInstanceOf(Promise);
    const hash = await pending;
    expect(hash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(await verifyPassword('  A-password  ', hash)).toBe(true);
    expect(await verifyPassword('A-password', hash)).toBe(false);
  });

  it('verifies legacy hashes while allowing the event loop to handle other work', async () => {
    // 同步算法只用于生成旧格式测试数据；生产验证期间事件循环必须能继续运行。
    const salt = '0123456789abcdef0123456789abcdef';
    const hash = `scrypt$${salt}$${scryptSync('password', salt, 64).toString('hex')}`;
    let handledOtherWork = false;
    const otherWork = setImmediate().then(() => { handledOtherWork = true; });
    const valid = await verifyPassword('password', hash);
    expect(handledOtherWork).toBe(true);
    expect(valid).toBe(true);
    await otherWork;
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects oversized raw and normalized passwords without truncating them', async () => {
    await expect(hashPassword('a'.repeat(1025))).rejects.toThrow();
    // NFKC 会把该字符展开为多个字符，规范化后的字节数也必须受限。
    await expect(hashPassword('ﷺ'.repeat(100))).rejects.toThrow();
  });

  it.each(['', 'scrypt$salt$hash', `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}$extra`])(
    'rejects malformed hashes: %s', async (hash) => {
      expect(await verifyPassword('password', hash)).toBe(false);
    },
  );
});
