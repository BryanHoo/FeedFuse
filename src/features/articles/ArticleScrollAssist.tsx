interface ArticleScrollAssistProps {
  visible: boolean;
  percent: number;
  onBackToTop: () => void;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export default function ArticleScrollAssist({
  visible,
  percent,
  onBackToTop,
}: ArticleScrollAssistProps) {
  const safePercent = clampPercent(percent);
  const label = safePercent >= 100 ? 'Top' : `${safePercent}%`;
  const radius = 21;
  const strokeWidth = 2.5;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safePercent / 100);

  if (!visible) {
    return null;
  }

  return (
    <div className="absolute bottom-6 right-6 z-20">
      <button
        type="button"
        aria-label="回到顶部"
        className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-background/70 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        onClick={onBackToTop}
      >
        <span
          aria-hidden="true"
          data-testid="article-scroll-assist-ring"
          className="pointer-events-none absolute inset-[2px]"
        >
          <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
            <circle
              cx="24"
              cy="24"
              r={radius}
              className="fill-none stroke-border/45"
              strokeWidth={strokeWidth}
            />
            <circle
              cx="24"
              cy="24"
              r={radius}
              className="fill-none stroke-primary/75 transition-[stroke-dashoffset] duration-150 ease-out motion-reduce:transition-none"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="relative z-10 text-[9px] font-medium leading-none text-foreground/90">
          {label}
        </span>
      </button>
    </div>
  );
}
