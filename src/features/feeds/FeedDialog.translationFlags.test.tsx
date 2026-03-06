import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationProvider } from '../notifications/NotificationProvider';
import FeedDialog from './FeedDialog';

function renderFeedDialog() {
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
        }}
        onSubmit={async () => undefined}
      />
    </NotificationProvider>,
  );
}

describe('FeedDialog translation flags', () => {
  it('FeedDialog no longer renders policy controls', () => {
    renderFeedDialog();

    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toBeInTheDocument();
    expect(screen.getByLabelText('分类')).toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: '打开文章时抓取全文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '获取文章后自动获取摘要' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '打开文章自动获取摘要' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '列表标题自动翻译' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '获取文章后自动翻译正文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '打开文章自动翻译正文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '正文翻译' })).not.toBeInTheDocument();
  });
});
