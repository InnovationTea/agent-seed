# Agent Seed

This repository contains the source and release tooling for the `agent-seed` Codex skill.

`agent-seed` distills repository evidence and owner knowledge into executable agent runbooks, review checkpoints, and project-local guidance. Its goal is to seed a codebase with the knowledge coding agents need to develop in safe self-directed loops while humans focus on review, approval, and the few decisions that require project-owner judgment.

## Repository Layout

```text
.
|-- skill/                 # Source content packaged as the skill
|   |-- SKILL.md           # Skill entry point
|   |-- agents/            # Platform agent metadata
|   |-- references/        # Load-on-demand workflow references
|   |   `-- frameworks/    # Built-in framework knowledge packs
|   |-- scripts/           # Packaged helper scripts
|   |-- bundled-skills/    # Direct skills distributed by this skill
|   |-- packages/          # Bundled multi-platform skill packages
|   |-- bundled-skills.json
|   |-- framework-knowledge.json
|   |-- external-packages.json
|   `-- bundled-packages.json
|-- tools/                 # Maintainer tooling, not included in the skill package
|   |-- release.mjs
|   `-- release.test.mjs
|-- outputs/               # Generated release artifacts, ignored by Git
|-- Makefile               # Thin command entry point
`-- README.md
```

The release package is built from `skill/` only. Root-level files such as this README, `Makefile`, and `tools/` are maintainer assets and are not copied into the published skill artifact. The `skill/` directory name is intentionally generic: it is the release package source root, so its contents become the top level of the published `agent-seed` skill.

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

On Windows, install Make with Chocolatey if it is not already available. Run PowerShell as Administrator, install Chocolatey, then install Make:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
choco install make
```

## Common Commands

Run the release test:

```sh
make check
```

Build the expanded release directory and zip package:

```sh
make release
```

Build with an explicit local version:

```sh
make release VERSION=v1.2.3
```

Equivalent direct commands:

```sh
node --test tools/release.test.mjs
node tools/release.mjs
node tools/release.mjs --version v1.2.3
```

## Release Artifacts

`make release` writes:

```text
outputs/agent-seed/
outputs/agent-seed.zip
outputs/agent-seed-release.json
outputs/bundled-skills/<skill>/
outputs/bundled-skills/<skill>.zip
outputs/bundled-skills/<skill>-codex/
outputs/bundled-skills/<skill>-codex.zip
```

The expanded directory is useful for inspection. The zip file is the distributable artifact. The zip root contains `SKILL.md` directly, not an extra nested wrapper directory.

Tagged GitHub releases also include `agent-seed-release.json`, a machine-readable version manifest with the release version, repository, commit, asset names, sizes, and SHA-256 hashes. During packaging, `tools/release.mjs` injects `VERSION.json` into `outputs/agent-seed/` before creating `agent-seed.zip`; that file is not maintained by hand in `skill/`.

Bundled direct skill artifacts are generated from `skill/bundled-skills.json`, not from hard-coded skill names. The plain `<skill>` artifact copies the configured `source_path` as a universal skill root. The `<skill>-codex` artifact starts from the same source and merges the configured Codex overlay, so it can be copied directly into a Codex project-local `skills/<skill>/` directory.

## Skill Self Update

Released `agent-seed` packages include `scripts/update-agent-seed.mjs`. From an installed release package, check for a newer GitHub release:

```sh
node scripts/update-agent-seed.mjs --json
```

Apply the update only after deciding to replace the installed skill directory:

```sh
node scripts/update-agent-seed.mjs --apply
```

The updater reads `VERSION.json` for the current repository/version, calls the GitHub latest release API, downloads `agent-seed.zip`, expands it, and replaces the current skill root with the expanded package. Replacement first moves the old skill root to a temporary backup, copies the new package into place, and rolls back the backup if the copy fails. Files that existed only in the old package are removed instead of lingering as stale leftovers. When running from the repository source tree instead of a release package, pass `--repository owner/repo` because `VERSION.json` is generated only during release packaging.

On Windows, a running agent host can lock the installed skill directory. In that case an approved `--apply` stages the verified package in the user's local application-data directory, returns a queued result with `windows-directory-locked`, and starts a detached helper. The update completes automatically after the agent host exits and releases the lock. The helper records `updated` only after it verifies the installed `VERSION.json`; terminal `failed` state needs a new `--apply` command.

When `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY` is set, the updater applies the proxy itself for the GitHub release check and asset download. If no updater or environment proxy is configured, the updater also checks Git's `http.proxy`/`https.proxy` settings and, on Windows, the current user's explicit system proxy settings, then reuses the discovered proxy for the GitHub release check. If an interactive update check still fails with a proxy-like network error and no proxy is configured, the updater asks for an HTTPS proxy URL, saves it to `.agents/agent-seed.json`, and retries once.

Proxy settings can also be persisted in the local `.agents/agent-seed.json` config, which is ignored by Git because it may contain machine-specific proxy or update permission state:

```sh
node scripts/update-agent-seed.mjs --set-https-proxy http://proxy.example:8080
node scripts/update-agent-seed.mjs --set-no-proxy localhost,127.0.0.1
```

During Agent Seed activation, `/agent-seed` authorizes a read-only update preflight by default: read the installed `VERSION.json`, read the target project's `.agents/agent-seed.json`, then run `node scripts/update-agent-seed.mjs --json`. Only an explicit per-turn request to skip the check or `self_update.check_on_start: false` may suppress it. `self_update.last_check` is historical state and cannot prove the remote release is still current. Applying an update with `--apply` remains a separate approval. If the read-only check cannot run, agents must report the update status as unknown rather than treating the skill as current.

## Bundled Packages

### `git-code-tracker`

- Version: `v1.0.3`
- Source: `https://github.com/yooocen/git-code-tracker` Release asset `ai-commit-statistic-skill-v1.0.3.zip`
- Ref: `refs/tags/v1.0.3`
- Commit: `66c048422dee2e433583cb97bb3a71efd0fcfbef`
- Bundled asset: `skill/assets/ai-commit-statistic-skill-v1.0.3.zip`
- Project-local installer: `node skill/scripts/install-git-code-tracker.mjs <target-project>`

Do not run the installer without explicit approval. It automatically detects one supported platform from project or runtime evidence, copies only that platform's `ai-code-tracker` skill from the release asset, then runs the copied skill's `install.js`. The copied skill may write `.opencode/`, `.claude/`, `.cac/`, `.git/hooks`, `.ai-tracking`, `.gitignore`, and `AGENTS.md` in the target project. Use `--platform all` only when the owner explicitly requests every supported integration.

## Development Notes

- Edit source files under `skill/`.
- Do not edit generated files under `outputs/`.
- Do not edit packaged `VERSION.json` by hand; it is generated from the tag/ref environment during release.
- Keep bundled direct skills registered in `skill/bundled-skills.json`.
- Keep bundled packages registered in `skill/bundled-packages.json`.
- Keep recommended external plugins registered in `skill/external-packages.json`.
- Keep framework knowledge registered in `skill/framework-knowledge.json`; place built-in framework packs under `skill/references/frameworks/`.
- Run `make release` before publishing changes so the test and package build both exercise the current tree.
