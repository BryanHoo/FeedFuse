import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationProvider } from '../notifications/NotificationProvider';
import FeedDialog from './FeedDialog';

function renderFeedDialog(input?: {
  onSubmit?: (payload: unknown) => Promise<void>;
}) {
  const onSubmit =
    input?.onSubmit ??
    (async () => {
      return;
    });

  render(
    <NotificationProvider>
      <FeedDialog
        mode="edit"
        open
        onOpenChange={() => {}}
        categories={[
          { id: 'cat-tech', name: '科技' },
          { id: 'cat-uncategorized', name: '未分类' },
        ]}
        initialValues={{
          title: 'Feed Title',
          url: 'https://example.com/feed.xml',
          siteUrl: 'https://example.com',
          categoryId: 'cat-tech',
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
        }}
        onSubmit={onSubmit}
      />
    </NotificationProvider>,
  );
}

describe('FeedDialog translation flags', () => {
  it('renders title/body translation toggles', () => {
    renderFeedDialog();

    expect(screen.getByRole('combobox', { name: '列表标题自动翻译' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '正文翻译' })).toBeInTheDocument();
  });

  it('submits title/body translation values', async () => {
    const onSubmit = vi.fn(async () => undefined);
    renderFeedDialog({ onSubmit });

    fireEvent.click(screen.getByRole('combobox', { name: '列表标题自动翻译' }));
    fireEvent.click(screen.getByRole('option', { name: '开启' }));

    fireEvent.click(screen.getByRole('combobox', { name: '正文翻译' }));
    fireEvent.click(screen.getByRole('option', { name: '开启' }));

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          titleTranslateEnabled: true,
          bodyTranslateEnabled: true,
        }),
      );
    });
  });
});
