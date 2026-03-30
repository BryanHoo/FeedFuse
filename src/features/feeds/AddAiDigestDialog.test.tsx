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
});
