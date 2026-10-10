import { z } from 'zod';
import { isPasswordWithinLimit, MAX_USERNAME_LENGTH } from '@/server/domains/auth/services/inputLimits';
import { ValidationError } from '@/server/infra/http/errors';

const MAX_LOGIN_BODY_BYTES = 8 * 1024;
const loginBodySchema = z.object({
  username: z.string().max(MAX_USERNAME_LENGTH, '用户名最多允许 128 个字符').trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码').refine(isPasswordWithinLimit, '密码最多允许 1024 个 UTF-8 字节'),
});

export async function readLoginInput(request: Request): Promise<z.infer<typeof loginBodySchema>> {
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('登录信息不能为空', { body: '请输入登录信息' });
  let json: unknown;
  try {
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      // 逐块检查实际字节数，不能依赖可缺省或伪造的 Content-Length，超限后停止读取。
      if (byteLength > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ValidationError('登录请求过大', { body: '登录请求最多允许 8 KiB' });
      }
      chunks.push(value);
    }
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, byteLength)));
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('登录信息格式无效', { body: '请提交有效的 JSON 登录信息' });
  } finally {
    reader.releaseLock();
  }
  const parsed = loginBodySchema.safeParse(json);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || 'body'] = issue.message;
    throw new ValidationError('登录信息校验失败', fields);
  }
  return parsed.data;
}
