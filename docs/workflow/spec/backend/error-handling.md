# 错误处理规范

## HTTP 边界统一规则

- Route Handler 成功响应统一返回 `ok(data)`
- Route Handler 失败响应统一返回 `fail(err)`
- 统一实现位于 `src/server/http/apiResponse.ts`

## 错误类型

- 预期业务错误：
  使用 `src/server/http/errors.ts` 中的 `ValidationError`、`ConflictError`、`UnauthorizedError`、`NotFoundError`、`ServiceUnavailableError`
- 非预期异常：
  允许抛出原始 `Error`，但最终只能通过 `fail(err)` 暴露通用错误消息

## 请求体验证

- 输入校验优先使用 `zod`
- route 中优先 `safeParse`，不要让请求体验证异常直接炸出 500
- 表单字段错误需要转换成 `fields` 结构，方便前端精确提示
- 参考 `src/app/api/feeds/route.ts` 中的 `zodIssuesToFields`

## 鉴权失败

- 需要登录的 API 优先先调 `requireApiSession()`
- 该函数已经统一处理：
  未登录返回 401
  未配置初始密码时返回 503

## 外部依赖和网络错误

- 外链 RSS / URL 先过 `isSafeExternalUrl`
- feed 抓取错误要走专门映射，例如 `mapFeedFetchError`
- 不要把底层库原始错误直接作为面向用户的文案

## Route 文件里的建议结构

1. `requireApiSession`
2. 解析 `request`
3. `zod.safeParse`
4. 调用 repository / service
5. 写成功日志
6. `return ok(...)`
7. `catch` 中按已知错误分支翻译，再统一 `return fail(...)`
