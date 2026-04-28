# Frontend Development Guidelines

> FeedFuse 前端与 Web 接入层开发规范（包含与服务端 API/Worker 的协作边界）。

---

## Overview

本目录记录项目真实开发约定，覆盖 UI、状态管理、类型边界与全栈协作规则。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Done |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Done |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | Done |
| [State Management](./state-management.md) | Local state, global state, server state | Done |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Done |
| [Type Safety](./type-safety.md) | Type patterns, validation | Done |

---

## Maintenance Rules

1. 只记录仓库已落地的真实模式，不写理想化规范
2. 每条关键规则至少绑定一个真实文件路径示例
3. 跨层规则必须同时说明前端入口与服务端落点
4. 新增模式或踩坑后，及时回写对应 spec 文件
