import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { defaultPersistedSettings } from '../settingsSchema';
import type { SettingsDraft } from '../../../store/settingsStore';
import AISettingsPanel from './AISettingsPanel';

function createInitialDraft(): SettingsDraft {
  return {
    persisted: structuredClone(defaultPersistedSettings),
    session: {
      ai: {
        apiKey: '',
        hasApiKey: false,
        clearApiKey: false,
      },
      rssValidation: {},
    },
  } as SettingsDraft;
}

function Harness() {
  const [draft, setDraft] = useState<SettingsDraft>(createInitialDraft());

  return (
    <AISettingsPanel
      draft={draft}
      onChange={(updater) => {
        setDraft((current) => {
          const next = structuredClone(current);
          updater(next);
          return next;
        });
      }}
      errors={{}}
    />
  );
}

describe('AISettingsPanel', () => {
  it('defaults translation to shared AI config and reveals dedicated key fields when disabled', () => {
    render(<Harness />);

    expect(screen.getByText('翻译配置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开启' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Translation API Key')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(screen.getByLabelText('Translation Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Translation API Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Translation API Key')).toBeInTheDocument();
  });
});
