import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ArticleOutlineMarker, ArticleOutlineViewport } from './articleOutline';

interface ArticleOutlineRailProps {
  headings: ArticleOutlineMarker[];
  activeHeadingId: string | null;
  viewport: ArticleOutlineViewport;
  onSelect: (headingId: string) => void;
}

export default function ArticleOutlineRail({
  headings,
  activeHeadingId,
  viewport,
  onSelect,
}: ArticleOutlineRailProps) {
  const [expanded, setExpanded] = useState(false);

  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute inset-y-20 right-2 z-20 flex items-start"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        data-testid="article-outline-rail"
        className="relative h-40 w-2 rounded-full bg-background/60"
      >
        <div
          className="absolute inset-x-0 rounded-full bg-primary/20"
          style={{
            top: `${viewport.top * 100}%`,
            height: `${viewport.height * 100}%`,
          }}
        />
        {headings.map((heading) => (
          <div
            key={heading.id}
            className="absolute inset-x-0 h-1 rounded-full bg-border"
            style={{ top: `${heading.topRatio * 100}%` }}
          />
        ))}
      </div>

      {expanded ? (
        <nav
          aria-label="文章目录"
          className="mr-2 w-56 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
        >
          {headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className={cn(
                'block w-full truncate text-left',
                activeHeadingId === heading.id && 'text-primary',
              )}
              onClick={() => onSelect(heading.id)}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
