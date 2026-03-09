import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from './ArticleView';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { defaultPersistedSettings } from '../settings/settingsSchema';

type ApiClientModule = typeof import('../../lib/apiClient');

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

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('../../lib/apiClient');
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

async function renderArticleViewWithContent(content: string) {
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

  const view = render(<ArticleView />);

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

    const apiClient = await import('../../lib/apiClient');
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
    resizeObserver.restore();
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

  it('makes article images keyboard focusable and opens preview with Enter', async () => {
    await renderArticleViewWithContent(
      '<img src="https://example.com/cover.jpg" alt="封面图" />',
    );

    const imageTrigger = await screen.findByRole('button', { name: '查看大图：封面图' });
    imageTrigger.focus();
    fireEvent.keyDown(imageTrigger, { key: 'Enter' });

    expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
  });

  it('opens preview instead of following the wrapped image link', async () => {
    const { container } = await renderArticleViewWithContent(
      '<a href="https://example.com/original"><img src="https://example.com/cover.jpg" alt="封面图" /></a>',
    );

    const imageTrigger = await screen.findByRole('button', { name: '查看大图：封面图' });
    fireEvent.click(imageTrigger);

    expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="article-html-content"] a')).toHaveAttribute(
      'href',
      'https://example.com/original',
    );
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
