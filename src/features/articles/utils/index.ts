// 文章业务工具统一出口，减少组件层分散引用。
export { getFilteredReasonLabel } from './articleFilterReason';
export { buildArticleListDerivedState } from './articleListModel';
export {
  buildArticleMarkdownDocument,
  sanitizeArticleMarkdownFilename,
  triggerArticleMarkdownDownload,
} from './articleMarkdownExport';
export {
  extractArticleOutline,
  type ArticleOutlineItem,
  type ArticleOutlineMarker,
  type ArticleOutlineViewport,
} from './articleOutline';
export {
  getArticleVirtualAnchorCompensation,
  getArticleVirtualWindow,
} from './articleVirtualWindow';
export { buildImmersiveHtml } from './immersiveRender';
export { normalizeArticleHtml } from './normalizeArticleHtml';
export { setupArticleImageRetries } from './articleImageRetry';
