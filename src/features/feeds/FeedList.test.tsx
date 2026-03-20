import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Profiler, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../articles/ArticleView', () => ({
  default: function MockArticleView({
    onTitleVisibilityChange,
  }: {
    onTitleVisibilityChange?: (isVisible: boolean) => void;
  }) {
    useEffect(() => {
      onTitleVisibilityChange?.(true);
    }, [onTitleVisibilityChange]);

    return (
      <div
        data-testid="article-scroll-container"
        onScroll={(event) => {
          onTitleVisibilityChange?.(event.currentTarget.scrollTop <= 96);
        }}
      />
    );
  },
}));

import ReaderLayout from '../reader/ReaderLayout';
import FeedList from './FeedList';
import { ToastHost } from '../toast/ToastHost';
import { useAppStore } from '../../store/appStore';
import { AI_DIGEST_VIEW_ID } from '../../lib/view';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function getFetchCallUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function getFetchCallMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  return init?.method ?? 'GET';
}

async function getFetchCallJsonBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  let bodyText: string | undefined;

  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      bodyText = await input.text();
    } catch {
      bodyText = undefined;
    }
  } else if (typeof init?.body === 'string') {
    bodyText = init.body;
  }

  if (!bodyText) return {};
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  return {};
}

describe('FeedList manage', () => {
  let lastPatchBody: Record<string, unknown> | null = null;
  let lastReorderBody: Record<string, unknown> | null = null;

  function snapshotResponseFromStore() {
    const state = useAppStore.getState();

    return jsonResponse({
      ok: true,
      data: {
        categories: state.categories.map((category, index) => ({
          id: category.id,
          name: category.name,
          position: index,
        })),
        feeds: state.feeds.map((feed) => ({
          id: feed.id,
          title: feed.title,
          url: feed.url,
          siteUrl: feed.siteUrl ?? null,
          iconUrl: feed.icon ?? null,
          enabled: feed.enabled,
          fullTextOnOpenEnabled: Boolean(feed.fullTextOnOpenEnabled),
          aiSummaryOnOpenEnabled: Boolean(feed.aiSummaryOnOpenEnabled),
          aiSummaryOnFetchEnabled: Boolean(feed.aiSummaryOnFetchEnabled),
          bodyTranslateOnFetchEnabled: Boolean(feed.bodyTranslateOnFetchEnabled),
          bodyTranslateOnOpenEnabled: Boolean(feed.bodyTranslateOnOpenEnabled),
          titleTranslateEnabled: Boolean(feed.titleTranslateEnabled),
          bodyTranslateEnabled: Boolean(feed.bodyTranslateEnabled),
          articleListDisplayMode: feed.articleListDisplayMode ?? 'card',
          categoryId: feed.categoryId ?? null,
          fetchIntervalMinutes: 30,
          lastFetchStatus: feed.fetchStatus ?? null,
          lastFetchError: feed.fetchError ?? null,
          lastFetchRawError: feed.fetchRawError ?? null,
          unreadCount: feed.unreadCount,
        })),
        articles: {
          items: state.articles.map((article) => ({
            id: article.id,
            feedId: article.feedId,
            title: article.title,
            summary: article.summary,
            author: article.author ?? null,
            publishedAt: article.publishedAt,
            link: article.link,
            isRead: article.isRead,
            isStarred: article.isStarred,
          })),
          nextCursor: null,
        },
      },
    });
  }

  function renderWithNotifications() {
    return render(
      <>
        <ReaderLayout />
        <ToastHost />
      </>,
    );
  }

  function getSnapshotRequestUrls(): string[] {
    return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([input, init]) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);
        return url.includes('/api/reader/snapshot') && method === 'GET';
      })
      .map(([input]) => getFetchCallUrl(input));
  }

  async function openMoveToCategorySubmenu() {
    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    const moveTrigger = await screen.findByRole('menuitem', { name: '移动到分类' });
    fireEvent.pointerMove(moveTrigger);
    fireEvent.keyDown(moveTrigger, { key: 'ArrowRight' });
  }

  beforeEach(() => {
    lastPatchBody = null;
    lastReorderBody = null;
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'My Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      articles: [
        {
          id: 'a-1',
          feedId: 'feed-1',
          title: 'A',
          content: '',
          summary: '',
          publishedAt: '',
          link: '',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'feed-1',
      selectedArticleId: 'a-1',
      sidebarCollapsed: false,
      snapshotLoading: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/reader/snapshot') && method === 'GET') {
          return snapshotResponseFromStore();
        }

        if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
          const body = await getFetchCallJsonBody(input, init);
          lastPatchBody = body;

          let iconUrl: string | null = null;
          if (typeof body.siteUrl === 'string') {
            try {
              const { origin } = new URL(body.siteUrl);
              iconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(origin)}`;
            } catch {
              iconUrl = null;
            }
          }

          return jsonResponse({
            ok: true,
            data: {
              id: 'feed-1',
              title: String(body.title ?? useAppStore.getState().feeds[0]?.title ?? 'My Feed'),
              url: String(body.url ?? useAppStore.getState().feeds[0]?.url ?? 'https://example.com/rss.xml'),
              siteUrl:
                (body.siteUrl as string | null | undefined) ??
                useAppStore.getState().feeds[0]?.siteUrl ??
                null,
              iconUrl,
              enabled:
                typeof body.enabled === 'boolean'
                  ? body.enabled
                  : (useAppStore.getState().feeds[0]?.enabled ?? true),
              fullTextOnOpenEnabled:
                typeof body.fullTextOnOpenEnabled === 'boolean'
                  ? body.fullTextOnOpenEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.fullTextOnOpenEnabled),
              aiSummaryOnOpenEnabled:
                typeof body.aiSummaryOnOpenEnabled === 'boolean'
                  ? body.aiSummaryOnOpenEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.aiSummaryOnOpenEnabled),
              aiSummaryOnFetchEnabled:
                typeof body.aiSummaryOnFetchEnabled === 'boolean'
                  ? body.aiSummaryOnFetchEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.aiSummaryOnFetchEnabled),
              bodyTranslateOnFetchEnabled:
                typeof body.bodyTranslateOnFetchEnabled === 'boolean'
                  ? body.bodyTranslateOnFetchEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.bodyTranslateOnFetchEnabled),
              bodyTranslateOnOpenEnabled:
                typeof body.bodyTranslateOnOpenEnabled === 'boolean'
                  ? body.bodyTranslateOnOpenEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.bodyTranslateOnOpenEnabled),
              titleTranslateEnabled:
                typeof body.titleTranslateEnabled === 'boolean'
                  ? body.titleTranslateEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.titleTranslateEnabled),
              bodyTranslateEnabled:
                typeof body.bodyTranslateEnabled === 'boolean'
                  ? body.bodyTranslateEnabled
                  : Boolean(useAppStore.getState().feeds[0]?.bodyTranslateEnabled),
              articleListDisplayMode:
                (body.articleListDisplayMode as 'card' | 'list' | undefined) ??
                useAppStore.getState().feeds[0]?.articleListDisplayMode ??
                'card',
              categoryId: Object.prototype.hasOwnProperty.call(body, 'categoryId')
                ? ((body.categoryId as string | null | undefined) ?? null)
                : (useAppStore.getState().feeds[0]?.categoryId ?? null),
              fetchIntervalMinutes: 30,
            },
          });
        }

        if (url.includes('/api/ai-digests/digest-1') && method === 'GET') {
          return jsonResponse({
            ok: true,
            data: {
              feedId: 'digest-1',
              prompt: '请解读这些文章',
              intervalMinutes: 60,
              selectedFeedIds: ['feed-1'],
            },
          });
        }

        if (url.includes('/api/rss/validate') && method === 'GET') {
          const feedUrl = new URL(url).searchParams.get('url') ?? '';
          if (feedUrl.includes('changed.example.com')) {
            return jsonResponse({
              ok: true,
              data: {
                valid: true,
                kind: 'rss',
                title: 'Validated Feed Title',
                siteUrl: 'https://changed.example.com/',
              },
            });
          }
          return jsonResponse({
            ok: true,
            data: {
              valid: true,
              kind: 'rss',
              title: 'My Feed',
              siteUrl: 'https://example.com/',
            },
          });
        }

        if (url.includes('/api/feeds/feed-1') && method === 'DELETE') {
          return jsonResponse({ ok: true, data: { deleted: true } });
        }

        if (url.includes('/api/categories/') && method === 'DELETE') {
          const categoryId = url.split('/api/categories/')[1];
          useAppStore.setState((state) => ({
            categories: state.categories.filter((item) => item.id !== categoryId),
            feeds: state.feeds.map((feed) =>
              feed.categoryId === categoryId
                ? { ...feed, categoryId: null, category: null }
                : feed,
            ),
          }));
          return jsonResponse({ ok: true, data: { deleted: true } });
        }

        if (url.includes('/api/categories/reorder') && method === 'PATCH') {
          const body = await getFetchCallJsonBody(input, init);
          lastReorderBody = body;
          const items = Array.isArray(body.items)
            ? [...body.items].sort(
                (left, right) =>
                  Number(left.position ?? 0) - Number(right.position ?? 0),
              )
            : [];

          useAppStore.setState((state) => {
            const categoryById = new Map(state.categories.map((item) => [item.id, item]));
            const ordered = items
              .map((item) => categoryById.get(String(item.id)))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));
            const uncategorized = state.categories.find((item) => item.id === 'cat-uncategorized');

            return {
              categories: uncategorized ? [...ordered, uncategorized] : ordered,
            };
          });

          return jsonResponse({
            ok: true,
            data: items.map((item, index) => {
              const category = useAppStore
                .getState()
                .categories.find((entry) => entry.id === String(item.id));
              return {
                id: String(item.id),
                name: category?.name ?? '',
                position: index,
              };
            }),
          });
        }

        if (url.includes('/api/categories/') && method === 'PATCH') {
          const categoryId = url.split('/api/categories/')[1];
          const body = await getFetchCallJsonBody(input, init);
          const nextName = String(body.name ?? '');

          useAppStore.setState((state) => ({
            categories: state.categories.map((item) =>
              item.id === categoryId ? { ...item, name: nextName } : item,
            ),
            feeds: state.feeds.map((feed) =>
              feed.categoryId === categoryId ? { ...feed, category: nextName } : feed,
            ),
          }));

          const position = useAppStore.getState().categories.findIndex((item) => item.id === categoryId);
          return jsonResponse({
            ok: true,
            data: {
              id: categoryId,
              name: nextName,
              position: position < 0 ? 0 : position,
            },
          });
        }

        if (url.includes('/api/articles/a-1/ai-summary') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: false, reason: 'missing_api_key' },
          });
        }

        if (url.includes('/api/articles/a-1/tasks') && method === 'GET') {
          return jsonResponse({
            ok: true,
            data: {
              fulltext: {
                type: 'fulltext',
                status: 'idle',
                jobId: null,
                requestedAt: null,
                startedAt: null,
                finishedAt: null,
                attempts: 0,
                errorCode: null,
                errorMessage: null,
              },
              ai_summary: {
                type: 'ai_summary',
                status: 'idle',
                jobId: null,
                requestedAt: null,
                startedAt: null,
                finishedAt: null,
                attempts: 0,
                errorCode: null,
                errorMessage: null,
              },
              ai_translate: {
                type: 'ai_translate',
                status: 'idle',
                jobId: null,
                requestedAt: null,
                startedAt: null,
                finishedAt: null,
                attempts: 0,
                errorCode: null,
                errorMessage: null,
              },
            },
          });
        }

        if (url.includes('/api/articles/a-1/ai-translate') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: false, reason: 'missing_api_key' },
          });
        }

        if (url.includes('/api/articles/a-1') && method === 'GET') {
          return jsonResponse({
            ok: true,
            data: {
              id: 'a-1',
              feedId: 'feed-1',
              dedupeKey: 'a-1',
              title: 'A',
              titleOriginal: 'A',
              titleZh: null,
              link: 'https://example.com/article',
              author: null,
              publishedAt: '2026-02-25T00:00:00.000Z',
              contentHtml: '<p>Article</p>',
              contentFullHtml: null,
              contentFullFetchedAt: null,
              contentFullError: null,
              contentFullSourceUrl: null,
              aiSummary: null,
              aiSummaryModel: null,
              aiSummarizedAt: null,
              aiTranslationBilingualHtml: null,
              aiTranslationZhHtml: null,
              aiTranslationModel: null,
              aiTranslatedAt: null,
              summary: '',
              isRead: true,
              readAt: null,
              isStarred: false,
              starredAt: null,
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens context menu and edits title', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(await screen.findByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed Updated' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0]?.title).toBe('My Feed Updated');
    });

    expect(screen.getByText('订阅源已更新')).toBeInTheDocument();
  });

  it('uses same form fields as add flow and pre-fills existing values in edit flow', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(await screen.findByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    expect(screen.getByLabelText('名称')).toHaveValue('My Feed');
    expect(screen.getByLabelText('URL')).toHaveValue('https://example.com/rss.xml');
    expect(screen.getByLabelText('分类')).toHaveValue('未分类');
    expect(screen.queryByRole('combobox', { name: '状态' })).not.toBeInTheDocument();
  });

  it('renders feed icon from persisted icon url instead of feed url derived value', () => {
    useAppStore.setState((state) => ({
      feeds: state.feeds.map((feed) =>
        feed.id === 'feed-1'
          ? {
              ...feed,
              url: 'https://rss-proxy.example.com/feed.xml',
              icon: 'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Forigin.example.com',
            }
          : feed,
      ),
    }));

    renderWithNotifications();

    const feedButton = screen.getByRole('button', { name: /My Feed.*2/ });
    const iconImg = feedButton.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null;
    expect(iconImg).toBeTruthy();
    expect(iconImg?.getAttribute('src')).toBe(
      'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Forigin.example.com',
    );
  });

  it('clears 全部文章 active classes after selecting a feed', async () => {
    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();

    const allArticlesButton = screen.getByRole('button', { name: '全部文章' });
    const feedButton = screen.getByRole('button', { name: /My Feed.*2/ });

    expect(allArticlesButton).toHaveClass('bg-primary/10', 'text-primary');
    expect(feedButton).not.toHaveClass('bg-primary/10', 'text-primary');

    fireEvent.click(feedButton);

    await waitFor(() => {
      expect(useAppStore.getState().selectedView).toBe('feed-1');
      expect(allArticlesButton).not.toHaveClass('bg-primary/10', 'text-primary');
      expect(feedButton).toHaveClass('bg-primary/10', 'text-primary');
    });
  });

  it('uses the stronger reader pane hover class for left rail items', () => {
    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();

    const starredArticlesButton = screen.getByRole('button', { name: '收藏文章' });
    const aiDigestArticlesButton = screen.getByRole('button', { name: '智能解读' });
    const categoryButton = screen.getByRole('button', { name: /未分类/ });
    const feedButton = screen.getByRole('button', { name: /My Feed.*2/ });

    expect(starredArticlesButton.className).toContain('hover:bg-[var(--reader-pane-hover)]');
    expect(aiDigestArticlesButton.className).toContain('hover:bg-[var(--reader-pane-hover)]');
    expect(categoryButton.className).toContain('hover:bg-[var(--reader-pane-hover)]');
    expect(feedButton.className).toContain('hover:bg-[var(--reader-pane-hover)]');
    expect(screen.queryByRole('button', { name: '未读文章' })).not.toBeInTheDocument();
  });

  it('renders smart views in 全部文章、收藏文章、智能解读 order', () => {
    renderWithNotifications();

    const allArticlesButton = screen.getByRole('button', { name: '全部文章' });
    const starredArticlesButton = screen.getByRole('button', { name: '收藏文章' });
    const aiDigestArticlesButton = screen.getByRole('button', { name: '智能解读' });

    expect(screen.queryByRole('button', { name: '未读文章' })).not.toBeInTheDocument();
    expect(allArticlesButton.compareDocumentPosition(starredArticlesButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      starredArticlesButton.compareDocumentPosition(aiDigestArticlesButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('switches to 智能解读 smart view after click', async () => {
    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();

    fireEvent.click(screen.getByRole('button', { name: '智能解读' }));

    await waitFor(() => {
      expect(useAppStore.getState().selectedView).toBe(AI_DIGEST_VIEW_ID);
    });
  });

  it('shows AI摘要配置 and 翻译配置 in feed context menu', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    expect(await screen.findByRole('menuitem', { name: 'AI摘要配置' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '翻译配置' })).toBeInTheDocument();
  });

  it('hides RSS-only items in feed context menu for ai_digest feeds', async () => {
    useAppStore.setState((state) => ({
      ...state,
      feeds: [
        {
          ...state.feeds[0],
          id: 'digest-1',
          kind: 'ai_digest',
          title: 'My Digest',
          url: 'http://localhost/__feedfuse_ai_digest__/digest-1',
          unreadCount: 0,
        },
      ],
      selectedView: 'digest-1',
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Digest/ }));

    await screen.findByRole('menuitem', { name: '移动到分类' });

    expect(screen.queryByRole('menuitem', { name: '全文抓取配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'AI摘要配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '翻译配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '查看已过滤文章' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '隐藏已过滤文章' })).not.toBeInTheDocument();

    expect(screen.getByRole('menuitem', { name: '编辑' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '移动到分类' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '停用' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument();
  });

  it('opens edit dialog from context menu for ai_digest feeds', async () => {
    useAppStore.setState((state) => ({
      ...state,
      feeds: [
        {
          ...state.feeds[0],
          id: 'digest-1',
          kind: 'ai_digest',
          title: 'My Digest',
          url: 'http://localhost/__feedfuse_ai_digest__/digest-1',
          unreadCount: 0,
        },
      ],
      selectedView: 'digest-1',
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Digest/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));

    expect(await screen.findByRole('dialog', { name: '编辑 AI 解读源' })).toBeInTheDocument();
  });


  it('renders feed context menu with shared compact surface classes', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    await screen.findByRole('menuitem', { name: '编辑' });
    const menu = await screen.findByRole('menu');

    expect(menu).toHaveClass('bg-popover');
    expect(menu).not.toHaveClass('border');
    expect(menu).not.toHaveClass('w-64');
  });

  it('renders category context menu with the same shared surface language', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          ...state.feeds[0],
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: '科技' }));

    await screen.findByRole('menuitem', { name: '编辑' });
    const menu = await screen.findByRole('menu');

    expect(menu).toHaveClass('bg-popover');
    expect(menu).not.toHaveClass('border');
  });

  it('renders category groups by category order from store', () => {
    useAppStore.setState({
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-tech',
          title: 'Tech Feed',
          url: 'https://example.com/tech.xml',
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          categoryId: 'cat-tech',
          category: '科技',
        },
        {
          id: 'feed-design',
          title: 'Design Feed',
          url: 'https://example.com/design.xml',
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          categoryId: 'cat-design',
          category: '设计',
        },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
      sidebarCollapsed: false,
      snapshotLoading: false,
    });

    renderWithNotifications();

    const headers = screen.getAllByRole('button', { name: /设计|科技|未分类/ });
    expect(headers.map((item) => item.textContent)).toEqual(['设计', '科技']);
  });

  it('does not render the standalone 管理分类 entry anymore', () => {
    renderWithNotifications();
    expect(screen.queryByRole('button', { name: '管理分类' })).not.toBeInTheDocument();
  });

  it('supports arrow keys on category headers and exposes expanded state', async () => {
    renderWithNotifications();

    const uncategorizedButton = screen.getByRole('button', { name: '未分类' });

    expect(uncategorizedButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(uncategorizedButton, { key: 'ArrowLeft' });

    await waitFor(() => {
      expect(uncategorizedButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: /My Feed.*2/ })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(uncategorizedButton, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(uncategorizedButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /My Feed.*2/ })).toBeInTheDocument();
    });
  });

  it('opens rename dialog from category context menu', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'My Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: 'cat-design',
          category: '设计',
        },
      ],
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: '设计' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));

    expect(await screen.findByRole('dialog', { name: '重命名分类' })).toBeInTheDocument();
  });

  it('wraps long category names in rename dialog description', async () => {
    const longCategoryName = '这是一个非常非常长的分类名称🙂 مع اسم تصنيف طويل للغاية for dialog hardening';

    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-long', name: longCategoryName, expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'My Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: 'cat-long',
          category: longCategoryName,
        },
      ],
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: longCategoryName }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));

    const description = screen.getByText(`更新「${longCategoryName}」的分类名称。`);
    expect(description).toHaveClass('break-words');
  });

  it('moves category down from the context menu', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-design',
          title: 'Design Feed',
          url: 'https://example.com/design.xml',
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: 'cat-design',
          category: '设计',
        },
        {
          id: 'feed-tech',
          title: 'Tech Feed',
          url: 'https://example.com/tech.xml',
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: '设计' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '下移' }));

    await waitFor(() => {
      expect(lastReorderBody).toEqual({
        items: [
          { id: 'cat-tech', position: 0 },
          { id: 'cat-design', position: 1 },
        ],
      });
    });
  });

  it('keeps uncategorized fallback semantics after deleting a category', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'My Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: '科技' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      const [feed] = useAppStore.getState().feeds;
      expect(feed?.categoryId).toBeNull();
      expect(feed?.category).toBeNull();
      expect(useAppStore.getState().categories).toEqual([
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ]);
    });
  });

  it('opens summary policy dialog from context menu and saves patch', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'AI摘要配置' }));

    expect(await screen.findByRole('dialog', { name: 'AI 摘要配置' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动生成摘要' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(lastPatchBody).toEqual({
        aiSummaryOnFetchEnabled: true,
        aiSummaryOnOpenEnabled: false,
      });
    });
  });

  it('opens fulltext policy dialog from feed context menu and saves patch', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '全文抓取配置' }));

    expect(await screen.findByRole('dialog', { name: '全文抓取配置' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动抓取全文' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(lastPatchBody).toEqual({
        fullTextOnOpenEnabled: true,
      });
    });
  });


  it('toggles filtered article visibility from feed context menu and refreshes current snapshot', async () => {
    renderWithNotifications();
    expect(getSnapshotRequestUrls()).toEqual([]);
    const feedPane = screen.getByTestId('reader-feed-pane');

    fireEvent.contextMenu(within(feedPane).getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '查看已过滤文章' }));

    await waitFor(() => {
      expect(useAppStore.getState().showFilteredByFeedId['feed-1']).toBe(true);
      const lastSnapshotUrl = getSnapshotRequestUrls().at(-1) ?? '';
      expect(lastSnapshotUrl).toContain('/api/reader/snapshot?view=feed-1');
      expect(lastSnapshotUrl).toContain('includeFiltered=true');
    });

    fireEvent.contextMenu(within(feedPane).getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '隐藏已过滤文章' }));

    await waitFor(() => {
      expect(useAppStore.getState().showFilteredByFeedId['feed-1']).toBe(false);
      const lastSnapshotUrl = getSnapshotRequestUrls().at(-1) ?? '';
      expect(lastSnapshotUrl).toContain('/api/reader/snapshot?view=feed-1');
      expect(lastSnapshotUrl).not.toContain('includeFiltered=true');
    });
  });

  it('opens translation policy dialog from context menu and saves patch', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '翻译配置' }));

    expect(await screen.findByRole('dialog', { name: '翻译配置' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动翻译标题' }));
    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动翻译正文' }));
    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动翻译正文' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(lastPatchBody).toEqual({
        titleTranslateEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        bodyTranslateOnOpenEnabled: true,
      });
    });
  });

  it('shows move-to-category submenu in category order', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          ...state.feeds[0],
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();
    await openMoveToCategorySubmenu();

    expect(screen.getByRole('menuitem', { name: '设计' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '科技' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '未分类' })).toBeInTheDocument();
  });

  it('renders move-to-category submenu in a separate popper layer', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          ...state.feeds[0],
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();
    await openMoveToCategorySubmenu();

    const menus = screen.getAllByRole('menu');
    const parentMenu = menus[0];
    const submenu = menus[menus.length - 1];
    const submenuItem = within(submenu).getByRole('menuitem', { name: '设计' });
    const submenuWrapper = submenu.closest('[data-radix-popper-content-wrapper]');

    expect(submenu).not.toBe(parentMenu);
    expect(submenuWrapper).not.toBeNull();
    expect(submenuWrapper?.parentElement).toBe(document.body);
    expect(parentMenu).not.toContainElement(submenuItem);
  });

  it('marks the current category inside move-to-category submenu', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          ...state.feeds[0],
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();
    await openMoveToCategorySubmenu();

    const currentCategoryItem = screen.getByRole('menuitem', { name: '科技' });
    const currentCategoryLabel = within(currentCategoryItem).getByText('科技');
    const currentCategoryHint = within(currentCategoryItem).getByText('当前');
    const currentCategoryIcon = currentCategoryLabel.previousElementSibling as HTMLElement | null;

    expect(currentCategoryHint).toBeInTheDocument();
    expect(currentCategoryItem).toHaveAttribute('data-disabled', '');
    expect(currentCategoryIcon).not.toBeNull();
    expect(currentCategoryIcon).toHaveClass('text-primary');
    expect(currentCategoryIcon?.className).not.toContain('emerald');
    expect(currentCategoryHint).toHaveClass('border-primary/20', 'bg-primary/10', 'text-primary');
    expect(currentCategoryHint.className).not.toContain('emerald');
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument();
  });

  it('moves feed to selected category from context submenu', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          ...state.feeds[0],
          categoryId: 'cat-design',
          category: '设计',
        },
      ],
    }));

    renderWithNotifications();
    await openMoveToCategorySubmenu();

    expect(screen.getByRole('menuitem', { name: '设计' })).toHaveAttribute('data-disabled', '');

    fireEvent.click(screen.getByRole('menuitem', { name: '科技' }));

    await waitFor(() => {
      expect(lastPatchBody).toEqual({ categoryId: 'cat-tech' });
    });
    expect(screen.getByText('已移动到「科技」')).toBeInTheDocument();
  });

  it('moves feed to uncategorized from context submenu', async () => {
    useAppStore.setState((state) => ({
      ...state,
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          ...state.feeds[0],
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
    }));

    renderWithNotifications();
    await openMoveToCategorySubmenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '未分类' }));

    await waitFor(() => {
      expect(lastPatchBody).toEqual({ categoryId: null });
    });
    expect(screen.getByText('已移动到「未分类」')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '科技' })).not.toBeInTheDocument();
  });

  it('disables uncategorized target when feed is already uncategorized', async () => {
    renderWithNotifications();
    await openMoveToCategorySubmenu();

    const uncategorizedItem = screen.getByRole('menuitem', { name: '未分类' });
    const uncategorizedLabel = within(uncategorizedItem).getByText('未分类');
    const uncategorizedHint = within(uncategorizedItem).getByText('当前');
    const uncategorizedIcon = uncategorizedLabel.previousElementSibling as HTMLElement | null;

    expect(uncategorizedItem).toHaveAttribute('data-disabled', '');
    expect(uncategorizedIcon).not.toBeNull();
    expect(uncategorizedIcon).toHaveClass('text-primary');
    expect(uncategorizedIcon?.className).not.toContain('emerald');
    expect(uncategorizedHint).toHaveClass('border-primary/20', 'bg-primary/10', 'text-primary');
    expect(uncategorizedHint.className).not.toContain('emerald');
  });

  it('keeps the main feed context menu compact without secondary status hints', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    const menu = await screen.findByRole('menu');
    const moveTrigger = screen.getByRole('menuitem', { name: '移动到分类' });
    const toggleItem = screen.getByRole('menuitem', { name: '停用' });

    expect(menu).toHaveClass('w-48');
    expect(menu.className).not.toContain('w-52');
    expect(within(moveTrigger).queryByText('未分类')).not.toBeInTheDocument();
    expect(within(toggleItem).queryByText('当前已启用')).not.toBeInTheDocument();
  });

  it('disables save after edit url until validation succeeds', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(await screen.findByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: '保存' });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://changed.example.com/rss.xml' },
    });

    expect(saveButton).toBeDisabled();

    fireEvent.blur(urlInput);
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });

  it('overwrites title on url validation success in edit flow', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(await screen.findByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    const titleInput = screen.getByLabelText('名称');
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(titleInput, { target: { value: 'Custom Title' } });
    fireEvent.change(urlInput, {
      target: { value: 'https://changed.example.com/rss.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(titleInput).toHaveValue('Validated Feed Title');
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].title).toBe('Validated Feed Title');
      expect(useAppStore.getState().feeds[0].url).toBe('https://changed.example.com/rss.xml');
    });

    expect(lastPatchBody?.url).toBe('https://changed.example.com/rss.xml');
    expect(lastPatchBody?.siteUrl).toBe('https://changed.example.com/');
  });

  it('toggles enabled via context menu', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '停用' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].enabled).toBe(false);
    });

    expect(screen.getByText('已停用订阅源')).toBeInTheDocument();
  });

  it('deletes feed and falls back selectedView to all', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(screen.queryByText('My Feed')).not.toBeInTheDocument();
      expect(useAppStore.getState().selectedView).toBe('all');
      expect(useAppStore.getState().selectedArticleId).toBeNull();
    });

    expect(screen.getByText('已删除订阅源')).toBeInTheDocument();
  });

  it('wraps long feed titles in delete confirmation description', async () => {
    const longFeedTitle = '这是一个非常非常长的订阅源标题🙂 مع عنوان طويل للغاية for delete dialog hardening';

    useAppStore.setState((state) => ({
      ...state,
      feeds: [
        {
          ...state.feeds[0],
          id: 'feed-1',
          title: longFeedTitle,
          unreadCount: 2,
        },
      ],
    }));

    renderWithNotifications();

    const trigger = screen
      .getAllByText(longFeedTitle)
      .find((item) => item.closest('button')?.getAttribute('type') === 'button')
      ?.closest('button');
    expect(trigger).toBeTruthy();

    fireEvent.contextMenu(trigger as HTMLElement);
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));

    const dialog = screen.getByRole('alertdialog');
    const description = within(dialog).getByText(
      (_, element) =>
        element?.tagName === 'P' &&
        (element.textContent?.includes(`确定删除「${longFeedTitle}」？`) ?? false),
    );

    expect(description).toHaveClass('break-words');
  });

  it('shows error notification when toggle enabled fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
          return jsonResponse({
            ok: false,
            error: {
              code: 'validation_error',
              message: '更新失败，请稍后重试',
            },
          });
        }

        if (url.includes('/api/articles/a-1/tasks') && method === 'GET') {
          return jsonResponse({
            ok: true,
            data: {
              fulltext: {
                type: 'fulltext',
                status: 'idle',
                jobId: null,
                requestedAt: null,
                startedAt: null,
                finishedAt: null,
                attempts: 0,
                errorCode: null,
                errorMessage: null,
              },
              ai_summary: {
                type: 'ai_summary',
                status: 'idle',
                jobId: null,
                requestedAt: null,
                startedAt: null,
                finishedAt: null,
                attempts: 0,
                errorCode: null,
                errorMessage: null,
              },
              ai_translate: {
                type: 'ai_translate',
                status: 'idle',
                jobId: null,
                requestedAt: null,
                startedAt: null,
                finishedAt: null,
                attempts: 0,
                errorCode: null,
                errorMessage: null,
              },
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '停用' }));

    expect(await screen.findByText('更新失败，请稍后重试')).toBeInTheDocument();
    expect(screen.queryByText('操作失败：输入不合法。')).not.toBeInTheDocument();
  });

  it('shows tooltip and prefers fetchRawError for feeds with fetchError', async () => {
    useAppStore.setState({
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      feeds: [
        {
          id: 'feed-1',
          title: 'Broken Feed',
          url: 'https://example.com/rss.xml',
          siteUrl: null,
          icon: undefined,
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          category: null,
          fetchStatus: 403,
          fetchError: '更新失败：源站拒绝访问（HTTP 403）',
          fetchRawError: 'HTTP 403 from upstream',
        },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    render(
      <>
        <ReaderLayout />
        <ToastHost />
      </>,
    );

    const feedButton = screen.getByRole('button', { name: /Broken Feed/i });
    fireEvent.mouseEnter(feedButton);

    expect((await screen.findAllByText('更新失败')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('HTTP 403 from upstream')).length).toBeGreaterThan(0);
    expect(feedButton.className).toMatch(/destructive|red/);
  });

  it('returns to normal styling after fetchError is cleared', async () => {
    useAppStore.setState({
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      feeds: [
        {
          id: 'feed-1',
          title: 'Broken Feed',
          url: 'https://example.com/rss.xml',
          siteUrl: null,
          icon: undefined,
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          category: null,
          fetchStatus: 403,
          fetchError: '更新失败：源站拒绝访问（HTTP 403）',
        },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    render(
      <>
        <ReaderLayout />
        <ToastHost />
      </>,
    );

    const feedButton = screen.getByRole('button', { name: /Broken Feed/i });
    fireEvent.mouseEnter(feedButton);

    expect((await screen.findAllByText('更新失败')).length).toBeGreaterThan(0);

    act(() => {
      useAppStore.setState((state) => ({
        feeds: state.feeds.map((feed) =>
          feed.id === 'feed-1' ? { ...feed, fetchStatus: null, fetchError: null } : feed,
        ),
      }));
    });

    await waitFor(() => {
      expect(screen.queryAllByText('更新失败')).toHaveLength(0);
      expect(screen.queryAllByText('更新失败：源站拒绝访问（HTTP 403）')).toHaveLength(0);
      expect(screen.getByRole('button', { name: /Broken Feed/i }).className).not.toMatch(/destructive|red/);
    });
  });

  it('opens add menu and shows RSS + AI digest entries', async () => {
    render(<FeedList />);

    fireEvent.click(screen.getByRole('button', { name: '添加订阅' }));

    expect(await screen.findByRole('button', { name: '添加 RSS 源' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加 AI解读' })).toBeInTheDocument();
  });

  it('does not commit again when unrelated app store state changes', () => {
    let commitCount = 0;

    render(
      <Profiler
        id="feed-list"
        onRender={() => {
          commitCount += 1;
        }}
      >
        <>
          <ToastHost />
          <FeedList />
        </>
      </Profiler>,
    );

    const baselineCommitCount = commitCount;

    act(() => {
      useAppStore.setState({ sidebarCollapsed: true });
    });

    expect(commitCount).toBe(baselineCommitCount);
  });
});
