# 实现登录功能与密码管理

## Goal

为 FeedFuse 增加单用户登录能力。应用启动后使用环境变量提供初始登录密码，Docker 部署可直接透传该配置；用户登录成功后通过安全 cookie 维持会话；未登录用户不能访问主页面和受保护 API；已登录用户可在设置中修改密码，修改后新的密码持久化到数据库并立即刷新当前会话。

## In Scope

- 新增登录页和登录表单提交流程
- 新增登录、退出登录、修改密码的后端接口
- 使用 `app_settings` 持久化登录密码哈希和 session secret
- 使用 env 提供初始密码，数据库未设置自定义密码时回退到 env 密码
- 为主阅读页和受保护 API 增加鉴权守卫
- 为 `.env.example`、`docker-compose.yml` 接入初始密码配置
- 为新增认证能力补充测试

## Out of Scope

- 多用户系统
- 注册、找回密码、邮箱验证
- 第三方 OAuth
- 权限分级与细粒度 RBAC

## Constraints

- 继续沿用 Next App Router + `src/app/api` 路由约定
- 路由层保持轻量，持久化逻辑放在 `src/server/repositories`
- 边界输入必须校验，API 返回继续使用统一 `{ ok: true | false }` envelope
- 客户端请求继续走 `src/lib/apiClient.ts`
- 不引入新的服务端依赖，优先使用 Node `crypto`

## Contracts

- Env key: `AUTH_INITIAL_PASSWORD`
- DB columns:
  - `app_settings.auth_password_hash`
  - `app_settings.auth_session_secret`
- Cookie:
  - name: `feedfuse_session`
  - attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`
- API:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `POST /api/settings/auth/password`

## Acceptance Criteria

- [ ] 未登录访问 `/` 时跳转到 `/login`
- [ ] 已登录访问 `/login` 时跳回 `/`
- [ ] 使用 env 中的初始密码可以成功登录
- [ ] 数据库已保存自定义密码时，登录使用数据库密码而不是 env 初始密码
- [ ] 未登录访问受保护 API 时返回 401 envelope
- [ ] 设置页可以提交当前密码和新密码修改密码
- [ ] 修改密码后当前会话继续有效，旧会话被旋转失效
- [ ] `.env.example` 与 `docker-compose.yml` 可以传入初始密码

## Risks / Edge Cases

- 若 env 未配置初始密码且数据库也没有自定义密码，系统无法完成首次登录，需要返回明确错误
- API 保护范围过窄会留下未鉴权入口，需要覆盖所有业务 API，仅保留健康检查和认证入口为公开接口
- 修改密码后如果不轮换 session secret，旧 cookie 仍可继续使用
- 登录态失效后客户端请求需要有明确回退行为，避免界面停留在错误状态

## Research

### Relevant Specs

- `.superwork/spec/backend/directory-structure.md`: 确认 route / server / repository 分层边界
- `.superwork/spec/backend/api-guidelines.md`: 约束 API 校验、错误与 envelope
- `.superwork/spec/backend/type-safety.md`: 约束 env 和请求边界解析
- `.superwork/spec/backend/quality-guidelines.md`: 要求补充路由/仓储测试
- `.superwork/spec/backend/data-access-guidelines.md`: 约束 `app_settings` 仓储实现方式
- `.superwork/spec/frontend/directory-structure.md`: 确认登录页与设置页归属
- `.superwork/spec/frontend/component-guidelines.md`: 约束表单组件和无障碍细节
- `.superwork/spec/frontend/quality-guidelines.md`: 要求行为变更补测试并继续使用 `apiClient`
- `.superwork/spec/frontend/type-safety.md`: 约束客户端边界类型与归一化
- `.superwork/spec/frontend/state-management.md`: 确认密码表单保持局部状态，不塞进全局 store
- `.superwork/spec/guides/cross-layer-thinking-guide.md`: 明确 env -> repo -> auth helper -> route/page -> client 的数据流

### Code Patterns Found

- env parsing: `src/server/env.ts`, `src/server/env.test.ts`
- settings persistence: `src/server/repositories/settingsRepo.ts`, `src/app/api/settings/route.ts`
- route validation and envelope: `src/app/api/settings/ai/api-key/route.ts`
- route tests mocking repository dependencies: `src/app/api/settings/ai/api-key/routes.test.ts`
- settings UI composition: `src/features/settings/SettingsCenterDrawer.tsx`, `src/features/settings/panels/GeneralSettingsPanel.tsx`
- client API boundary: `src/lib/apiClient.ts`

### Files To Modify

- `src/server/db/migrations/*`: 新增认证字段迁移
- `src/server/repositories/settingsRepo.ts`: 读写认证配置
- `src/server/env.ts`: 解析初始密码 env
- `src/server/auth/*`: 新增密码哈希、session、鉴权 helper
- `src/app/(reader)/page.tsx`: 页面鉴权与跳转
- `src/app/login/*`: 新增登录页
- `src/app/api/auth/*`: 新增登录/退出接口
- `src/app/api/settings/auth/password/route.ts`: 新增改密接口
- `src/app/api/**/route.ts`: 接入统一 API 鉴权守卫
- `src/features/settings/panels/GeneralSettingsPanel.tsx`: 增加改密/退出登录 UI
- `src/lib/apiClient.ts`: 增加 auth 相关请求方法和 401 处理
- `.env.example`, `docker-compose.yml`: 接入初始密码配置

## Implementation Plan

1. 为认证契约补充失败测试与迁移测试，锁定 env、repo 和 auth helper 行为。
2. 实现数据库迁移、env 解析、密码哈希与 session helper。
3. 实现登录/退出/修改密码接口，并为阅读页与业务 API 接入鉴权守卫。
4. 实现 `/login` 页面、客户端登录流程，以及设置中的修改密码和退出登录入口。
5. 运行针对性测试、`pnpm lint`、`pnpm type-check`，修正回归后完成交付。

## File Plan

- Modify: `src/server/env.ts`
- Modify: `src/server/env.test.ts`
- Modify: `src/server/repositories/settingsRepo.ts`
- Modify: `src/server/repositories/settingsRepo.test.ts`
- Add: `src/server/auth/password.ts`
- Add: `src/server/auth/session.ts`
- Add: `src/server/auth/session.test.ts`
- Add: `src/server/db/migrations/0026_app_settings_auth.sql`
- Add: `src/server/db/migrations/appSettingsAuthMigration.test.ts`
- Add: `src/app/login/page.tsx`
- Add: `src/features/auth/LoginPage.tsx`
- Add: `src/app/api/auth/login/route.ts`
- Add: `src/app/api/auth/logout/route.ts`
- Add: `src/app/api/auth/login/routes.test.ts`
- Add: `src/app/api/settings/auth/password/route.ts`
- Add: `src/app/api/settings/auth/password/routes.test.ts`
- Modify: `src/app/(reader)/page.tsx`
- Modify: `src/features/settings/panels/GeneralSettingsPanel.tsx`
- Modify: `src/lib/apiClient.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

## Verification

- Targeted test: `pnpm test:unit -- src/server/env.test.ts src/server/repositories/settingsRepo.test.ts src/server/auth/session.test.ts src/app/api/auth/login/routes.test.ts src/app/api/settings/auth/password/routes.test.ts src/server/db/migrations/appSettingsAuthMigration.test.ts`
- Targeted test: `pnpm test:unit -- src/app/api/settings/routes.test.ts`
- Package checks: `pnpm lint`
- Package checks: `pnpm type-check`
- Manual check: 使用 env 初始密码登录、刷新后保持登录、设置中修改密码、旧密码失效、新密码可重新登录、Docker `web` 服务可读取 `AUTH_INITIAL_PASSWORD`
