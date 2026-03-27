# 补齐后端规范文档

## Goal
基于当前仓库已经存在的后端实现，补齐 Trellis 所需的 backend spec 文档，使后续开发流程能读取到真实、可执行的后端约定。

## Requirements
- 创建 `.trellis/spec/backend/` 目录并补齐工作流引用的文档。
- 文档内容必须来源于当前仓库的实际实现模式，而不是泛化模板。
- 覆盖后端目录结构、数据库访问、错误处理、日志、类型边界、质量要求。
- 保证 `.trellis/workflow.md` 和相关脚本中引用的 backend spec 文件全部存在。

## Acceptance Criteria
- [ ] `.trellis/spec/backend/index.md` 存在并能导航到相关文档。
- [ ] backend spec 至少包含 `directory-structure.md`、`database-guidelines.md`、`error-handling.md`、`logging-guidelines.md`、`quality-guidelines.md`、`type-safety.md`。
- [ ] 每份文档都引用仓库中的真实文件路径与约定示例。
- [ ] Trellis 工作流中引用的 backend spec 路径不再缺失。

## Technical Notes
- 后端主结构位于 `src/app/api/`、`src/server/`、`src/worker/`。
- API route 普遍使用 `zod` 做请求校验，统一通过 `ok` / `fail` 返回响应。
- `repository` 层使用 `pg` 与参数化 SQL，负责 snake_case 到 camelCase 的字段映射。
- `service` 层负责事务和跨 repository 协调，worker / queue 负责异步任务执行。
