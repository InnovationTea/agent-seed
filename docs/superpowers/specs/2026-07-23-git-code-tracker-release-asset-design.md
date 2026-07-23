# Git Code Tracker Release Asset Integration

## Goal

Replace Agent Seed's vendored `git-code-tracker` repository with the upstream
`v1.0.3` release asset. Install the asset for the detected project platform
without carrying the full upstream project in the Agent Seed package.

## Asset And Platform Selection

Agent Seed distributes the upstream release archive
`packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip` as its sole tracker asset. The archive
contains platform-ready roots:

- `.claude/skills/ai-code-tracker/`
- `.opencode/skills/ai-code-tracker/`
- `.cac/skills/ai-code-tracker/`

At install time, Agent Seed selects one platform from explicit user intent,
target-project evidence, and the active agent runtime. A single unambiguous
result is installed automatically. An absent or conflicting result requires a
user choice; the installer must not configure multiple platforms by default.

An explicit multi-platform request remains supported as an advanced path.

## Installation Flow

After the user approves installation, the installer:

1. Extracts only the selected platform's skill directory from the archive.
2. Replaces only the matching target directory under the project root.
3. Runs that copied directory's `scripts/install.js` from the target project.
4. Reports the files and configurations that the upstream installer changed.

For an explicit multi-platform request, repeat steps 1 through 3 independently
for each selected platform.

The copied upstream skill owns its initialization. Its `install.js` is allowed
to register Git hooks, `.ai-tracking`, commands, and platform configuration.
Agent Seed does not implement or duplicate those behaviors.

## Failure Handling

Reject an unsupported platform, a missing archive entry, or an ambiguous
automatic platform selection before writing the project. A failed upstream
initializer makes the install fail and reports its output. The installer does
not claim the integration is available until initialization succeeds.

## Manifest And Documentation

`bundled-packages.json` records the release-archive source, the three platform
asset paths, automatic platform detection, and the initializer command. Its
declared writes include the skill directory plus the upstream initialization
outputs. The README describes this boundary and removes the full-repository
installer instructions.

## Tests

Tests cover successful automatic detection for Claude Code, OpenCode, and
codeagent-cli; archive extraction into only the selected target; execution of
the selected initializer; explicit multi-platform installation; and failures
for unsupported, absent, and ambiguous platform selection.
