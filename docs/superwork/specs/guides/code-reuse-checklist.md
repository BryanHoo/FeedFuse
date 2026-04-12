# Code Reuse Checklist

新增 helper/常量/schema 前先做本地检索：

- `rg "<keyword>" src/lib src/server src/features src/store`
- `rg --files src/components/ui src/features`

判定标准：

- 同一规则出现 3 次及以上，提取到共享位置（`src/lib`、`src/server/http`、`src/components/ui`、`src/store`）。
- 有明确 canonical 实现后，删除重复副本并在 PR/变更说明中标注新入口文件。
- 若复用点跨后端与前端，补写到 `shared/contracts.md`，避免再次分叉实现。
