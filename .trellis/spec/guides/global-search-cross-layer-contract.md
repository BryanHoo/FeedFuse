# Global Search Cross-Layer Contract

> **Purpose**: Capture the executable cross-layer contract for reader global search until dedicated frontend/backend code-spec files exist.

---

## Scenario: Reader Global Search

### 1. Scope / Trigger

- Trigger: The change spans repository, API route, transport client, store state, reader UI, and article rendering.
- Use this contract when modifying:
  - `src/server/repositories/articlesRepo.ts`
  - `src/app/api/articles/search/route.ts`
  - `src/lib/apiClient.ts`
  - `src/store/appStore.ts`
  - `src/features/reader/GlobalSearchDialog.tsx`
  - `src/features/reader/ReaderLayout.tsx`
  - `src/features/articles/ArticleView.tsx`

### 2. Signatures

#### Repository

```ts
searchArticles(
  pool,
  input: {
    keyword: string;
    limit?: number;
  },
): Promise<ArticleSearchResult[]>
```

#### API Route

```ts
GET /api/articles/search?keyword=<string>&limit=<number>
```

#### Client Transport

```ts
searchArticles(
  input: {
    keyword: string;
    limit?: number;
  },
  options?: RequestApiOptions,
): Promise<{ items: ArticleSearchItemDto[] }>
```

#### Reader State Transition

```ts
openArticleInReader(input: {
  view: ViewType;
  articleId: string;
  articleHistory?: ReaderSelectionHistoryMode;
}): Promise<void>
```

#### Article Rendering

```ts
highlightHtmlByQuery(html: string, query: string): string
```

### 3. Contracts

#### Search Request Contract

- Query param `keyword`
  - Required
  - `trim()`
  - Minimum length: `1`
  - Maximum length: `120`
- Query param `limit`
  - Optional
  - Integer
  - Minimum: `1`
  - Maximum: `50`

#### Search Response Contract

Each item returned from `/api/articles/search` must contain:

- `id: string`
- `feedId: string`
- `feedTitle: string`
- `title: string`
- `titleOriginal: string | null`
- `titleZh: string | null`
- `summary: string`
- `excerpt: string`
- `publishedAt: string | null`

#### Search Semantics

- Search scope must include article title, translated title, original title, summary, and stripped body text.
- Search keyword normalization must collapse repeated whitespace to a single space before transport and repository matching.
- Result ordering must prefer title matches, then summary matches, then recency.
- Result UI must render:
  - Title with `line-clamp-1`
  - Preview text with `line-clamp-2`
  - Visible keyword highlight using the shared highlight class constant

#### Reader Navigation Contract

When a search result is clicked, the flow must be:

1. `ReaderLayout` passes `result.feedId` and `result.id`
2. `openArticleInReader(...)` calls `setSelectedView(view, { history: 'none' })`
3. `openArticleInReader(...)` awaits `loadSnapshot({ view })`
4. `openArticleInReader(...)` calls `setSelectedArticle(articleId, { history: articleHistory })`
5. `ArticleView` receives the same search query via `highlightQuery`
6. `highlightHtmlByQuery(...)` injects `<mark data-search-highlight="true">`

### 4. Validation & Error Matrix

| Boundary | Input | Validation | Error Behavior |
|----------|-------|------------|----------------|
| UI input | raw search text | trim before request; empty trimmed query does not request | clear results and stop loading |
| API route | `keyword`, `limit` | Zod validates required keyword, integer limit, max bounds, strict query keys | return `400` with `ValidationError` field map |
| Repository | normalized keyword | split into unique tokens, max 8 tokens, clamp limit to `1..50` | return empty list for no valid terms |
| Result click | `feedId`, `articleId` | use search result payload directly; do not derive from visible snapshot only | show dialog error message if open fails |
| Article render | `bodyHtml`, `highlightQuery` | skip highlighting when parser unavailable, query empty, or html empty | render original html without throwing |

### 5. Good / Base / Bad Cases

#### Good

- Request: `/api/articles/search?keyword=FeedFuse&limit=12`
- Result: route returns `200`, repository receives `{ keyword: 'FeedFuse', limit: 12 }`, UI renders highlighted title and excerpt, click opens the target feed and article.

#### Base

- Request: `/api/articles/search?keyword=  FeedFuse   search  `
- Expected:
  - client sends normalized `keyword=FeedFuse search`
  - repository tokenizes into `FeedFuse`, `search`
  - result title remains single-line
  - excerpt remains two-line clamp

#### Bad

- Request: `/api/articles/search?keyword=`
- Expected:
  - route returns `400`
  - `json.error.fields.keyword` is populated
  - repository is not called

#### Bad

- Request: `/api/articles/search?keyword=FeedFuse&page=2`
- Expected:
  - route returns `400`
  - `json.error.fields.page === '不支持的查询参数'`
  - repository is not called

### 6. Tests Required

- API route tests in `src/app/api/articles/search/route.test.ts`
  - valid keyword returns `200`
  - empty keyword returns `400`
  - unsupported query param returns `400`
- API client tests in `src/lib/apiClient.test.ts`
  - whitespace is normalized before building `/api/articles/search`
  - `limit` is included when provided
- Store tests in `src/store/appStore.test.ts`
  - `openArticleInReader(...)` switches feed, loads snapshot, and reveals fetched article in visible state
- Search dialog tests in `src/features/reader/GlobalSearchDialog.test.tsx`
  - debounce request fires once
  - title uses `line-clamp-1`
  - excerpt uses `line-clamp-2`
  - highlight uses shared search highlight styling
- Article view tests in `src/features/articles/ArticleView.titleLink.test.tsx`
  - rendered HTML contains `<mark data-search-highlight="true">`
  - highlight styling stays visible

### 7. Wrong vs Correct

#### Wrong

- Add a search result click handler that directly calls `setSelectedArticle(...)` before switching feed snapshot.
- Use one highlight style in dialog results and a different highlight style in `ArticleView`.
- Return route payload fields that do not match `ArticleSearchItemDto`.

#### Correct

- Route all result clicks through `openArticleInReader(...)` so view switch, snapshot load, and article selection stay ordered.
- Reuse `GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME` for both plain-text and HTML highlighting.
- Keep `/api/articles/search` response fields aligned with `ArticleSearchItemDto` and repository mapping.

### Related Files

- `src/server/repositories/articlesRepo.ts`
- `src/app/api/articles/search/route.ts`
- `src/app/api/articles/search/route.test.ts`
- `src/lib/apiClient.ts`
- `src/lib/apiClient.test.ts`
- `src/store/appStore.ts`
- `src/store/appStore.test.ts`
- `src/features/reader/GlobalSearchDialog.tsx`
- `src/features/reader/GlobalSearchDialog.test.tsx`
- `src/features/reader/globalSearch.ts`
- `src/features/articles/ArticleView.tsx`
- `src/features/articles/ArticleView.titleLink.test.tsx`
