import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { defaultPersistedSettings } from "../settingsSchema";
import type { SettingsDraft } from "../../../store/settingsStore";
import AISettingsPanel from "./AISettingsPanel";

function createInitialDraft(): SettingsDraft {
  return {
    persisted: structuredClone(defaultPersistedSettings),
    session: {
      ai: {
        apiKey: "",
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

describe("AISettingsPanel", () => {
  it("defaults translation to shared AI config and reveals dedicated key fields when disabled", () => {
    render(<Harness />);

    expect(screen.getByText("如何填写 AI 配置")).toBeInTheDocument();
    expect(
      screen.getByText(
        "兼容 OpenAI：模型、地址（通常带 `/v1`）、密钥按服务商提供的值填写。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("翻译配置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复用主配置" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByLabelText("翻译 API 密钥")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "单独配置" }));

    expect(screen.getByLabelText("翻译模型")).toBeInTheDocument();
    expect(screen.getByLabelText("翻译 API 地址")).toBeInTheDocument();
    expect(screen.getByLabelText("翻译 API 密钥")).toBeInTheDocument();
  });
});
