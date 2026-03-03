import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRef } from 'react';
import type { SettingsDraft } from '../../../store/settingsStore';

interface AISettingsPanelProps {
  draft: SettingsDraft;
  onChange: (updater: (draft: SettingsDraft) => void) => void;
  errors: Record<string, string>;
}

export default function AISettingsPanel({ draft, onChange, errors }: AISettingsPanelProps) {
  const ai = draft.persisted.ai;
  const translation = ai.translation;
  const apiKey = draft.session.ai.apiKey;
  const hasApiKey = draft.session.ai.hasApiKey;
  const clearApiKey = draft.session.ai.clearApiKey;
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  const apiKeyStatus: { label: string; variant: Parameters<typeof Badge>[0]['variant'] } = (() => {
    if (clearApiKey) return { label: '待清除', variant: 'destructive' };
    if (apiKey.trim()) return { label: '待保存', variant: 'secondary' };
    if (hasApiKey) return { label: '已配置', variant: 'secondary' };
    return { label: '未配置', variant: 'outline' };
  })();

  return (
    <section>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex flex-col divide-y divide-border">
          <div className="px-4 py-3.5">
            <Label htmlFor="ai-model" className="mb-2 block">
              Model
            </Label>
            <Input
              id="ai-model"
              value={ai.model}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.model = event.target.value;
                })
              }
              placeholder="例如：gpt-4o-mini"
            />
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="ai-api-base-url" className="mb-2 block">
              API Base URL
            </Label>
            <Input
              id="ai-api-base-url"
              value={ai.apiBaseUrl}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.ai.apiBaseUrl = event.target.value;
                })
              }
              placeholder="https://api.openai.com/v1"
            />
            {errors['ai.apiBaseUrl'] ? (
              <p className="mt-1.5 text-xs text-destructive">{errors['ai.apiBaseUrl']}</p>
            ) : null}
          </div>

          <div className="px-4 py-3.5">
            <p className="mb-2 text-sm font-medium text-foreground">Translation Provider</p>
            <div className="flex gap-1">
              <Button
                type="button"
                onClick={() =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.ai.translation.useSharedAi = true;
                  })
                }
                aria-pressed={translation.useSharedAi}
                variant={translation.useSharedAi ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded-lg px-3"
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
                variant={!translation.useSharedAi ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded-lg px-3"
              >
                独立配置
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {translation.useSharedAi
                ? '正文/标题翻译复用上方 Model、API Base URL 和主 API Key。'
                : '正文/标题翻译将使用下方独立配置。'}
            </p>
          </div>

          {!translation.useSharedAi ? (
            <>
              <div className="px-4 py-3.5">
                <Label htmlFor="ai-translation-model" className="mb-2 block">
                  Translation Model
                </Label>
                <Input
                  id="ai-translation-model"
                  value={translation.model}
                  onChange={(event) =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.ai.translation.model = event.target.value;
                    })
                  }
                  placeholder="例如：gpt-4o-mini"
                />
              </div>

              <div className="px-4 py-3.5">
                <Label htmlFor="ai-translation-api-base-url" className="mb-2 block">
                  Translation API Base URL
                </Label>
                <Input
                  id="ai-translation-api-base-url"
                  value={translation.apiBaseUrl}
                  onChange={(event) =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.ai.translation.apiBaseUrl = event.target.value;
                    })
                  }
                  placeholder="https://api.openai.com/v1"
                />
                {errors['ai.translation.apiBaseUrl'] ? (
                  <p className="mt-1.5 text-xs text-destructive">{errors['ai.translation.apiBaseUrl']}</p>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label htmlFor="ai-api-key">API Key</Label>
              <Badge variant={apiKeyStatus.variant}>{apiKeyStatus.label}</Badge>
            </div>
            <Input
              id="ai-api-key"
              type="password"
              ref={apiKeyInputRef}
              defaultValue={apiKey}
              onBlur={(event) => {
                if (!apiKey.trim() && hasApiKey && !clearApiKey) {
                  event.currentTarget.value = '';
                }
              }}
              onChange={(event) =>
                onChange((nextDraft) => {
                  nextDraft.session.ai.apiKey = event.target.value;
                  nextDraft.session.ai.clearApiKey = false;
                })
              }
              placeholder="sk-..."
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {hasApiKey ? '留空表示保持不变。如需清除已保存密钥，可使用右侧按钮。' : '留空表示保持不变。'}
              </p>
              {hasApiKey ? (
                <Button
                  type="button"
                  size="sm"
                  variant={clearApiKey ? 'outline' : 'destructive'}
                  className="h-8"
                  onClick={() =>
                    onChange((nextDraft) => {
                      if (apiKeyInputRef.current) {
                        apiKeyInputRef.current.value = '';
                      }
                      nextDraft.session.ai.apiKey = '';
                      nextDraft.session.ai.clearApiKey = !clearApiKey;
                    })
                  }
                >
                  {clearApiKey ? '撤销清除' : '清除已保存密钥'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
