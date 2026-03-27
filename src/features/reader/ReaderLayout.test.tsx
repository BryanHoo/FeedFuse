import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { vi } from 'vitest';

vi.mock('../articles/ArticleView', () => ({
  default: function MockArticleView({
    onOpenSettings,
    onTitleVisibilityChange,
    reserveTopSpace = true,
  }: {
    onOpenSettings?: () => void;
    onTitleVisibilityChange?: (isVisible: boolean) => void;
    reserveTopSpace?: boolean;
  }) {
    useEffect(() => {
      onTitleVisibilityChange?.(true);
    }, [onTitleVisibilityChange]);

    return (
      <>
        {reserveTopSpace ? (
          <button type="button" aria-label="打开设置" onClick={onOpenSettings}>
            mock settings
          </button>
        ) : null}
        <div
          data-testid="article-scroll-container"
          data-reserve-top-space={reserveTopSpace ? 'true' : 'false'}
          onScroll={(event) => {
            onTitleVisibilityChange?.(event.currentTarget.scrollTop <= 96);
          }}
        />
      </>
    );
  },
}));

import ReaderLayout from './ReaderLayout';
import { ToastHost } from '../toast/ToastHost';
import {
  READER_RESIZE_DESKTOP_MIN_WIDTH,
  READER_TABLET_MIN_WIDTH,
} from './readerLayoutSizing';
import { defaultPersistedSettings } from '../settings/settingsSchema';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';

function resetSettingsStore() {
  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: structuredClone(defaultPersistedSettings),
    sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
    draft: null,
    validationErrors: {},
    settings: structuredClone(defaultPersistedSettings.appearance),
  }));
  window.localStorage.clear();

  useAppStore.setState({
    feeds: [],
    categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
    articles: [],
    selectedView: 'all',
    selectedArticleId: null,
    sidebarCollapsed: false,
    snapshotLoading: false,
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

function renderOnServer(ui: React.ReactElement) {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: undefined,
  });

  try {
    return renderToString(ui);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
}

describe('ReaderLayout', () => {
  it('keeps the existing 3-column reader interactions', async () => {
    resetSettingsStore();
    renderWithNotifications();
    expect(screen.getByLabelText('添加订阅')).toBeInTheDocument();
    expect(screen.getAllByLabelText('打开设置').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByLabelText('打开设置').at(-1) as HTMLElement);
    expect(await screen.findByTestId('settings-center-modal')).toBeInTheDocument();
  });

  it('no longer renders a separate desktop floating title after reader scroll', () => {
    resetSettingsStore();
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    renderWithNotifications();
    expect(screen.queryByTestId('reader-floating-title')).not.toBeInTheDocument();

    const readerScrollContainer = screen.getByTestId('article-scroll-container');
    readerScrollContainer.scrollTop = 120;
    fireEvent.scroll(readerScrollContainer);

    expect(screen.queryByTestId('reader-floating-title')).not.toBeInTheDocument();
  });

  it('opens settings from the desktop article toolbar callback instead of a floating layout button', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const openSettingsButtons = screen.getAllByLabelText('打开设置');
    expect(openSettingsButtons).toHaveLength(1);

    fireEvent.click(openSettingsButtons[0]);
    expect(await screen.findByTestId('settings-center-modal')).toBeInTheDocument();
  });

  it('groups feeds by category with uncategorized fallback', () => {
    resetSettingsStore();
    useAppStore.setState({
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'Example 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          categoryId: 'cat-tech',
          category: '科技',
        },
        {
          id: 'feed-2',
          title: 'Example 2',
          url: 'https://example.com/other.xml',
          unreadCount: 0,
          categoryId: null,
          category: null,
        },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });
    renderWithNotifications();
    expect(screen.getByText('科技')).toBeInTheDocument();
    expect(screen.getByText('未分类')).toBeInTheDocument();
  });

  it('hides categories without feeds in sidebar', () => {
    resetSettingsStore();
    useAppStore.setState((state) => ({
      ...state,
      categories: [...state.categories, { id: 'cat-empty', name: '空分类', expanded: true }],
    }));

    renderWithNotifications();
    expect(screen.queryByText('空分类')).not.toBeInTheDocument();
  });

  it('renders persisted pane widths and restores left pane width after re-expanding sidebar', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    useSettingsStore.setState((state) => ({
      ...state,
      persistedSettings: {
        ...state.persistedSettings,
        general: {
          ...state.persistedSettings.general,
          leftPaneWidth: 280,
          middlePaneWidth: 460,
        },
      },
    }));

    renderWithNotifications();

    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '280px' });
    expect(screen.getByTestId('reader-article-pane')).toHaveStyle({ width: '460px' });
    expect(screen.getAllByRole('separator')).toHaveLength(2);

    act(() => {
      useAppStore.setState({ sidebarCollapsed: true });
    });
    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '0px' });

    act(() => {
      useAppStore.setState({ sidebarCollapsed: false });
    });
    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '280px' });
  });

  it('persists left pane width after dragging the left separator', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-left'), { clientX: 240 });
    fireEvent.pointerMove(window, { clientX: 320 });
    fireEvent.pointerUp(window, { clientX: 320 });

    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '320px' });
    expect(useSettingsStore.getState().persistedSettings.general.leftPaneWidth).toBe(320);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-left'), { clientX: 320 });
    fireEvent.pointerMove(window, { clientX: 20 });
    fireEvent.pointerUp(window, { clientX: 20 });

    expect(useSettingsStore.getState().persistedSettings.general.leftPaneWidth).toBe(200);
  });

  it('keeps left pane width stable during drag and only commits on release', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const layout = screen.getByTestId('reader-layout-root');
    const leftHandle = screen.getByTestId('reader-resize-handle-left');
    const feedPane = screen.getByTestId('reader-feed-pane');

    expect(feedPane).toHaveStyle({ width: '240px' });
    expect(feedPane.className).not.toContain('transition-[width]');

    fireEvent.pointerDown(leftHandle, { clientX: 240 });
    fireEvent.pointerMove(window, { clientX: 320 });

    expect(feedPane).toHaveStyle({ width: '240px' });
    expect(layout.style.getPropertyValue('--reader-left-resize-preview-offset')).toBe('80px');
    expect(leftHandle).toHaveAttribute('data-active', 'true');

    fireEvent.pointerUp(window, { clientX: 320 });

    expect(feedPane).toHaveStyle({ width: '320px' });
    expect(layout.style.getPropertyValue('--reader-left-resize-preview-offset')).toBe('0px');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
  });

  it('clamps middle pane drag to preserve right pane minimum width', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();
    const layout = screen.getByTestId('reader-layout-root');
    Object.defineProperty(layout, 'clientWidth', { configurable: true, value: 1100 });

    fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-middle'), { clientX: 640 });
    fireEvent.pointerMove(window, { clientX: 900 });
    fireEvent.pointerUp(window, { clientX: 900 });

    expect(screen.getByTestId('reader-article-pane')).toHaveStyle({ width: '380px' });
    expect(useSettingsStore.getState().persistedSettings.general.middlePaneWidth).toBe(380);
  });

  it('keeps middle pane width stable during drag and previews the clamped offset', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();
    const layout = screen.getByTestId('reader-layout-root');
    Object.defineProperty(layout, 'clientWidth', { configurable: true, value: 1100 });

    const middleHandle = screen.getByTestId('reader-resize-handle-middle');
    const articlePane = screen.getByTestId('reader-article-pane');

    expect(articlePane).toHaveStyle({ width: '400px' });

    fireEvent.pointerDown(middleHandle, { clientX: 640 });
    fireEvent.pointerMove(window, { clientX: 900 });

    expect(articlePane).toHaveStyle({ width: '400px' });
    expect(layout.style.getPropertyValue('--reader-middle-resize-preview-offset')).toBe('-20px');
    expect(middleHandle).toHaveAttribute('data-active', 'true');

    fireEvent.pointerUp(window, { clientX: 900 });

    expect(articlePane).toHaveStyle({ width: '380px' });
    expect(layout.style.getPropertyValue('--reader-middle-resize-preview-offset')).toBe('0px');
    expect(middleHandle).toHaveAttribute('data-active', 'false');
  });

  it('does not render resize handles below desktop breakpoint', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: READER_TABLET_MIN_WIDTH,
    });

    renderWithNotifications();

    expect(screen.queryByTestId('reader-resize-handle-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reader-resize-handle-middle')).not.toBeInTheDocument();
  });

  it('uses the lighter shared tablet article pane surface', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });

    renderWithNotifications();

    const tabletPane = screen.getByTestId('reader-tablet-article-pane');
    expect(tabletPane.className).toContain('bg-background/72');
    expect(tabletPane.className).toContain('supports-[backdrop-filter]:bg-background/58');
    expect(tabletPane.className).toContain('border-border/70');
  });

  it('uses a feed drawer instead of an inline feed pane on mobile', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    renderWithNotifications();

    expect(screen.getByTestId('reader-non-desktop-topbar')).toBeInTheDocument();
    expect(screen.queryByTestId('reader-mobile-action-bar')).not.toBeInTheDocument();
    expect(screen.getByText('全部文章')).toBeInTheDocument();
    expect(screen.queryByTestId('reader-feed-pane')).not.toBeInTheDocument();
    expect(screen.getByLabelText('打开订阅源列表')).toBeInTheDocument();
    expect(screen.getByLabelText('打开设置')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('打开订阅源列表'));

    expect(screen.getByTestId('reader-feed-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('feed-list-header')).toHaveClass('pr-16');
    const addSubscriptionButton = screen.getByLabelText('添加订阅');
    expect(addSubscriptionButton).toBeInTheDocument();

    fireEvent.click(addSubscriptionButton);

    expect(screen.getByRole('button', { name: '添加 RSS 源' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加 AI解读' })).toBeInTheDocument();
  });

  it('renders mobile reading context and quick actions for selected articles', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    renderWithNotifications();

    expect(screen.queryByText('正在阅读')).not.toBeInTheDocument();
    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.getByLabelText('打开全局搜索')).toBeInTheDocument();
    expect(screen.getByLabelText('打开设置')).toBeInTheDocument();
    expect(screen.getByLabelText('返回文章列表')).toBeInTheDocument();
  });

  it('hydrates responsive layout without rebuilding from a mismatched mobile first render', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    container.innerHTML = renderOnServer(<ReaderLayout />);
    document.body.appendChild(container);

    try {
      expect(container.querySelector('[data-testid="reader-feed-pane"]')).not.toBeNull();

      await act(async () => {
        hydrateRoot(container, <ReaderLayout />);
        await Promise.resolve();
      });

      expect(screen.getByTestId('reader-non-desktop-topbar')).toBeInTheDocument();

      const hydrationOutput = consoleErrorSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(hydrationOutput).not.toMatch(/hydration|server rendered html|didn't match|418/i);
    } finally {
      consoleErrorSpy.mockRestore();
      container.remove();
    }
  });

  it('hydrates URL-selected feed without leaving 全部文章 active', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    const sidebarFixtureState = {
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [],
      selectedArticleId: null,
      sidebarCollapsed: false,
      snapshotLoading: false,
    };

    useAppStore.setState({
      ...sidebarFixtureState,
      selectedView: 'all',
    });

    const container = document.createElement('div');
    container.innerHTML = renderOnServer(<ReaderLayout initialSelectedView="feed-1" />);
    document.body.appendChild(container);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      window.history.replaceState({}, '', '/?view=feed-1');
      vi.resetModules();

      const { default: HydrationReaderLayout } = await import('./ReaderLayout');
      const { useAppStore: hydrationAppStore } = await import('../../store/appStore');
      const { useSettingsStore: hydrationSettingsStore } = await import('../../store/settingsStore');

      hydrationSettingsStore.setState((state) => ({
        ...state,
        persistedSettings: structuredClone(defaultPersistedSettings),
        sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
        draft: null,
        validationErrors: {},
        settings: structuredClone(defaultPersistedSettings.appearance),
      }));
      hydrationAppStore.setState({
        ...sidebarFixtureState,
        selectedView: 'feed-1',
      });

      await act(async () => {
        hydrateRoot(container, <HydrationReaderLayout initialSelectedView="feed-1" />);
        await Promise.resolve();
      });

      const activeButtons = container.querySelectorAll('button[aria-current="true"]');
      expect(activeButtons).toHaveLength(1);
      expect(screen.getByRole('button', { name: /Example Feed.*1/ })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: '全部文章' })).not.toHaveAttribute('aria-current');

      const hydrationOutput = consoleErrorSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');
      expect(hydrationOutput).not.toMatch(/hydration|didn't match|won't be patched up/i);
    } finally {
      consoleErrorSpy.mockRestore();
      window.history.replaceState({}, '', '/');
      container.remove();
    }
  });

  it('shows a back action from article detail to article list on mobile', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    renderWithNotifications();

    expect(screen.getByLabelText('返回文章列表')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('返回文章列表'));

    expect(useAppStore.getState().selectedArticleId).toBeNull();
  });

  it('removes the old article top spacer on non-desktop layouts', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: READER_RESIZE_DESKTOP_MIN_WIDTH - 204,
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    renderWithNotifications();

    expect(screen.getByTestId('reader-non-desktop-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('article-scroll-container')).toHaveAttribute(
      'data-reserve-top-space',
      'false',
    );
  });


  it('highlights only one existing separator at a time on hover', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const feedPane = screen.getByTestId('reader-feed-pane');
    const articlePane = screen.getByTestId('reader-article-pane');
    const leftHandle = screen.getByTestId('reader-resize-handle-left');
    const middleHandle = screen.getByTestId('reader-resize-handle-middle');

    expect(feedPane.className).toContain('border-border');
    expect(articlePane.className).toContain('border-border');
    expect(feedPane.className).toContain('bg-muted/55');
    expect(articlePane.className).toContain('bg-muted/15');
    expect(feedPane.className).not.toContain('border-primary/60');
    expect(articlePane.className).not.toContain('border-primary/60');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
    expect(middleHandle).toHaveAttribute('data-active', 'false');

    fireEvent.pointerEnter(leftHandle);
    expect(feedPane.className).toContain('border-primary/60');
    expect(articlePane.className).not.toContain('border-primary/60');
    expect(leftHandle).toHaveAttribute('data-active', 'true');
    expect(middleHandle).toHaveAttribute('data-active', 'false');

    fireEvent.pointerEnter(middleHandle);
    expect(feedPane.className).not.toContain('border-primary/60');
    expect(articlePane.className).toContain('border-primary/60');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
    expect(middleHandle).toHaveAttribute('data-active', 'true');

    fireEvent.pointerLeave(middleHandle);
    expect(feedPane.className).not.toContain('border-primary/60');
    expect(articlePane.className).not.toContain('border-primary/60');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
    expect(middleHandle).toHaveAttribute('data-active', 'false');
  });

});
