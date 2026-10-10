import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRef } from "react";
import type { SettingsDraft } from "../../../store/settingsStore";
import SettingTooltipLabel from "../components/SettingTooltipLabel";

interface AISettingsPanelProps {
  draft: SettingsDraft;
  onChange: (updater: (draft: SettingsDraft) => void) => void;
  errors: Record<string, string>;
}

function resolveApiKeyStatus(
  apiKey: string,
  hasApiKey: boolean,
  clearApiKey: boolean,
): { label: string; variant: Parameters<typeof Badge>[0]["variant"] } {
  if (clearApiKey) return { label: "待清除", variant: "destructive" };
  if (apiKey.trim()) return { label: "待保存", variant: "secondary" };
  if (hasApiKey) return { label: "已配置", variant: "secondary" };
  return { label: "未配置", variant: "outline" };
}

export default function AISettingsPanel({
  draft,
  onChange,
  errors,
}: AISettingsPanelProps) {
  const ai = draft.persisted.ai;
  const translation = ai.translation;
  const apiKey = draft.session.ai.apiKey;
  const hasApiKey = draft.session.ai.hasApiKey;
  const clearApiKey = draft.session.ai.clearApiKey;
  const translationApiKey = draft.session.ai.translationApiKey ?? "";
  const hasTranslationApiKey = draft.session.ai.hasTranslationApiKey ?? false;
  const clearTranslationApiKey =
    draft.session.ai.clearTranslationApiKey ?? false;

  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const translationApiKeyInputRef = useRef<HTMLInputElement>(null);
  const aiModelLabelId = 'ai-model-label';
  const aiApiBaseUrlLabelId = 'ai-api-base-url-label';
  const aiApiKeyLabelId = 'ai-api-key-label';
  const aiTranslationModelLabelId = 'ai-translation-model-label';
  const aiTranslationApiBaseUrlLabelId = 'ai-translation-api-base-url-label';
  const aiTranslationApiKeyLabelId = 'ai-translation-api-key-label';

  const apiKeyStatus = resolveApiKeyStatus(apiKey, hasApiKey, clearApiKey);
  const translationApiKeyStatus = resolveApiKeyStatus(
    translationApiKey,
    hasTranslationApiKey,
    clearTranslationApiKey,
  );
  const apiKeyHint = hasApiKey
    ? "保留当前密钥可留空；如需删除请使用右侧按钮。"
    : "暂不设置可留空，稍后可再补充。";
  const translationApiKeyHint = hasTranslationApiKey
    ? "保留当前翻译密钥可留空；如需删除请使用右侧按钮。"
    : "暂不设置可留空，稍后可再补充。";

  return (
    <section>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex flex-col divide-y divide-border">
          <div className="px-4 py-3.5">
            <Label id={aiModelLabelId} className="mb-2 block">
              <SettingTooltipLabel
                label="AI 模型"
                description="填写用于摘要与翻译的模型名称，例如 gpt-4o-mini。"
                className="text-sm font-medium text-foreground"
              />
            </Label>
            <Input
              id="ai-model"
              aria-invalid={Boolean(errors["ai.model"])}
              aria-describedby={errors["ai.model"] ? "ai-model-error" : undefined}
              name="ai-model"
              aria-labelledby={aiModelLabelId}
              autoComplete="off"
              spellCheck={false}
              value={ai.model}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.model = event.target.value;
                })
              }
              placeholder="例如：gpt-4o-mini…"
            />
            {errors["ai.model"] ? (
              <p id="ai-model-error" className="mt-1.5 text-xs text-destructive">{errors["ai.model"]}</p>
            ) : null}
          </div>

          <div className="px-4 py-3.5">
            <Label id={aiApiBaseUrlLabelId} className="mb-2 block">
              <SettingTooltipLabel
                label="API 地址"
                description="填写与模型配套的 API 基础地址，通常包含 /v1。"
                className="text-sm font-medium text-foreground"
              />
            </Label>
            <Input
              id="ai-api-base-url"
              aria-invalid={Boolean(errors["ai.apiBaseUrl"])}
              aria-describedby={errors["ai.apiBaseUrl"] ? "ai-api-base-url-error" : undefined}
              name="ai-api-base-url"
              aria-labelledby={aiApiBaseUrlLabelId}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={ai.apiBaseUrl}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.apiBaseUrl = event.target.value;
                })
              }
              placeholder="例如：https://api.openai.com/v1…"
            />
            {errors["ai.apiBaseUrl"] ? (
              <p id="ai-api-base-url-error" className="mt-1.5 text-xs text-destructive">
                {errors["ai.apiBaseUrl"]}
              </p>
            ) : null}
          </div>

          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label id={aiApiKeyLabelId}>
                <SettingTooltipLabel
                  label="API 密钥"
                  description={apiKeyHint}
                  className="text-sm font-medium text-foreground"
                />
              </Label>
              <Badge variant={apiKeyStatus.variant}>{apiKeyStatus.label}</Badge>
            </div>
            <Input
              id="ai-api-key"
              aria-invalid={Boolean(errors["ai.apiKey"])}
              aria-describedby={errors["ai.apiKey"] ? "ai-api-key-error" : undefined}
              name="ai-api-key"
              aria-labelledby={aiApiKeyLabelId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              ref={apiKeyInputRef}
              defaultValue={apiKey}
              onBlur={(event) => {
                if (!apiKey.trim() && hasApiKey && !clearApiKey) {
                  event.currentTarget.value = "";
                }
              }}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.session.ai.apiKey = event.target.value;
                  nextDraft.session.ai.clearApiKey = false;
                })
              }
              placeholder="例如：sk-…"
            />
            {errors["ai.apiKey"] ? (
              <p id="ai-api-key-error" className="mt-1.5 text-xs text-destructive">{errors["ai.apiKey"]}</p>
            ) : null}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {hasApiKey ? (
                <Button
                  type="button"
                  size="sm"
                  variant={clearApiKey ? "outline" : "destructive"}
                  className="h-8"
                  onClick={() =>
                    onChange((nextDraft) => {
                      if (apiKeyInputRef.current) {
                        apiKeyInputRef.current.value = "";
                      }
                      nextDraft.session.ai.apiKey = "";
                      nextDraft.session.ai.clearApiKey = !clearApiKey;
                    })
                  }
                >
                  {clearApiKey ? "保留已保存的密钥" : "删除已保存的密钥"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="px-4 py-3.5">
            {/* 深度思考与其他字段保持同层级，不再额外套一层描边容器。 */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <SettingTooltipLabel
                  label="启用深度思考"
                  description="适用于支持推理的模型。开启后会请求更充分的内部思考，但页面只展示最终回复，不显示思考文案。"
                  className="text-sm font-medium text-foreground"
                />
              </div>
              <Switch
                aria-label="启用深度思考"
                checked={ai.deepThinkingEnabled}
                onCheckedChange={(checked) =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.ai.deepThinkingEnabled = checked;
                  })
                }
              />
            </div>
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="ai-summary-prompt" className="mb-2 block">
              <SettingTooltipLabel
                label="摘要提示词"
                description="留空将使用内置默认模板；建议描述摘要语言、风格和输出结构。"
                className="text-sm font-medium text-foreground"
              />
            </Label>
            <Textarea
              id="ai-summary-prompt"
              aria-label="摘要提示词"
              value={ai.summaryPrompt}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.summaryPrompt = event.target.value;
                })
              }
              placeholder="例如：用简洁中文总结，先 1-2 句结论，再给 3 条要点。"
              className="min-h-28"
            />
          </div>

          {/* 摘要提示词放在翻译配置前，避免被翻译专属配置区打断。 */}
          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <SettingTooltipLabel
                  label="翻译配置"
                  description="可选择复用主配置，或单独设置翻译模型、地址和密钥。"
                  className="text-sm font-medium text-foreground"
                />
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.ai.translation.useSharedAi = true;
                      nextDraft.session.ai.translationApiKey = "";
                      nextDraft.session.ai.clearTranslationApiKey = false;
                      if (translationApiKeyInputRef.current) {
                        translationApiKeyInputRef.current.value = "";
                      }
                    })
                  }
                  aria-pressed={translation.useSharedAi}
                  variant={translation.useSharedAi ? "default" : "outline"}
                  size="compact"
                  className="px-3"
                >
                  复用主配置
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.ai.translation.useSharedAi = false;
                    })
                  }
                  aria-pressed={!translation.useSharedAi}
                  variant={!translation.useSharedAi ? "default" : "outline"}
                  size="compact"
                  className="px-3"
                >
                  单独配置
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="ai-translation-prompt" className="mb-2 block">
              <SettingTooltipLabel
                label="翻译提示词"
                description="留空将使用内置默认模板；会同时作用于标题翻译和正文翻译。"
                className="text-sm font-medium text-foreground"
              />
            </Label>
            <Textarea
              id="ai-translation-prompt"
              aria-label="翻译提示词"
              value={ai.translationPrompt}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.translationPrompt = event.target.value;
                })
              }
              placeholder="例如：保持专业术语准确，避免意译过度。"
              className="min-h-28"
            />
          </div>

          {!translation.useSharedAi ? (
            <>
              <div className="px-4 py-3.5">
                <Label id={aiTranslationModelLabelId} className="mb-2 block">
                  翻译模型
                </Label>
                <Input
                  id="ai-translation-model"
                  aria-invalid={Boolean(errors["ai.translation.model"])}
                  aria-describedby={errors["ai.translation.model"] ? "ai-translation-model-error" : undefined}
                  name="ai-translation-model"
                  aria-labelledby={aiTranslationModelLabelId}
                  autoComplete="off"
                  spellCheck={false}
                  value={translation.model}
                  onChange={(event) =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.ai.translation.model =
                        event.target.value;
                    })
                  }
                  placeholder="例如：gpt-4o-mini…"
                />
                {errors["ai.translation.model"] ? (
                  <p id="ai-translation-model-error" className="mt-1.5 text-xs text-destructive">{errors["ai.translation.model"]}</p>
                ) : null}
              </div>

              <div className="px-4 py-3.5">
                <Label id={aiTranslationApiBaseUrlLabelId} className="mb-2 block">
                  翻译 API 地址
                </Label>
                <Input
                  id="ai-translation-api-base-url"
                  aria-invalid={Boolean(errors["ai.translation.apiBaseUrl"])}
                  aria-describedby={errors["ai.translation.apiBaseUrl"] ? "ai-translation-api-base-url-error" : undefined}
                  name="ai-translation-api-base-url"
                  aria-labelledby={aiTranslationApiBaseUrlLabelId}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={translation.apiBaseUrl}
                  onChange={(event) =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.ai.translation.apiBaseUrl =
                        event.target.value;
                    })
                  }
                  placeholder="例如：https://api.openai.com/v1…"
                />
                {errors["ai.translation.apiBaseUrl"] ? (
                  <p id="ai-translation-api-base-url-error" className="mt-1.5 text-xs text-destructive">
                    {errors["ai.translation.apiBaseUrl"]}
                  </p>
                ) : null}
              </div>

              <div className="px-4 py-3.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label id={aiTranslationApiKeyLabelId}>
                    <SettingTooltipLabel
                      label="翻译 API 密钥"
                      description={translationApiKeyHint}
                      className="text-sm font-medium text-foreground"
                    />
                  </Label>
                  <Badge variant={translationApiKeyStatus.variant}>
                    {translationApiKeyStatus.label}
                  </Badge>
                </div>
                <Input
                  id="ai-translation-api-key"
                  aria-invalid={Boolean(errors["ai.translation.apiKey"])}
                  aria-describedby={errors["ai.translation.apiKey"] ? "ai-translation-api-key-error" : undefined}
                  name="ai-translation-api-key"
                  aria-labelledby={aiTranslationApiKeyLabelId}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  ref={translationApiKeyInputRef}
                  defaultValue={translationApiKey}
                  onBlur={(event) => {
                    if (
                      !translationApiKey.trim() &&
                      hasTranslationApiKey &&
                      !clearTranslationApiKey
                    ) {
                      event.currentTarget.value = "";
                    }
                  }}
                  onChange={(event) =>
                    onChange((nextDraft) => {
                      nextDraft.session.ai.translationApiKey =
                        event.target.value;
                      nextDraft.session.ai.clearTranslationApiKey = false;
                    })
                  }
                  placeholder="例如：sk-…"
                />
                {errors["ai.translation.apiKey"] ? (
                  <p id="ai-translation-api-key-error" className="mt-1.5 text-xs text-destructive">{errors["ai.translation.apiKey"]}</p>
                ) : null}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {hasTranslationApiKey ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        clearTranslationApiKey ? "outline" : "destructive"
                      }
                      className="h-8"
                      onClick={() =>
                        onChange((nextDraft) => {
                          if (translationApiKeyInputRef.current) {
                            translationApiKeyInputRef.current.value = "";
                          }
                          nextDraft.session.ai.translationApiKey = "";
                          nextDraft.session.ai.clearTranslationApiKey =
                            !clearTranslationApiKey;
                        })
                      }
                    >
                      {clearTranslationApiKey
                        ? "保留已保存的翻译密钥"
                        : "删除已保存的翻译密钥"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
