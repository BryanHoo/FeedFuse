# Cross-Layer Checklist

在改动共享字段前，按顺序确认：

- 从入口追踪到消费端：`app/api -> server/services -> server/repositories -> store/features`。
- 核对每一层是否有该字段的校验/默认值/映射（常见位置：`zod schema`、`normalizePersistedSettings`、`Row` 类型定义）。
- 字段语义变化时，同步更新 `docs/superwork/specs/shared/contracts.md`。
- 补齐至少一条跨层测试路径（API 测试 + store 或 feature 测试）。
