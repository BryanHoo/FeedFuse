import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import ReaderLayout from '../reader/ReaderLayout';
import { ToastHost } from '../toast/ToastHost';
import { useAppStore } from '../../store/appStore';
import { validateRssUrl } from './services/rssValidationService';

const { runImmediateOperationMock } = vi.hoisted(() => ({
  runImmediateOperationMock: vi.fn(),
}));

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
    // ignore parse failures for tests
  }
  return {};
}

vi.mock('./services/rssValidationService', () => ({
  validateRssUrl: vi.fn(async (url: string) => {
    if (url.includes('success')) {
      return {
        ok: true,
        kind: 'rss' as const,
        title: 'Mock Feed Title',
        siteUrl: 'https://example.com/',
      };
    }
    return { ok: false, errorCode: 'not_feed' as const };
  }),
}));

vi.mock('../notifications/userOperationNotifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notifications/userOperationNotifier')>();

  return {
    ...actual,
    runImmediateOperation: (input: Parameters<typeof actual.runImmediateOperation>[0]) => {
      runImmediateOperationMock(input);
      return actual.runImmediateOperation(input);
    },
  };
});

describe('AddFeedDialog', () => {
  let nextFeedId = 1;
  let lastCreateFeedBody: Record<string, unknown> | null = null;
  let createdFeedById: Map<
    string,
    {
      title: string;
      url: string;
      categoryId: string | null;
      fullTextOnOpenEnabled: boolean;
      aiSummaryOnOpenEnabled: boolean;
      aiSummaryOnFetchEnabled: boolean;
      bodyTranslateOnFetchEnabled: boolean;
      bodyTranslateOnOpenEnabled: boolean;
    }
  >;

  beforeEach(() => {
    nextFeedId = 1;
    lastCreateFeedBody = null;
    createdFeedById = new Map();
    runImmediateOperationMock.mockReset();
    useAppStore.setState({
      feeds: [],
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds/') && url.endsWith('/refresh') && method === 'POST') {
          return jsonResponse({ ok: true, data: { enqueued: true, jobId: 'job-1' } });
        }

        if (url.includes('/api/feeds') && method === 'POST') {
          const body = await getFetchCallJsonBody(input, init);
          lastCreateFeedBody = body;
          const id = `feed-${nextFeedId++}`;
          createdFeedById.set(id, {
            title: String(body.title ?? ''),
            url: String(body.url ?? ''),
            categoryId: (body.categoryId as string | null | undefined) ?? null,
            fullTextOnOpenEnabled: Boolean(body.fullTextOnOpenEnabled ?? false),
            aiSummaryOnOpenEnabled: Boolean(body.aiSummaryOnOpenEnabled ?? false),
            aiSummaryOnFetchEnabled: Boolean(body.aiSummaryOnFetchEnabled ?? false),
            bodyTranslateOnFetchEnabled: Boolean(body.bodyTranslateOnFetchEnabled ?? false),
            bodyTranslateOnOpenEnabled: Boolean(body.bodyTranslateOnOpenEnabled ?? false),
          });
          return jsonResponse({
            ok: true,
            data: {
              id,
              title: String(body.title ?? ''),
              url: String(body.url ?? ''),
              siteUrl: null,
              iconUrl: null,
              enabled: true,
              fullTextOnOpenEnabled: Boolean(body.fullTextOnOpenEnabled ?? false),
              aiSummaryOnOpenEnabled: Boolean(body.aiSummaryOnOpenEnabled ?? false),
              aiSummaryOnFetchEnabled: Boolean(body.aiSummaryOnFetchEnabled ?? false),
              bodyTranslateOnFetchEnabled: Boolean(body.bodyTranslateOnFetchEnabled ?? false),
              bodyTranslateOnOpenEnabled: Boolean(body.bodyTranslateOnOpenEnabled ?? false),
              categoryId: body.categoryId ?? null,
              fetchIntervalMinutes: 30,
              unreadCount: 0,
            },
          });
        }

        if (url.includes('/api/reader/snapshot') && method === 'GET') {
          const view = new URL(url).searchParams.get('view') ?? 'all';
          const isFeedView = view.startsWith('feed-');
          const createdFeed = createdFeedById.get(view);

          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: isFeedView
                ? [
                    {
                      id: view,
                      title: createdFeed?.title ?? 'Mock Feed',
                      url: createdFeed?.url ?? 'https://example.com/feed.xml',
                      siteUrl: null,
                      iconUrl: null,
                      enabled: true,
                      fullTextOnOpenEnabled: createdFeed?.fullTextOnOpenEnabled ?? false,
                      aiSummaryOnOpenEnabled: createdFeed?.aiSummaryOnOpenEnabled ?? false,
                      aiSummaryOnFetchEnabled: createdFeed?.aiSummaryOnFetchEnabled ?? false,
                      bodyTranslateOnFetchEnabled: createdFeed?.bodyTranslateOnFetchEnabled ?? false,
                      bodyTranslateOnOpenEnabled: createdFeed?.bodyTranslateOnOpenEnabled ?? false,
                      categoryId: createdFeed?.categoryId ?? null,
                      fetchIntervalMinutes: 30,
                      unreadCount: 1,
                    },
                  ]
                : [],
              articles: {
                items: isFeedView
                  ? [
                      {
                        id: `art-${view}`,
                        feedId: view,
                        title: 'Mock Article',
                        summary: 'Summary',
                        author: null,
                        publishedAt: '2026-02-25T00:00:00.000Z',
                        link: 'https://example.com/article',
                        isRead: false,
                        isStarred: false,
                      },
                    ]
                  : [],
                nextCursor: null,
              },
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

  function renderWithNotifications() {
    return render(
      <>
        <ReaderLayout />
        <ToastHost />
      </>,
    );
  }

  async function openAddFeedDialog() {
    fireEvent.click(screen.getByLabelText('添加订阅'));
    fireEvent.click(await screen.findByRole('button', { name: '添加 RSS 源' }));
    return screen.findByRole('dialog', { name: '添加 RSS 源' });
  }

  it('opens and closes add feed dialog', async () => {
    renderWithNotifications();
    await openAddFeedDialog();
    expect(screen.getByRole('dialog', { name: '添加 RSS 源' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭添加 RSS 源' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
  });

  it('disables submit until title and url are filled', async () => {
    renderWithNotifications();
    await openAddFeedDialog();
    expect(screen.getByRole('button', { name: '添加订阅源' })).toBeDisabled();
  });

  it('autofocuses url input on open', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    const urlInput = screen.getByLabelText('URL');
    expect(urlInput).toHaveFocus();
  });

  it('add dialog only shows URL 名称 分类 fields', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toBeInTheDocument();
    expect(screen.getByLabelText('分类')).toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: '打开文章时抓取全文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '收到新文章时自动生成摘要' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '打开文章时自动生成摘要' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '收到新文章时自动翻译标题' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '收到新文章时自动翻译正文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '打开文章时自动翻译正文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '正文翻译' })).not.toBeInTheDocument();
  });

  it('auto fills title when validation succeeds and title is empty', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    const titleInput = screen.getByLabelText('名称');
    const urlInput = screen.getByLabelText('URL');

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(titleInput).toHaveValue('Mock Feed Title');
    });
  });

  it('overwrites title when validation succeeds even if title already has value', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    const titleInput = screen.getByLabelText('名称');
    const urlInput = screen.getByLabelText('URL');

    fireEvent.change(titleInput, { target: { value: 'Custom Title' } });
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(titleInput).toHaveValue('Mock Feed Title');
    });
  });

  it('submits add feed dialog and closes after valid input', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
    });

    expect(lastCreateFeedBody).toBeTruthy();
    expect(lastCreateFeedBody).not.toHaveProperty('fullTextOnOpenEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('aiSummaryOnOpenEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('aiSummaryOnFetchEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('bodyTranslateOnFetchEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('bodyTranslateOnOpenEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('titleTranslateEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('bodyTranslateEnabled');
  });

  it('submits validated siteUrl in create payload', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
    });

    expect(lastCreateFeedBody).toBeTruthy();
    expect(lastCreateFeedBody?.siteUrl).toBe('https://example.com/');
  });

  it('submit add feed payload excludes policy flags', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Base Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/success.xml' } });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
    });

    expect(lastCreateFeedBody).toEqual({
      title: 'Mock Feed Title',
      url: 'https://example.com/success.xml',
      siteUrl: 'https://example.com/',
      categoryId: 'cat-tech',
    });
  });

  it('requires successful validation before save', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });

    const submitButton = screen.getByRole('button', { name: '添加订阅源' });
    expect(submitButton).toBeDisabled();

    fireEvent.blur(urlInput);
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/changed.xml' },
    });
    expect(submitButton).toBeDisabled();
  });

  it('hides url feedback while editing again before the next blur', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByText('链接可用，已识别为 RSS 源。')).toBeInTheDocument();
      expect(urlInput).toHaveAttribute('aria-invalid', 'false');
    });

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/edited.xml' },
    });

    expect(screen.queryByText('链接可用，已识别为 RSS 源。')).not.toBeInTheDocument();
    expect(screen.queryByText('请先验证可用的 RSS 地址。')).not.toBeInTheDocument();
    expect(screen.queryByText('暂时无法验证该链接，请检查后重试。')).not.toBeInTheDocument();
    expect(urlInput).toHaveAttribute('aria-invalid', 'false');
  });

  it('keeps url field in validating state instead of showing an error immediately after blur', async () => {
    let resolveValidation:
      | ((value: Awaited<ReturnType<typeof validateRssUrl>>) => void)
      | undefined;
    vi.mocked(validateRssUrl).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveValidation = resolve;
        }),
    );

    renderWithNotifications();
    await openAddFeedDialog();

    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/pending.xml' },
    });

    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByText('验证中')).toBeInTheDocument();
      expect(screen.getByText('正在验证链接…')).toBeInTheDocument();
    });

    expect(screen.queryByText('请先验证可用的 RSS 地址。')).not.toBeInTheDocument();
    expect(urlInput).toHaveAttribute('aria-invalid', 'false');

    resolveValidation?.({
      ok: true,
      kind: 'rss',
      title: 'Pending Feed Title',
      siteUrl: 'https://example.com/',
    });

    await waitFor(() => {
      expect(screen.getByText('验证成功')).toBeInTheDocument();
      expect(urlInput).toHaveAttribute('aria-invalid', 'false');
    });
  });

  it('falls back to failed validation state when validation throws unexpectedly', async () => {
    vi.mocked(validateRssUrl).mockRejectedValueOnce(new Error('socket hang up'));

    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/broken.xml' },
    });

    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByText('验证失败')).toBeInTheDocument();
      expect(screen.getByText('暂时无法验证该链接，请检查后重试。')).toBeInTheDocument();
      expect(screen.getByLabelText('URL')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeDisabled();
    });
  });

  it('renders inline submit error when add feed request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds') && method === 'POST') {
          return jsonResponse({
            ok: false,
            error: {
              code: 'conflict',
              message: '订阅源已存在',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Notify Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));

    const dialog = screen.getByRole('dialog', { name: '添加 RSS 源' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('订阅源已存在');
    expect(dialog).toBeInTheDocument();
  });

  it('submits selected categoryId from category dropdown', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Category Id Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    const categoryInput = screen.getByLabelText('分类');
    fireEvent.focus(categoryInput);
    fireEvent.click(categoryInput);
    expect(await screen.findByRole('listbox', { name: '分类建议' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '设计' }));
    expect(categoryInput).toHaveValue('设计');
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    const feedCountBefore = useAppStore.getState().feeds.length;
    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds.length).toBe(feedCountBefore + 1);
    });

    const added = useAppStore
      .getState()
      .feeds.find((item) => item.url === 'https://example.com/success.xml');
    expect(added?.categoryId).toBe('cat-design');
  });

  it('submits categoryName when user enters a new category', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('分类'), {
      target: { value: '新分类' },
    });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/success.xml' } });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));

    await waitFor(() => {
      expect(lastCreateFeedBody).toMatchObject({ categoryName: '新分类' });
      expect(lastCreateFeedBody?.categoryId).toBeUndefined();
    });
  });

  it('reuses existing categoryId when input only differs by spaces', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('分类'), {
      target: { value: '  科技  ' },
    });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/success.xml' } });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));

    await waitFor(() => {
      expect(lastCreateFeedBody).toMatchObject({ categoryId: 'cat-tech' });
      expect(lastCreateFeedBody?.categoryName).toBeUndefined();
    });
  });

  it('keeps category option order in add feed dialog after entry migration', async () => {
    useAppStore.setState({
      categories: [
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
      ],
      feeds: [],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();
    await openAddFeedDialog();

    const categoryInput = screen.getByLabelText('分类');
    fireEvent.focus(categoryInput);
    fireEvent.click(categoryInput);

    const optionValues = (await screen.findAllByRole('option')).map((item) => item.textContent);

    expect(optionValues).toEqual(['未分类', '设计', '科技']);
  });

  it('shows success notification after add feed succeeds', async () => {
    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Notify Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));

    await waitFor(() => {
      expect(screen.getByText('已添加订阅源')).toBeInTheDocument();
    });
    expect(screen.queryAllByText('已添加订阅源')).toHaveLength(1);
    expect(runImmediateOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'feed.create' }),
    );
  });

  it('shows error notification after add feed fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds') && method === 'POST') {
          return jsonResponse({
            ok: false,
            error: {
              code: 'conflict',
              message: '订阅源已存在',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    renderWithNotifications();
    await openAddFeedDialog();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Notify Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加订阅源' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加订阅源' }));

    expect(
      await within(screen.getByTestId('notification-viewport')).findByText(
        '添加订阅源失败：订阅源已存在',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('操作失败：数据已存在。')).not.toBeInTheDocument();
  });
});
