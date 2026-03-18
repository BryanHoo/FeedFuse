export const AI_DIGEST_VIEW_ID = 'ai-digest';

export function isRssSmartView(view: string): boolean {
  return view === 'all' || view === 'unread' || view === 'starred';
}

export function isAggregateView(view: string): boolean {
  return isRssSmartView(view) || view === AI_DIGEST_VIEW_ID;
}

export function shouldUseDefaultUnreadOnly(view: string): boolean {
  return view !== 'unread' && view !== 'starred';
}
