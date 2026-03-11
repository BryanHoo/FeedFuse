import { useEffect, useRef, useState } from 'react';

const SUMMARY_TYPING_MIN_CHARS = 2;
const SUMMARY_TYPING_MAX_CHARS = 6;
const SUMMARY_TYPING_MIN_DELAY_MS = 40;
const SUMMARY_TYPING_MAX_DELAY_MS = 70;

type AnimatedAiSummaryStatus = 'queued' | 'running' | 'succeeded' | 'failed' | null;

interface UseAnimatedAiSummaryTextInput {
  articleId: string | null;
  sourceText: string;
  status: AnimatedAiSummaryStatus;
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getNextChunkSize(pendingLength: number): number {
  const preferredChunkSize = Math.ceil(pendingLength / 3);
  const boundedChunkSize = Math.max(
    SUMMARY_TYPING_MIN_CHARS,
    Math.min(SUMMARY_TYPING_MAX_CHARS, preferredChunkSize),
  );
  return Math.min(pendingLength, boundedChunkSize);
}

function getNextDelayMs(pendingLength: number): number {
  if (pendingLength <= SUMMARY_TYPING_MIN_CHARS) {
    return SUMMARY_TYPING_MIN_DELAY_MS;
  }
  if (pendingLength <= SUMMARY_TYPING_MAX_CHARS) {
    return 60;
  }
  if (pendingLength <= SUMMARY_TYPING_MAX_CHARS * 2) {
    return 50;
  }
  return SUMMARY_TYPING_MIN_DELAY_MS;
}

export function useAnimatedAiSummaryText(input: UseAnimatedAiSummaryTextInput) {
  const [displayText, setDisplayText] = useState(input.sourceText);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);
  const lastArticleIdRef = useRef(input.articleId);
  const sourceTextRef = useRef(input.sourceText);
  const displayTextRef = useRef(input.sourceText);
  const pendingTextRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    setPrefersReducedMotion(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => {
        mediaQuery.removeEventListener('change', onChange);
      };
    }

    mediaQuery.addListener(onChange);
    return () => {
      mediaQuery.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const clearAnimation = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingTextRef.current = '';
    };

    const syncDisplayText = (nextText: string) => {
      clearAnimation();
      sourceTextRef.current = nextText;
      displayTextRef.current = nextText;
      setDisplayText((current) => (current === nextText ? current : nextText));
    };

    const scheduleNextTick = () => {
      if (timerRef.current !== null || pendingTextRef.current.length === 0) {
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;

        const pendingText = pendingTextRef.current;
        if (!pendingText) {
          return;
        }

        const chunkSize = getNextChunkSize(pendingText.length);
        const nextChunk = pendingText.slice(0, chunkSize);
        pendingTextRef.current = pendingText.slice(chunkSize);

        displayTextRef.current = `${displayTextRef.current}${nextChunk}`;
        const nextDisplayText = displayTextRef.current;
        setDisplayText((current) => (current === nextDisplayText ? current : nextDisplayText));

        scheduleNextTick();
      }, getNextDelayMs(pendingTextRef.current.length));
    };

    const articleChanged = lastArticleIdRef.current !== input.articleId;
    lastArticleIdRef.current = input.articleId;

    const nextSourceText = input.sourceText;
    const isTerminal = input.status === 'succeeded' || input.status === 'failed';
    const shouldAnimate =
      Boolean(input.articleId) && input.status === 'running' && !prefersReducedMotion;

    if (articleChanged || !input.articleId || isTerminal || !shouldAnimate) {
      syncDisplayText(nextSourceText);
      return;
    }

    const previousSourceText = sourceTextRef.current;
    if (nextSourceText === previousSourceText) {
      return;
    }

    if (!nextSourceText.startsWith(previousSourceText)) {
      syncDisplayText(nextSourceText);
      return;
    }

    if (previousSourceText.length === 0 && displayTextRef.current.length === 0) {
      syncDisplayText(nextSourceText);
      return;
    }

    const appendedText = nextSourceText.slice(previousSourceText.length);
    if (!appendedText) {
      sourceTextRef.current = nextSourceText;
      return;
    }

    sourceTextRef.current = nextSourceText;
    pendingTextRef.current = `${pendingTextRef.current}${appendedText}`;
    scheduleNextTick();
  }, [input.articleId, input.sourceText, input.status, prefersReducedMotion]);

  return { displayText };
}
