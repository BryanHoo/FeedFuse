import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from '../../../features/articles/components/ArticleView';
import { useAppStore } from '../../../store/appStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { defaultPersistedSettings } from '../../../features/settings/settingsSchema';

type ApiClientModule = typeof import('@/lib/api/apiClient');

const idleTasks = {
  fulltext: {
    type: 'fulltext' as const,
    status: 'idle' as const,
    jobId: null,
    requestedAt: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  },
  ai_summary: {
    type: 'ai_summary' as const,
    status: 'idle' as const,
    jobId: null,
    requestedAt: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  },
  ai_translate: {
    type: 'ai_translate' as const,
    status: 'idle' as const,
    jobId: null,
    requestedAt: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  },
};

vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('@/lib/api/apiClient');
  return {
    ...actual,
    enqueueArticleAiSummary: vi.fn(),
    enqueueArticleFulltext: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function setupResizeObserverMock() {
  const original = globalThis.ResizeObserver;

  class MockResizeObserver {
    constructor() {}

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver);

  return {
    restore() {
      if (original) {
        vi.stubGlobal('ResizeObserver', original);
        return;
      }

      vi.unstubAllGlobals();
    },
  };
}

async function renderArticleViewWithContent(content: string, highlightQuery = '') {
  useAppStore.setState({
    feeds: [
      {
        id: 'feed-1',
        title: 'Feed 1',
        url: 'https://example.com/rss.xml',
        unreadCount: 0,
        enabled: true,
        fullTextOnOpenEnabled: false,
        aiSummaryOnOpenEnabled: false,
        categoryId: 'cat-uncategorized',
        category: '未分类',
      },
    ],
    categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
    articles: [
      {
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Article 1',
        content,
        summary: 'summary',
        publishedAt: new Date('2026-03-07T00:00:00.000Z').toISOString(),
        link: 'https://example.com/a1',
        isRead: true,
        isStarred: false,
      },
    ],
    selectedView: 'all',
    selectedArticleId: 'article-1',
    refreshArticle: vi.fn().mockResolvedValue({
      hasFulltext: false,
      hasFulltextError: false,
      hasAiSummary: false,
      hasAiTranslation: false,
    }),
  });

  const view = render(<ArticleView highlightQuery={highlightQuery} />);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return view;
}

describe('ArticleView image preview', () => {
  let resizeObserver: ReturnType<typeof setupResizeObserverMock>;

  beforeEach(async () => {
    resizeObserver = setupResizeObserverMock();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });

    const apiClient = await import('@/lib/api/apiClient');
    vi.mocked(apiClient.enqueueArticleAiSummary).mockReset();
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);

    useSettingsStore.setState((state) => ({
      ...state,
      persistedSettings: {
        ...structuredClone(defaultPersistedSettings),
        general: {
          ...structuredClone(defaultPersistedSettings.general),
          autoMarkReadEnabled: false,
          autoMarkReadDelayMs: 0,
        },
      },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    resizeObserver.restore();
  });

  function setNoImageMode(enabled: boolean) {
    act(() => {
      useSettingsStore.setState((state) => ({
        persistedSettings: {
          ...state.persistedSettings,
          general: { ...state.persistedSettings.general, noImageMode: enabled },
        },
      }));
    });
  }

  it('defers all image sources and loads only the clicked image before allowing preview', async () => {
    setNoImageMode(true);
    await renderArticleViewWithContent(
      '<p>正文</p><img src="https://example.com/a.jpg" srcset="https://example.com/a@2x.jpg 2x" alt="配图一" width="1200" height="800"><img src="https://example.com/b.jpg" alt="配图二">',
    );
    const content = screen.getByTestId('article-html-content');
    expect(content.querySelector('img, source[srcset]')).toBeNull();
    const first = within(content).getByRole('button', { name: '加载图片：配图一' });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(first).not.toHaveAttribute('width');

    fireEvent.click(first);

    const image = content.querySelector('img')!;
    expect(image).toHaveAttribute('src', 'https://example.com/a.jpg');
    expect(image).toHaveAttribute('srcset', 'https://example.com/a@2x.jpg 2x');
    expect(image).toHaveAttribute('width', '1200');
    expect(image.closest('[aria-busy="true"]')).not.toBeNull();
    expect(within(content).getByText('图片加载中…')).toBeInTheDocument();
    expect(content.querySelectorAll('img')).toHaveLength(1);
    expect(within(content).getByRole('button', { name: '加载图片：配图二' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();

    fireEvent.click(within(content).getByRole('button', { name: '查看大图：配图一' }));
    expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
  });

  it.each(['Enter', ' '])('loads a picture with responsive sources using the %j key', async (key) => {
    setNoImageMode(true);
    await renderArticleViewWithContent(
      '<picture><source media="(min-width: 800px)" srcset="https://example.com/wide.jpg"><img src="https://example.com/small.jpg" alt="响应式配图"></picture>',
    );
    const content = screen.getByTestId('article-html-content');
    expect(content.querySelector('picture, img, source')).toBeNull();
    const placeholder = within(content).getByRole('button', { name: '加载图片：响应式配图' });
    placeholder.focus();
    fireEvent.keyDown(placeholder, { key });

    expect(content.querySelector('picture source')).toHaveAttribute('srcset', 'https://example.com/wide.jpg');
    const image = within(content).getByRole('button', { name: '查看大图：响应式配图' });
    expect(image).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
  });

  it('prevents navigation on the first click of a linked image placeholder', async () => {
    setNoImageMode(true);
    await renderArticleViewWithContent(
      '<a href="https://example.com/original"><img src="https://example.com/linked.jpg" alt="链接配图"></a>',
    );
    const content = screen.getByTestId('article-html-content');
    const placeholder = within(content).getByRole('button', { name: '加载图片：链接配图' });
    expect(fireEvent.click(placeholder)).toBe(false);
    expect(content.querySelector('a')).toHaveAttribute('href', 'https://example.com/original');
    expect(content.querySelector('img')).toHaveAttribute('src', 'https://example.com/linked.jpg');
    expect(content.querySelector('img')).not.toHaveAttribute('role');
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
  });

  it('keeps revealed images on unrelated renders and resets them when switching articles', async () => {
    setNoImageMode(true);
    await renderArticleViewWithContent('<img src="https://example.com/a.jpg" alt="配图">');
    fireEvent.click(screen.getByRole('button', { name: '加载图片：配图' }));
    act(() => {
      useAppStore.setState((state) => ({ articles: state.articles.map((article) => ({ ...article, title: '新标题' })) }));
    });
    expect(screen.getByTestId('article-html-content').querySelector('img')).not.toBeNull();

    await act(async () => {
      useAppStore.setState((state) => ({
        articles: [{ ...state.articles[0], id: 'article-2' }],
        selectedArticleId: 'article-2',
      }));
    });
    expect(screen.getByTestId('article-html-content').querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: '加载图片：配图' })).toBeInTheDocument();
  });

  it('applies mode changes and defers newly fetched body images', async () => {
    await renderArticleViewWithContent('<img src="https://example.com/a.jpg" alt="旧配图">');
    setNoImageMode(true);
    expect(screen.getByTestId('article-html-content').querySelector('img')).toBeNull();
    act(() => {
      useAppStore.setState((state) => ({
        articles: state.articles.map((article) => ({ ...article, content: '<p>全文</p><img src="https://example.com/full.jpg">' })),
      }));
    });
    expect(screen.getByRole('button', { name: '加载图片' })).toBeInTheDocument();
    expect(screen.getByTestId('article-html-content').querySelector('img')).toBeNull();

    setNoImageMode(false);
    expect(screen.getByTestId('article-html-content').querySelector('img')).toHaveAttribute('src', 'https://example.com/full.jpg');
    expect(screen.queryByRole('button', { name: '加载图片' })).not.toBeInTheDocument();
  });

  it('retries a manually loaded image using the existing backoff mechanism', async () => {
    setNoImageMode(true);
    await renderArticleViewWithContent('<img src="/api/media/image?url=https%3A%2F%2Fexample.com%2Fa.jpg&amp;sig=signed" alt="配图">');
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByTestId('article-html-content').querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '加载图片：配图' }));
    const image = screen.getByTestId('article-html-content').querySelector('img')!;
    fireEvent.error(image);
    act(() => vi.advanceTimersByTime(1000));
    expect(new URL(image.src).searchParams.get('_retry')).toBe('1');
  });

  it('defers image sources before translation, bold normalization and search parsing', async () => {
    setNoImageMode(true);
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      await renderArticleViewWithContent('<p>**配图说明**</p><img src="https://example.com/a.jpg" alt="配图">', '配图');
      expect(parse).toHaveBeenCalled();
      for (const [html] of parse.mock.calls) {
        const inert = document.createElement('template');
        inert.innerHTML = String(html);
        expect(inert.content.querySelector('img, picture source[srcset]')).toBeNull();
      }
      expect(screen.getByTestId('article-html-content').querySelector('strong mark')).toHaveTextContent('配图');
      expect(screen.getByRole('button', { name: '加载图片：配图' })).toBeInTheDocument();
    } finally {
      parse.mockRestore();
    }
  });

  it('renders residual bold markers before applying search highlights', async () => {
    await renderArticleViewWithContent(
      '<p>**解码溯源绑定机制挡住隐写注入。**MCP智能体读取工具输出。</p>',
      '溯源绑定',
    );
    const content = screen.getByTestId('article-html-content');

    expect(content.querySelector('strong')?.textContent).toBe('解码溯源绑定机制挡住隐写注入。');
    expect(content.querySelector('strong mark')?.textContent).toBe('溯源绑定');
    expect(content.textContent).not.toContain('**');
  });

  it('automatically retries a failed body image and cancels retries when content changes', async () => {
    await renderArticleViewWithContent(
      '<img src="/api/media/image?url=https%3A%2F%2Fexample.com%2Fa.jpg&amp;sig=signed" alt="配图">',
    );
    vi.useFakeTimers();
    const image = screen.getByTestId('article-html-content').querySelector('img')!;
    fireEvent.error(image);
    act(() => vi.advanceTimersByTime(1000));
    expect(new URL(image.src).searchParams.get('_retry')).toBe('1');

    fireEvent.error(image);
    act(() => {
      useAppStore.setState((state) => ({
        articles: state.articles.map((article) => ({ ...article, content: '<p>新正文</p>' })),
      }));
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(new URL(image.src).searchParams.get('_retry')).toBe('1');
    expect(screen.getByTestId('article-html-content')).toHaveTextContent('新正文');
  });

  it('restores the failed body image when its preview loads successfully', async () => {
    await renderArticleViewWithContent('<img src="https://example.com/recovered.jpg" alt="恢复图片">');
    const image = screen.getByTestId('article-html-content').querySelector('img')!;
    fireEvent.click(image);
    const dialog = await screen.findByRole('dialog', { name: '图片预览' });
    const setAttribute = vi.spyOn(image, 'setAttribute');

    fireEvent.load(within(dialog).getByRole('img', { name: '恢复图片' }));

    expect(setAttribute).toHaveBeenCalledWith('src', 'https://example.com/recovered.jpg');
  });

  it('opens a preview dialog when clicking an article image', async () => {
    const { container } = await renderArticleViewWithContent(
      '<p>Before</p><img src="https://example.com/cover.jpg" alt="封面图" /><p>After</p>',
    );

    const bodyImage = container.querySelector(
      '[data-testid="article-html-content"] img',
    ) as HTMLImageElement | null;

    expect(bodyImage).not.toBeNull();
    fireEvent.click(bodyImage!);

    const dialog = await screen.findByRole('dialog', { name: '图片预览' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: '封面图' })).toHaveAttribute(
      'src',
      'https://example.com/cover.jpg',
    );
  });

  it('renders the preview dialog without a close button', async () => {
    const { container } = await renderArticleViewWithContent(
      '<img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    fireEvent.click(
      container.querySelector('[data-testid="article-html-content"] img') as HTMLImageElement,
    );

    const dialog = await screen.findByRole('dialog', { name: '图片预览' });
    expect(within(dialog).queryByRole('button', { name: '关闭图片预览' })).not.toBeInTheDocument();
  });

  it('renders the preview dialog without a border', async () => {
    const { container } = await renderArticleViewWithContent(
      '<img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    fireEvent.click(
      container.querySelector('[data-testid="article-html-content"] img') as HTMLImageElement,
    );

    const dialog = await screen.findByRole('dialog', { name: '图片预览' });
    expect(dialog).toHaveClass('border-none');
  });

  it('does not open the preview when clicking non-image content', async () => {
    const { container } = await renderArticleViewWithContent(
      '<p>Paragraph</p><img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    fireEvent.click(
      container.querySelector('[data-testid="article-html-content"] p') as HTMLParagraphElement,
    );

    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
  });

  it('renders playable article videos without image preview affordances', async () => {
    await renderArticleViewWithContent(
      '<p>Intro</p><video src="https://cdn.example.com/story.mp4" poster="https://cdn.example.com/poster.jpg" controls="controls"><source src="https://cdn.example.com/story.webm" type="video/webm" /></video>',
    );

    const content = screen.getByTestId('article-html-content');
    const video = content.querySelector('video');
    const source = content.querySelector('source');

    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video).toHaveAttribute('src', 'https://cdn.example.com/story.mp4');
    expect(video).toHaveAttribute('poster', 'https://cdn.example.com/poster.jpg');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveClass('rounded-lg');
    expect(video).toHaveClass('bg-black');
    expect(source).toHaveAttribute('src', 'https://cdn.example.com/story.webm');
    expect(source).toHaveAttribute('type', 'video/webm');
    expect(video).not.toHaveClass('cursor-zoom-in');
  });

  it('makes article images keyboard focusable and opens preview with Enter', async () => {
    await renderArticleViewWithContent(
      '<img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    const imageTrigger = await screen.findByRole('button', { name: '查看大图：封面图' });
    imageTrigger.focus();
    fireEvent.keyDown(imageTrigger, { key: 'Enter' });

    expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
  });

  it('only rescans article images when body html changes', async () => {
    const { container } = await renderArticleViewWithContent(
      '<img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    const articleHtmlContent = container.querySelector(
      '[data-testid="article-html-content"]',
    ) as HTMLDivElement | null;

    expect(articleHtmlContent).not.toBeNull();

    const querySelectorAllSpy = vi.spyOn(articleHtmlContent!, 'querySelectorAll');

    act(() => {
      useAppStore.setState((state) => ({
        articles: state.articles.map((article) =>
          article.id === 'article-1'
            ? {
                ...article,
                title: 'Updated Title',
              }
            : article,
        ),
      }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(querySelectorAllSpy).not.toHaveBeenCalled();

    querySelectorAllSpy.mockRestore();
  });

  it('does not bind per-image click or keydown listeners for preview', async () => {
    const addEventListenerSpy = vi.spyOn(EventTarget.prototype, 'addEventListener');

    await renderArticleViewWithContent(
      '<img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    const imageListenerRegistrations = addEventListenerSpy.mock.calls.flatMap(([type], index) => {
      const currentTarget = addEventListenerSpy.mock.instances[index];
      if (!(currentTarget instanceof HTMLImageElement)) {
        return [];
      }

      return type === 'click' || type === 'keydown' ? [type] : [];
    });

    expect(imageListenerRegistrations).toHaveLength(0);

    addEventListenerSpy.mockRestore();
  });

  it('keeps wrapped images as links instead of converting them into preview buttons', async () => {
    const { container } = await renderArticleViewWithContent(
      '<a href="https://example.com/original"><img src="https://example.com/cover.jpg" alt="封面图" /></a>',
    );

    const link = container.querySelector(
      '[data-testid="article-html-content"] a',
    ) as HTMLAnchorElement | null;
    const image = container.querySelector(
      '[data-testid="article-html-content"] img',
    ) as HTMLImageElement | null;

    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', 'https://example.com/original');
    expect(image).not.toBeNull();
    expect(screen.queryByRole('button', { name: '查看大图：封面图' })).not.toBeInTheDocument();
    expect(image).not.toHaveAttribute('role');
    expect(image).not.toHaveAttribute('tabindex');

    fireEvent.click(image!);

    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
  });

  it('shows a fallback message when the preview image fails to load', async () => {
    const { container } = await renderArticleViewWithContent(
      '<img src="https://example.com/broken.jpg" alt="损坏图片" />',
    );

    fireEvent.click(
      container.querySelector('[data-testid="article-html-content"] img') as HTMLImageElement,
    );

    const dialog = await screen.findByRole('dialog', { name: '图片预览' });
    fireEvent.error(within(dialog).getByRole('img', { name: '损坏图片' }));

    expect(within(dialog).getByText('图片加载失败，请关闭后重试。')).toBeInTheDocument();
  });

  it('clears the preview error state when reopening another image', async () => {
    const { container } = await renderArticleViewWithContent(
      [
        '<img src="https://example.com/broken.jpg" alt="损坏图片" />',
        '<img src="https://example.com/ok.jpg" alt="正常图片" />',
      ].join(''),
    );

    const images = container.querySelectorAll(
      '[data-testid="article-html-content"] img',
    ) as NodeListOf<HTMLImageElement>;

    fireEvent.click(images[0]);
    const dialog = await screen.findByRole('dialog', { name: '图片预览' });
    fireEvent.error(within(dialog).getByRole('img', { name: '损坏图片' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(images[1]);
    expect(await screen.findByRole('img', { name: '正常图片' })).toBeInTheDocument();
    expect(screen.queryByText('图片加载失败，请关闭后重试。')).not.toBeInTheDocument();
  });
});
