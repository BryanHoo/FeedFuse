"""
CLI Adapter for supported Superwork platforms.

Supported platforms:
- claude: Claude Code (default)
- codex: Codex CLI

Usage:
    from common.cli_adapter import CLIAdapter

    adapter = CLIAdapter("claude")
    cmd = adapter.build_run_command(
        agent="dispatch",
        session_id="abc123",
        prompt="Start the pipeline"
    )
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Platform = Literal["claude", "codex"]


@dataclass
class CLIAdapter:
    """Adapter for different AI coding CLI tools."""

    platform: Platform

    def get_agent_name(self, agent: str) -> str:
        """Return the platform-specific agent name."""
        return agent

    @property
    def config_dir_name(self) -> str:
        """Get the platform-specific config directory name."""
        if self.platform == "codex":
            return ".codex"
        return ".claude"

    def get_config_dir(self, project_root: Path) -> Path:
        """Get the platform-specific config directory."""
        return project_root / self.config_dir_name

    def get_agent_path(self, agent: str, project_root: Path) -> Path:
        """Get the path to the agent definition file."""
        if self.platform == "codex":
            return self.get_config_dir(project_root) / "agents" / f"{agent}.toml"
        return self.get_config_dir(project_root) / "agents" / f"{agent}.md"

    def get_commands_path(self, project_root: Path, *parts: str) -> Path:
        """Get the path to commands directory or a specific command file."""
        base_dir = self.get_config_dir(project_root) / "commands"
        if not parts:
            return base_dir
        return base_dir / Path(*parts)

    def get_superwork_command_path(self, name: str) -> str:
        """Get the relative path to a Superwork command file."""
        if self.platform == "codex":
            return f".agents/skills/{name}/SKILL.md"
        return f"{self.config_dir_name}/commands/superwork/{name}.md"

    def get_non_interactive_env(self) -> dict[str, str]:
        """Get environment variables for non-interactive mode."""
        if self.platform == "codex":
            return {"CODEX_NON_INTERACTIVE": "1"}
        return {"CLAUDE_NON_INTERACTIVE": "1"}

    def build_run_command(
        self,
        agent: str,
        prompt: str,
        session_id: str | None = None,
        skip_permissions: bool = True,
        verbose: bool = True,
        json_output: bool = True,
    ) -> list[str]:
        """Build the CLI command for running an agent."""
        if self.platform == "codex":
            return ["codex", "exec", prompt]

        cmd = ["claude", "-p", "--agent", agent]

        if session_id:
            cmd.extend(["--session-id", session_id])

        if skip_permissions:
            cmd.append("--dangerously-skip-permissions")

        if json_output:
            cmd.extend(["--output-format", "stream-json"])

        if verbose:
            cmd.append("--verbose")

        cmd.append(prompt)
        return cmd

    def build_resume_command(self, session_id: str) -> list[str]:
        """Build the CLI command for resuming a session."""
        if self.platform == "codex":
            return ["codex", "resume", session_id]
        return ["claude", "--resume", session_id]

    def get_resume_command_str(self, session_id: str, cwd: str | None = None) -> str:
        """Get a human-readable resume command string."""
        cmd_str = " ".join(self.build_resume_command(session_id))
        if cwd:
            return f"cd {cwd} && {cmd_str}"
        return cmd_str

    @property
    def is_claude(self) -> bool:
        """Check if platform is Claude Code."""
        return self.platform == "claude"

    @property
    def cli_name(self) -> str:
        """Get the CLI executable name."""
        if self.platform == "codex":
            return "codex"
        return "claude"

    @property
    def supports_cli_agents(self) -> bool:
        """Check if platform supports running agents via CLI."""
        return True

    @property
    def requires_agent_definition_file(self) -> bool:
        """Check if platform requires an agent definition file."""
        return self.platform == "claude"

    @property
    def supports_session_id_on_create(self) -> bool:
        """Check if platform supports specifying a session ID on creation."""
        return self.platform == "claude"

    def extract_session_id_from_log(self, log_content: str) -> str | None:
        """Extract session IDs from tool log output when possible."""
        import re

        match = re.search(r"(session|sess)_[a-zA-Z0-9_-]+", log_content)
        if match:
            return match.group(0)
        return None


def get_cli_adapter(platform: str = "claude") -> CLIAdapter:
    """Get a CLI adapter for the specified platform."""
    if platform not in ("claude", "codex"):
        raise ValueError(
            "Unsupported platform: "
            f"{platform} (must be 'claude' or 'codex')",
        )

    return CLIAdapter(platform=platform)  # type: ignore[arg-type]


_ALL_PLATFORM_CONFIG_DIRS = (".claude", ".agents", ".codex")
"""All platform config directory names (used by detect_platform exclusion checks)."""


def _has_other_platform_dir(project_root: Path, exclude: set[str]) -> bool:
    """Check if any platform config dir exists besides those in *exclude*."""
    return any(
        (project_root / directory_name).is_dir()
        for directory_name in _ALL_PLATFORM_CONFIG_DIRS
        if directory_name not in exclude
    )


def detect_platform(project_root: Path) -> Platform:
    """Auto-detect the platform based on existing config directories."""
    import os

    env_platform = os.environ.get("SUPERWORK_PLATFORM", "").lower()
    if env_platform in ("claude", "codex"):
        return env_platform  # type: ignore[return-value]

    # .agents/skills alone should not force codex mode.
    if (project_root / ".codex").is_dir() and not _has_other_platform_dir(
        project_root, {".codex", ".agents"},
    ):
        return "codex"

    return "claude"


def get_cli_adapter_auto(project_root: Path) -> CLIAdapter:
    """Get a CLI adapter with auto-detected platform."""
    platform = detect_platform(project_root)
    return CLIAdapter(platform=platform)
