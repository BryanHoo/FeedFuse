import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: unknown) => {
    const state = {
      categories: [{ id: 'c1', name: 'Tech', expanded: true }],
      feeds: [
        {
          id: 'f1',
          kind: 'rss',
          title: 'RSS 1',
          unreadCount: 0,
          url: 'https://x',
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          fetchStatus: null,
          fetchError: null,
        },
      ],
      addAiDigest: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof selector === 'function' ? (selector as any)(state) : state;
  },
}));

describe('AddAiDigestDialog', () => {
  it('requires title, prompt and at least one source', async () => {
    const { default: AddAiDigestDialog } = await import('./AddAiDigestDialog');

    render(
      <StrictMode>
        <AddAiDigestDialog
          open
          onOpenChange={() => {}}
          categories={[{ id: 'c1', name: 'Tech', expanded: true }]}
          feeds={[
            {
              id: 'f1',
              kind: 'rss',
              title: 'RSS 1',
              url: 'https://example.com/rss.xml',
              siteUrl: null,
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
              fetchStatus: null,
              fetchError: null,
            },
          ]}
        />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: '创建智能报告源' }));
    expect(screen.getByText('标题为必填项')).toBeInTheDocument();
    expect(screen.getByText('AI 提示词为必填项')).toBeInTheDocument();
    expect(screen.getByText('请至少选择一个来源')).toBeInTheDocument();
  });

  it('does not focus or toggle controls when clicking labels', async () => {
    const { default: AddAiDigestDialog } = await import('./AddAiDigestDialog');

    render(
      <StrictMode>
        <AddAiDigestDialog
          open
          onOpenChange={() => {}}
          categories={[{ id: 'c1', name: 'Tech', expanded: true }]}
          feeds={[
            {
              id: 'f1',
              kind: 'rss',
              title: 'RSS 1',
              url: 'https://example.com/rss.xml',
              siteUrl: null,
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
              fetchStatus: null,
              fetchError: null,
            },
          ]}
        />
      </StrictMode>,
    );

    // 点击字段标题不应把焦点切到对应控件。
    screen.getByRole('button', { name: '创建智能报告源' }).focus();
    const titleInput = document.getElementById('add-ai-digest-title');
    expect(titleInput).toBeTruthy();
    fireEvent.click(screen.getByText('标题'));
    expect(titleInput).not.toHaveFocus();

    const intervalTrigger = screen.getByRole('combobox', { name: '重复时间' });
    expect(intervalTrigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByText('重复时间'));
    expect(intervalTrigger).toHaveAttribute('aria-expanded', 'false');

    const categoryInput = screen.getByRole('combobox', { name: '分类' });
    expect(categoryInput).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByText('分类'));
    expect(categoryInput).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '选择 RSS 来源' }));
    const sourceCheckbox = screen.getByRole('checkbox', { name: '选择来源 RSS 1' });

    // 点击来源文字不应触发勾选，只有点击真实 checkbox 才生效。
    fireEvent.click(screen.getByText('RSS 1'));
    expect(sourceCheckbox).not.toBeChecked();

    fireEvent.click(sourceCheckbox);
    expect(sourceCheckbox).toBeChecked();
  });
});
