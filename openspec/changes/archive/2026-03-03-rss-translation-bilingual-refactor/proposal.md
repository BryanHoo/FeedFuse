# RSS Translation Bilingual Refactor Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** Build feed-level title/body translation controls, configurable shared-or-dedicated translation providers, and immersive bilingual article rendering without sending full HTML directly to the translation model.

**Architecture:** Extend `feeds`, `articles`, and `app_settings` schemas, add translation config resolution, and split translation into two asynchronous jobs (`title` and `body`). Body translation uses DOM extraction + segment translation + deterministic bilingual HTML reconstruction to preserve structure and links while rendering original+translated blocks.

**Tech Stack:** Next.js App Router, TypeScript, pg/SQL migrations, pg-boss workers, Zustand, Vitest, Testing Library, OpenSpec.

---

## Scope

1. Feed-level toggles:
   - `titleTranslateEnabled`
   - `bodyTranslateEnabled`
2. AI settings translation namespace:
   - `translation.useSharedAi` (default `true`)
   - `translation.model`
   - `translation.apiBaseUrl`
   - dedicated translation API key in `app_settings.translation_api_key`
3. Title translation:
   - auto enqueue after ingest for new articles only
   - retry up to 3 times with exponential backoff
4. Body translation:
   - manual trigger from article view
   - disabled if source feed body translation disabled
   - no full HTML pass-through to model
   - immersive bilingual output: original above translated
5. UI behavior:
   - keep button label `翻译/原文`
   - translation mode shows bilingual title + bilingual body blocks

## Non-Goals

1. Backfilling historical articles.
2. Cross-article translation memory cache.
3. Multi-target language support.

## Success Criteria

1. New feeds can independently enable title and body translation.
2. Title translation appears automatically for new articles when enabled.
3. Body translation button is blocked when feed-level body toggle is off.
4. Translation mode renders bilingual blocks and preserves links/media attributes.
5. Existing summary/fulltext flows remain functional.

