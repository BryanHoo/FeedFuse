import type { SystemLogCategory } from '../types';

export type UserOperationMode = 'immediate' | 'deferred';

export type UserOperationActionKey =
  | 'feed.create'
  | 'feed.update'
  | 'feed.delete'
  | 'feed.enable'
  | 'feed.disable'
  | 'feed.moveToCategory'
  | 'feed.refresh'
  | 'feed.refreshAll'
  | 'feed.articleListDisplayMode.update'
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'category.reorder'
  | 'article.markRead'
  | 'article.markAllRead'
  | 'article.toggleStar'
  | 'article.aiSummary.generate'
  | 'article.aiTranslate.generate'
  | 'article.aiTranslate.retrySegment'
  | 'aiDigest.create'
  | 'aiDigest.update'
  | 'aiDigest.generate'
  | 'settings.save'
  | 'opml.import'
  | 'opml.export';

export interface UserOperationCatalogEntry {
  mode: UserOperationMode;
  category: SystemLogCategory;
  successMessage: (context?: Record<string, unknown>) => string;
  errorPrefix: (context?: Record<string, unknown>) => string;
  startMessage?: (context?: Record<string, unknown>) => string;
}

const DEFAULT_FAILURE_REASON = '请稍后重试';
const MAX_REASON_LENGTH = 72;

function getStringContextValue(
  context: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = context?.[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function withDefaultCategory(context?: Record<string, unknown>) {
  return getStringContextValue(context, 'categoryName')
    ? `已移动到「${getStringContextValue(context, 'categoryName')}」`
    : '已移动订阅源';
}

const catalog: Record<UserOperationActionKey, UserOperationCatalogEntry> = {
  'feed.create': {
    mode: 'immediate',
    category: 'feed',
    successMessage: () => '已添加订阅源',
    errorPrefix: () => '添加订阅源失败',
  },
  'feed.update': {
    mode: 'immediate',
    category: 'feed',
    successMessage: () => '已更新订阅源',
    errorPrefix: () => '更新订阅源失败',
  },
  'feed.delete': {
    mode: 'immediate',
    category: 'feed',
    successMessage: () => '已删除订阅源',
    errorPrefix: () => '删除订阅源失败',
  },
  'feed.enable': {
    mode: 'immediate',
    category: 'feed',
    successMessage: () => '已启用订阅源',
    errorPrefix: () => '启用订阅源失败',
  },
  'feed.disable': {
    mode: 'immediate',
    category: 'feed',
    successMessage: () => '已停用订阅源',
    errorPrefix: () => '停用订阅源失败',
  },
  'feed.moveToCategory': {
    mode: 'immediate',
    category: 'feed',
    successMessage: (context) => withDefaultCategory(context),
    errorPrefix: () => '移动订阅源失败',
  },
  'feed.refresh': {
    mode: 'deferred',
    category: 'feed',
    startMessage: () => '已开始刷新订阅源',
    successMessage: () => '订阅源已刷新',
    errorPrefix: () => '刷新订阅源失败',
  },
  'feed.refreshAll': {
    mode: 'deferred',
    category: 'feed',
    startMessage: () => '已开始刷新全部订阅源',
    successMessage: () => '全部订阅源已刷新',
    errorPrefix: () => '刷新全部订阅源失败',
  },
  'feed.articleListDisplayMode.update': {
    mode: 'immediate',
    category: 'feed',
    successMessage: () => '已保存文章列表显示方式',
    errorPrefix: () => '保存文章列表显示方式失败',
  },
  'category.create': {
    mode: 'immediate',
    category: 'category',
    successMessage: () => '已添加分类',
    errorPrefix: () => '添加分类失败',
  },
  'category.update': {
    mode: 'immediate',
    category: 'category',
    successMessage: () => '已更新分类',
    errorPrefix: () => '更新分类失败',
  },
  'category.delete': {
    mode: 'immediate',
    category: 'category',
    successMessage: () => '已删除分类',
    errorPrefix: () => '删除分类失败',
  },
  'category.reorder': {
    mode: 'immediate',
    category: 'category',
    successMessage: () => '已更新分类顺序',
    errorPrefix: () => '更新分类顺序失败',
  },
  'article.markRead': {
    mode: 'immediate',
    category: 'article',
    successMessage: () => '已标记为已读',
    errorPrefix: () => '标记为已读失败',
  },
  'article.markAllRead': {
    mode: 'immediate',
    category: 'article',
    successMessage: () => '已标记全部为已读',
    errorPrefix: () => '标记全部为已读失败',
  },
  'article.toggleStar': {
    mode: 'immediate',
    category: 'article',
    successMessage: (context) => {
      const starred = context?.starred === true;
      return starred ? '已加星标' : '已取消星标';
    },
    errorPrefix: (context) => {
      const starred = context?.starred === true;
      return starred ? '加星标失败' : '取消星标失败';
    },
  },
  'article.aiSummary.generate': {
    mode: 'deferred',
    category: 'ai_summary',
    startMessage: () => '已开始生成 AI 摘要',
    successMessage: () => 'AI 摘要已生成',
    errorPrefix: () => '生成 AI 摘要失败',
  },
  'article.aiTranslate.generate': {
    mode: 'deferred',
    category: 'ai_translate',
    startMessage: () => '已开始生成 AI 翻译',
    successMessage: () => 'AI 翻译已生成',
    errorPrefix: () => '生成 AI 翻译失败',
  },
  'article.aiTranslate.retrySegment': {
    mode: 'deferred',
    category: 'ai_translate',
    startMessage: () => '已开始重试翻译片段',
    successMessage: () => '翻译片段已重试完成',
    errorPrefix: () => '重试翻译片段失败',
  },
  'aiDigest.create': {
    mode: 'immediate',
    category: 'ai_digest',
    successMessage: () => '已创建 AI 解读源',
    errorPrefix: () => '创建 AI 解读源失败',
  },
  'aiDigest.update': {
    mode: 'immediate',
    category: 'ai_digest',
    successMessage: () => '已更新 AI 解读源',
    errorPrefix: () => '更新 AI 解读源失败',
  },
  'aiDigest.generate': {
    mode: 'deferred',
    category: 'ai_digest',
    startMessage: () => '已开始生成 AI 解读',
    successMessage: () => 'AI 解读已生成',
    errorPrefix: () => '生成 AI 解读失败',
  },
  'settings.save': {
    mode: 'immediate',
    category: 'settings',
    successMessage: () => '设置已自动保存',
    errorPrefix: () => '保存设置失败',
  },
  'opml.import': {
    mode: 'immediate',
    category: 'opml',
    successMessage: () => 'OPML 导入完成',
    errorPrefix: () => '导入 OPML 失败',
  },
  'opml.export': {
    mode: 'immediate',
    category: 'opml',
    successMessage: () => 'OPML 已开始下载',
    errorPrefix: () => '导出 OPML 失败',
  },
};

function toReasonText(reason: unknown): string | null {
  if (reason instanceof Error) {
    return reason.message;
  }

  if (typeof reason === 'string') {
    return reason;
  }

  if (reason && typeof reason === 'object' && 'message' in reason) {
    const message = (reason as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }

  return null;
}

export function formatUserOperationFailureReason(reason: unknown): string {
  const raw = toReasonText(reason);
  if (!raw) {
    return DEFAULT_FAILURE_REASON;
  }

  const normalized = raw
    .replace(/\s+/g, ' ')
    .replace(/\s*at\s+.+$/i, '')
    .trim();

  if (!normalized) {
    return DEFAULT_FAILURE_REASON;
  }

  if (normalized.length <= MAX_REASON_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`;
}

export function getUserOperationCatalogEntry(
  actionKey: UserOperationActionKey,
): UserOperationCatalogEntry {
  return catalog[actionKey];
}

export function renderUserOperationStarted(
  actionKey: UserOperationActionKey,
  context?: Record<string, unknown>,
): string {
  const message = getUserOperationCatalogEntry(actionKey).startMessage?.(context);
  return message ?? renderUserOperationSuccess(actionKey, context);
}

export function renderUserOperationSuccess(
  actionKey: UserOperationActionKey,
  context?: Record<string, unknown>,
): string {
  return getUserOperationCatalogEntry(actionKey).successMessage(context);
}

export function renderUserOperationFailure(
  actionKey: UserOperationActionKey,
  reason: unknown,
  context?: Record<string, unknown>,
): string {
  return `${getUserOperationCatalogEntry(actionKey).errorPrefix(context)}：${formatUserOperationFailureReason(reason)}`;
}
