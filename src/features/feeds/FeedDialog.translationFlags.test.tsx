import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastHost } from '../toast/ToastHost';
import FeedDialog from './FeedDialog';

function renderFeedDialog() {
  render(
    <>
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
      <ToastHost />
    </>,
  );
}

describe('FeedDialog translation flags', () => {
  it('FeedDialog no longer renders policy controls', () => {
    renderFeedDialog();

    expect(screen.getByRole('button', { name: '关闭编辑 RSS 源' })).toBeInTheDocument();
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
});
