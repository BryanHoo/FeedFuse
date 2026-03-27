'use client';

import { LoaderCircle, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchArticles, type ArticleSearchItemDto } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME, highlightPlainText } from './globalSearch';

const SEARCH_DEBOUNCE_MS = 180;
const SEARCH_RESULT_LIMIT = 20;

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectResult: (result: ArticleSearchItemDto, query: string) => Promise<void> | void;
}

function HighlightedInlineText({
  text,
  query,
  className,
  dataTestId,
}: {
  text: string;
  query: string;
  className?: string;
  dataTestId?: string;
}) {
  const parts = highlightPlainText(text, query);

  return (
    <span className={className} data-testid={dataTestId}>
      {parts.map((part, index) =>
        part.matched ? (
          <mark
            key={`${part.text}-${index}`}
            className={cn(GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME, 'text-inherit')}
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export default function GlobalSearchDialog({
  open,
  onOpenChange,
  onSelectResult,
}: GlobalSearchDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSequenceRef = useRef(0);
  const searchTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArticleSearchItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectingArticleId, setSelectingArticleId] = useState<string | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open) {
      return;
    }

    const timerId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [open]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const scheduleSearch = (nextQuery: string) => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const normalizedQuery = nextQuery.trim();
    if (!normalizedQuery) {
      requestSequenceRef.current += 1;
      setLoading(false);
      setResults([]);
      setErrorMessage(null);
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);

    searchTimerRef.current = window.setTimeout(() => {
      void searchArticles(
        { keyword: normalizedQuery, limit: SEARCH_RESULT_LIMIT },
        { notifyOnError: false },
      )
        .then((response) => {
          if (requestSequenceRef.current !== requestId) {
            return;
          }

          setResults(response.items);
          setLoading(false);
        })
        .catch(() => {
          if (requestSequenceRef.current !== requestId) {
            return;
          }

          setResults([]);
          setLoading(false);
          setErrorMessage('搜索失败，请稍后重试');
        })
        .finally(() => {
          if (searchTimerRef.current !== null) {
            searchTimerRef.current = null;
          }
        });
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel="关闭全局搜索"
        className="flex max-h-[min(80vh,48rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-5">
          <DialogTitle>全局搜索</DialogTitle>
          <DialogDescription>
            按标题、摘要和正文搜索文章，点击结果后会自动定位到对应 RSS 源与文章。
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/60 px-5 py-4">
          <label htmlFor="global-search-input" className="sr-only">
            搜索文章
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              id="global-search-input"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                scheduleSearch(nextQuery);
              }}
              placeholder="输入关键字搜索文章"
              autoComplete="off"
              className="h-11 pl-9 pr-10"
            />
            {loading ? (
              <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!trimmedQuery ? (
            <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              输入关键字后即可跨 RSS 源搜索文章。
            </div>
          ) : errorMessage ? (
            <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {errorMessage}
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              没有找到匹配文章，试试更短的关键词或更常见的表达。
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((result) => {
                const publishedLabel = result.publishedAt
                  ? formatRelativeTime(result.publishedAt, new Date())
                  : '时间未知';
                const selecting = selectingArticleId === result.id;

                return (
                  <li key={result.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-auto min-w-0 w-full items-start justify-start whitespace-normal rounded-xl border border-border/65 bg-background px-4 py-3 text-left hover:bg-muted/45',
                        selecting && 'cursor-wait opacity-80',
                      )}
                      disabled={selectingArticleId !== null}
                      onClick={() => {
                        setSelectingArticleId(result.id);
                        setErrorMessage(null);
                        Promise.resolve(onSelectResult(result, trimmedQuery))
                          .then(() => {
                            onOpenChange(false);
                          })
                          .catch(() => {
                            setErrorMessage('打开文章失败，请稍后重试');
                          })
                          .finally(() => {
                            setSelectingArticleId(null);
                          });
                      }}
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <HighlightedInlineText
                              text={result.title}
                              query={trimmedQuery}
                              className="block line-clamp-1 break-words text-sm font-semibold leading-5 text-foreground"
                              dataTestId={`global-search-result-title-${result.id}`}
                            />
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{result.feedTitle}</span>
                              <span aria-hidden="true">·</span>
                              <span>{publishedLabel}</span>
                            </div>
                          </div>
                          {selecting ? (
                            <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                          ) : null}
                        </div>
                        <HighlightedInlineText
                          text={result.excerpt || result.summary || '暂无摘要'}
                          query={trimmedQuery}
                          className="block line-clamp-2 break-words text-sm leading-6 text-muted-foreground"
                          dataTestId={`global-search-result-excerpt-${result.id}`}
                        />
                      </div>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
