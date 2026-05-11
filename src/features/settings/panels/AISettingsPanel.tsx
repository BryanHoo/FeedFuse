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
  const privateFm = ai.privateFm;
  const privateFmApiKey = draft.session.ai.privateFmApiKey ?? "";
  const hasPrivateFmApiKey = draft.session.ai.hasPrivateFmApiKey ?? false;
  const clearPrivateFmApiKey = draft.session.ai.clearPrivateFmApiKey ?? false;

  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const translationApiKeyInputRef = useRef<HTMLInputElement>(null);
  const privateFmApiKeyInputRef = useRef<HTMLInputElement>(null);
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
  const privateFmApiKeyStatus = resolveApiKeyStatus(
    privateFmApiKey,
    hasPrivateFmApiKey,
    clearPrivateFmApiKey,
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
            <Label id={aiModelLabelId} className="mb-2 block">
              AI 模型
            </Label>
            <Input
              id="ai-model"
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
          </div>

          <div className="px-4 py-3.5">
            <Label id={aiApiBaseUrlLabelId} className="mb-2 block">
              API 地址
            </Label>
            <Input
              id="ai-api-base-url"
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
              <p className="mt-1.5 text-xs text-destructive">
                {errors["ai.apiBaseUrl"]}
              </p>
            ) : null}
          </div>

          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label id={aiApiKeyLabelId}>API 密钥</Label>
              <Badge variant={apiKeyStatus.variant}>{apiKeyStatus.label}</Badge>
            </div>
            <Input
              id="ai-api-key"
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
          </div>

          {!translation.useSharedAi ? (
            <>
              <div className="px-4 py-3.5">
                <Label id={aiTranslationModelLabelId} className="mb-2 block">
                  翻译模型
                </Label>
                <Input
                  id="ai-translation-model"
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
              </div>

              <div className="px-4 py-3.5">
                <Label id={aiTranslationApiBaseUrlLabelId} className="mb-2 block">
                  翻译 API 地址
                </Label>
                <Input
                  id="ai-translation-api-base-url"
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
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors["ai.translation.apiBaseUrl"]}
                  </p>
                ) : null}
              </div>

              <div className="px-4 py-3.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label id={aiTranslationApiKeyLabelId}>翻译 API 密钥</Label>
                  <Badge variant={translationApiKeyStatus.variant}>
                    {translationApiKeyStatus.label}
                  </Badge>
                </div>
                <Input
                  id="ai-translation-api-key"
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

          <div className="px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">
                私人 FM / StepFun TTS
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                智能报告源开启私人 FM 后，会使用这里的 StepFun 配置生成音频。
              </p>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="private-fm-api-base-url" className="mb-2 block">
              StepFun API 地址
            </Label>
            <Input
              id="private-fm-api-base-url"
              name="private-fm-api-base-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={privateFm.apiBaseUrl}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.privateFm.apiBaseUrl =
                    event.target.value;
                })
              }
              placeholder="例如：https://api.stepfun.com/v1"
            />
            {errors["ai.privateFm.apiBaseUrl"] ? (
              <p className="mt-1.5 text-xs text-destructive">
                {errors["ai.privateFm.apiBaseUrl"]}
              </p>
            ) : null}
          </div>

          <div className="grid gap-0 border-t border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
            <div className="px-4 py-3.5">
              <Label htmlFor="private-fm-model" className="mb-2 block">
                TTS 模型
              </Label>
              <Input
                id="private-fm-model"
                name="private-fm-model"
                autoComplete="off"
                spellCheck={false}
                value={privateFm.model}
                onChange={(event) =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.ai.privateFm.model = event.target.value;
                  })
                }
                placeholder="例如：stepaudio-2.5-tts"
              />
            </div>

            <div className="px-4 py-3.5">
              <Label htmlFor="private-fm-voice" className="mb-2 block">
                音色
              </Label>
              <Input
                id="private-fm-voice"
                name="private-fm-voice"
                autoComplete="off"
                spellCheck={false}
                value={privateFm.voice}
                onChange={(event) =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.ai.privateFm.voice = event.target.value;
                  })
                }
                placeholder="例如：elegantgentle-female"
              />
            </div>
          </div>

          <div className="grid gap-0 border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
            <div className="px-4 py-3.5">
              <Label htmlFor="private-fm-format" className="mb-2 block">
                音频格式
              </Label>
              <Input
                id="private-fm-format"
                name="private-fm-format"
                autoComplete="off"
                spellCheck={false}
                value={privateFm.responseFormat}
                onChange={(event) =>
                  onChange((nextDraft) => {
                    const value = event.target.value;
                    if (["mp3", "wav", "flac", "opus", "pcm"].includes(value)) {
                      nextDraft.persisted.ai.privateFm.responseFormat =
                        value as typeof privateFm.responseFormat;
                    }
                  })
                }
                placeholder="mp3"
              />
            </div>

            <div className="px-4 py-3.5">
              <Label htmlFor="private-fm-speed" className="mb-2 block">
                语速
              </Label>
              <Input
                id="private-fm-speed"
                name="private-fm-speed"
                type="number"
                min="0.5"
                max="2"
                step="0.1"
                value={privateFm.speed}
                onChange={(event) =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.ai.privateFm.speed = Number(event.target.value);
                  })
                }
              />
            </div>

            <div className="px-4 py-3.5">
              <Label htmlFor="private-fm-volume" className="mb-2 block">
                音量
              </Label>
              <Input
                id="private-fm-volume"
                name="private-fm-volume"
                type="number"
                min="0.1"
                max="2"
                step="0.1"
                value={privateFm.volume}
                onChange={(event) =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.ai.privateFm.volume = Number(event.target.value);
                  })
                }
              />
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label htmlFor="private-fm-api-key">StepFun API 密钥</Label>
              <Badge variant={privateFmApiKeyStatus.variant}>
                {privateFmApiKeyStatus.label}
              </Badge>
            </div>
            <Input
              id="private-fm-api-key"
              name="private-fm-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              ref={privateFmApiKeyInputRef}
              defaultValue={privateFmApiKey}
              onBlur={(event) => {
                if (
                  !privateFmApiKey.trim() &&
                  hasPrivateFmApiKey &&
                  !clearPrivateFmApiKey
                ) {
                  event.currentTarget.value = "";
                }
              }}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.session.ai.privateFmApiKey = event.target.value;
                  nextDraft.session.ai.clearPrivateFmApiKey = false;
                })
              }
              placeholder="例如：sk-…"
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {hasPrivateFmApiKey
                  ? "保留当前密钥可留空；如需删除，请点击“删除已保存的密钥”。"
                  : "未配置时，私人 FM 会生成失败并提示补充 StepFun 密钥。"}
              </p>
              {hasPrivateFmApiKey ? (
                <Button
                  type="button"
                  size="sm"
                  variant={clearPrivateFmApiKey ? "outline" : "destructive"}
                  className="h-8"
                  onClick={() =>
                    onChange((nextDraft) => {
                      if (privateFmApiKeyInputRef.current) {
                        privateFmApiKeyInputRef.current.value = "";
                      }
                      nextDraft.session.ai.privateFmApiKey = "";
                      nextDraft.session.ai.clearPrivateFmApiKey =
                        !clearPrivateFmApiKey;
                    })
                  }
                >
                  {clearPrivateFmApiKey
                    ? "保留已保存的密钥"
                    : "删除已保存的密钥"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
