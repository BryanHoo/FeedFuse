import { z } from 'zod';
import type { PersistedSettings } from '@/types';
import {
  READER_LEFT_PANE_MAX_WIDTH,
  READER_LEFT_PANE_MIN_WIDTH,
  READER_MIDDLE_PANE_MAX_WIDTH,
  READER_MIDDLE_PANE_MIN_WIDTH,
} from '@/features/reader/utils/readerLayoutSizing';

const httpUrlSchema = z.string().trim().url().regex(/^https?:\/\//i);
// 未配置 AI 时允许空地址；填写地址时必须是有效的 HTTP(S) URL。
const optionalApiBaseUrlSchema = z.union([z.literal(''), httpUrlSchema]);

// PUT 是完整替换：所有配置字段必填，所有对象拒绝未知字段，禁止自动补默认值或强制转换类型。
// 历史字段迁移和非法旧值兜底由读取侧的 normalizePersistedSettings 独立处理。
export const settingsWriteSchema: z.ZodType<PersistedSettings> = z.strictObject({
  general: z.strictObject({
    theme: z.enum(['light', 'dark', 'auto']),
    fontSize: z.enum(['small', 'medium', 'large']),
    fontFamily: z.enum(['sans', 'serif']),
    lineHeight: z.enum(['compact', 'normal', 'relaxed']),
    autoMarkReadEnabled: z.boolean(),
    autoMarkReadDelayMs: z.union([z.literal(0), z.literal(2000), z.literal(5000)]),
    defaultUnreadOnlyInAll: z.boolean(),
    sidebarCollapsed: z.boolean(),
    leftPaneWidth: z.number().int().min(READER_LEFT_PANE_MIN_WIDTH).max(READER_LEFT_PANE_MAX_WIDTH),
    middlePaneWidth: z.number().int().min(READER_MIDDLE_PANE_MIN_WIDTH).max(READER_MIDDLE_PANE_MAX_WIDTH),
  }),
  ai: z.strictObject({
    summaryEnabled: z.boolean(),
    translateEnabled: z.boolean(),
    autoSummarize: z.boolean(),
    deepThinkingEnabled: z.boolean(),
    model: z.string(),
    apiBaseUrl: optionalApiBaseUrlSchema,
    summaryPrompt: z.string().trim(),
    translationPrompt: z.string().trim(),
    translation: z.strictObject({
      useSharedAi: z.boolean(),
      model: z.string(),
      apiBaseUrl: optionalApiBaseUrlSchema,
    }),
  }),
  categories: z.array(z.strictObject({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    expanded: z.boolean().optional(),
  })),
  rss: z.strictObject({
    sources: z.array(z.strictObject({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      url: httpUrlSchema,
      category: z.string().trim().min(1).nullable(),
      enabled: z.boolean(),
    })),
    fetchIntervalMinutes: z.union([
      z.literal(5), z.literal(15), z.literal(30), z.literal(60), z.literal(120),
    ]),
    maxStoredArticlesPerFeed: z.union([
      z.literal(100), z.literal(200), z.literal(500), z.literal(1000), z.literal(2000),
    ]),
    articleFilter: z.strictObject({
      keyword: z.strictObject({
        enabled: z.boolean(),
        keywords: z.array(z.string().trim().min(1)),
      }),
      ai: z.strictObject({
        enabled: z.boolean(),
        prompt: z.string().trim(),
      }),
    }),
  }),
  logging: z.strictObject({
    enabled: z.boolean(),
    retentionDays: z.union([
      z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30), z.literal(90),
    ]),
    minLevel: z.enum(['info', 'warning', 'error']),
  }),
});

// 密钥不混入可缓存的设置对象：省略表示保留，null 表示删除，非空字符串表示替换。
export const settingsDraftWriteSchema = z.strictObject({
  settings: settingsWriteSchema,
  secrets: z.strictObject({
    aiApiKey: z.string().trim().min(1, '请输入非空 API 密钥，或使用删除密钥按钮。').nullable().optional(),
    translationApiKey: z.string().trim().min(1, '请输入非空翻译 API 密钥，或使用删除密钥按钮。').nullable().optional(),
  }),
});
