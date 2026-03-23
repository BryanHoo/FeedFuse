import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRef } from "react";
import type { SettingsDraft } from "../../../store/settingsStore";

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

  const apiKeyStatus = resolveApiKeyStatus(apiKey, hasApiKey, clearApiKey);
  const translationApiKeyStatus = resolveApiKeyStatus(
    translationApiKey,
    hasTranslationApiKey,
    clearTranslationApiKey,
  );

  return (
    <section>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex flex-col divide-y divide-border">
          <div className="px-4 py-3.5">
            <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">
                如何填写 AI 配置
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <li>
                  OpenAI：
                  <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px] text-foreground">
                    gpt-4o-mini
                  </code>
                  、{" "}
                  <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px] text-foreground">
                    https://api.openai.com/v1
                  </code>
                  和你的 API key。
                </li>
                <li>
                  兼容
                  OpenAI：模型、地址（通常带`/v1`）、密钥按服务商提供的值填写。
                </li>
              </ul>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="ai-model" className="mb-2 block">
              AI 模型
            </Label>
            <Input
              id="ai-model"
              name="ai-model"
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
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="ai-api-base-url" className="mb-2 block">
              API 地址
            </Label>
            <Input
              id="ai-api-base-url"
              name="ai-api-base-url"
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
              <p className="mt-1.5 text-xs text-destructive">
                {errors["ai.apiBaseUrl"]}
              </p>
            ) : null}
          </div>

          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label htmlFor="ai-api-key">API 密钥</Label>
              <Badge variant={apiKeyStatus.variant}>{apiKeyStatus.label}</Badge>
            </div>
            <Input
              id="ai-api-key"
              name="ai-api-key"
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
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {hasApiKey
                  ? "保留当前密钥可留空；如需删除，请点击“删除已保存的密钥”。"
                  : "暂不设置可留空，稍后再补充。"}
              </p>
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
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">翻译配置</p>
                <p className="text-xs text-muted-foreground">
                  开启后，翻译会复用上方的 AI 模型、API 地址和 API 密钥。
                </p>
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
            <p className="text-xs text-muted-foreground">
              {translation.useSharedAi
                ? "当前：翻译复用上方主 AI 配置。"
                : "当前：翻译使用下方单独配置。"}
            </p>
          </div>

          {!translation.useSharedAi ? (
            <>
              <div className="px-4 py-3.5">
                <Label htmlFor="ai-translation-model" className="mb-2 block">
                  翻译模型
                </Label>
                <Input
                  id="ai-translation-model"
                  name="ai-translation-model"
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
              </div>

              <div className="px-4 py-3.5">
                <Label
                  htmlFor="ai-translation-api-base-url"
                  className="mb-2 block"
                >
                  翻译 API 地址
                </Label>
                <Input
                  id="ai-translation-api-base-url"
                  name="ai-translation-api-base-url"
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
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors["ai.translation.apiBaseUrl"]}
                  </p>
                ) : null}
              </div>

              <div className="px-4 py-3.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label htmlFor="ai-translation-api-key">翻译 API 密钥</Label>
                  <Badge variant={translationApiKeyStatus.variant}>
                    {translationApiKeyStatus.label}
                  </Badge>
                </div>
                <Input
                  id="ai-translation-api-key"
                  name="ai-translation-api-key"
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
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {hasTranslationApiKey
                      ? "保留当前翻译密钥可留空；如需删除，请点击“删除已保存的翻译密钥”。"
                      : "暂不设置可留空，稍后再补充。"}
                  </p>
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
