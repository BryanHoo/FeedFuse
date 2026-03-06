import { act, fireEvent, render, screen } from '@testing-library/react';
import ReaderLayout from './ReaderLayout';
import { NotificationProvider } from '../notifications/NotificationProvider';
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
    <NotificationProvider>
      <ReaderLayout />
    </NotificationProvider>,
  );
}

describe('ReaderLayout', () => {
  it('keeps the existing 3-column reader interactions', () => {
    resetSettingsStore();
    renderWithNotifications();
    expect(screen.getByLabelText('add-feed')).toBeInTheDocument();
    expect(screen.getByLabelText('open-settings')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('open-settings'));
    expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
  });

  it('shows clickable floating article title after scrolling the reader pane', () => {
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

    const floatingTitle = screen.getByTestId('reader-floating-title');
    expect(floatingTitle).toHaveTextContent('Selected Article');
    expect(floatingTitle).toHaveAttribute('href', 'https://example.com/article-1');
    expect(floatingTitle).toHaveAttribute('target', '_blank');
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

  it('does not render resize handles below desktop breakpoint', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });

    renderWithNotifications();

    expect(screen.queryByTestId('reader-resize-handle-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reader-resize-handle-middle')).not.toBeInTheDocument();
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

  it('disables left pane width transition while dragging', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const leftHandle = screen.getByTestId('reader-resize-handle-left');
    const feedPane = screen.getByTestId('reader-feed-pane');

    expect(feedPane.className).toContain('transition-[width]');

    fireEvent.pointerDown(leftHandle, { clientX: 240 });
    fireEvent.pointerMove(window, { clientX: 320 });

    expect(feedPane).toHaveStyle({ width: '320px' });
    expect(feedPane.className).toContain('transition-none');
    expect(leftHandle).toHaveAttribute('data-active', 'true');

    fireEvent.pointerUp(window, { clientX: 320 });

    expect(feedPane.className).toContain('transition-[width]');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
  });
});
