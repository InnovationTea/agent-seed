# Agent Runbook Distiller

This repository contains the source and release tooling for the `agent-runbook-distiller` Codex skill.

`agent-runbook-distiller` distills repository evidence and owner knowledge into executable agent runbooks, review checkpoints, and project-local guidance. Its goal is to help coding agents develop in safe self-directed loops while humans focus on review, approval, and the few decisions that require project-owner judgment.

## Repository Layout

```text
.
|-- skill/                 # Source content packaged as the skill
|   |-- SKILL.md           # Skill entry point
|   |-- agents/            # Platform agent metadata
|   |-- references/        # Load-on-demand workflow references
|   |   `-- frameworks/    # Built-in framework knowledge packs
|   |-- bundled-skills/    # Direct skills distributed by this skill
|   |-- packages/          # Bundled multi-platform skill packages
|   |-- bundled-skills.json
|   |-- framework-knowledge.json
|   |-- recommended-external-plugins.json
|   `-- bundled-packages.json
|-- tools/                 # Maintainer tooling, not included in the skill package
|   |-- release.mjs
|   `-- release.test.mjs
|-- outputs/               # Generated release artifacts, ignored by Git
|-- Makefile               # Thin command entry point
`-- README.md
```

The release package is built from `skill/` only. Root-level files such as this README, `Makefile`, and `tools/` are maintainer assets and are not copied into the published skill artifact.

## What The Skill Produces

- `AGENTS.md` as a concise project entry point for future agents.
- Focused `agents.d/` runbooks for bootstrap, tooling, architecture, change recipes, debugging, review handoff, risks, and missing context.
- Optional platform-specific files such as `CLAUDE.md` or project-local skills when the owner uses those platforms.
- Recommended external plugin guidance from configuration, using each platform's normal network-backed install flow instead of vendoring plugin internals.
- Automation breakpoints and human review checkpoints that clarify when an agent can keep looping and when it must stop for approval.
- Framework fingerprints for common, private, vendor, or internally named frameworks so agents do not guess at framework behavior.
- Built-in and project-local framework knowledge routing, starting with a Nuwa preset that improves scans and owner interviews without treating preset knowledge as confirmed project facts.

## Requirements

- Node.js with the built-in `node:test` runner.
- GNU Make for the convenience targets.
- Windows PowerShell available as `powershell`, used by the release script to create the zip archive with .NET compression APIs.

## Common Commands

Run the release test:

```sh
make check
```

Build the expanded release directory and zip package:

```sh
make release
```

Equivalent direct commands:

```sh
node --test tools/release.test.mjs
node tools/release.mjs
```

## Release Artifacts

`make release` writes:

```text
outputs/agent-runbook-distiller/
outputs/agent-runbook-distiller.zip
```

The expanded directory is useful for inspection. The zip file is the distributable artifact. The zip root contains `SKILL.md` directly, not an extra nested wrapper directory.

## Bundled Packages

### `git-code-tracker`

- Version: `v1.0.1`
- Source: `https://github.com/yooocen/git-code-tracker.git`
- Ref: `refs/tags/v1.0.1`
- Commit: `e1cc62d9fb3f82e2f13ca276be94ce5fcdaf6aa9`
- Package path: `skill/packages/git-code-tracker`
- Project-local installer: `node skill/packages/git-code-tracker/install-to-project.js <target-project>`

Do not run the installer without explicit approval. It may write `.opencode/`, `.claude/`, `.git/hooks`, `.ai-tracking`, `.gitignore`, and `AGENTS.md` in the target project.

## Development Notes

- Edit source files under `skill/`.
- Do not edit generated files under `outputs/`.
- Keep bundled direct skills registered in `skill/bundled-skills.json`.
- Keep bundled packages registered in `skill/bundled-packages.json`.
- Keep recommended external plugins registered in `skill/recommended-external-plugins.json`.
- Keep framework knowledge registered in `skill/framework-knowledge.json`; place built-in framework packs under `skill/references/frameworks/`.
- Run `make release` before publishing changes so the test and package build both exercise the current tree.
