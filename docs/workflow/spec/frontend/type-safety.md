# 类型安全规范

## 共享类型入口

- 领域共享类型优先集中在 `src/types`
- API client、store、feature 组件都围绕共享类型协作

## API 数据处理规则

- 组件不要直接消费原始 `Response` JSON
- 统一经 `src/lib/apiClient.ts` 做：
  请求发送
  envelope 校验
  错误翻译
  DTO -> 前端类型映射

## 设置和外部输入

- 设置结构统一走 `normalizePersistedSettings`
- 路由输入校验统一走 `zod`
- 对不可信对象做 `isRecord`、数组/字符串归一化等显式收窄，不要依赖隐式断言

## 禁止事项

- 不要在前端组件里直接 `as SomeType` 把未知 JSON 强转到底
- 不要绕过共享类型，单独在某个 feature 里复制一份同名 DTO 类型
- 不要把数据库字段命名风格直接带到前端
