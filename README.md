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

## Project Configuration And Knowledge Assets

Agent Seed uses several project-local files, but they have different ownership
and Git policies. Do not treat every `.agents/` file as shared project
guidance:

| Path | Purpose | Git policy |
| --- | --- | --- |
| `.agents/agent-seed.json` | Shared Agent Seed minimum version and team policy such as write mode and startup checks. | Shared; commit it. |
| `.agents/agent-seed.local.json` | Machine-local Agent Seed installation path, proxy, update cache, and personal audit state. | Local; ignore it. |
| `.agents/managed-skills.json` | Shared desired versions, targets, and platforms for managed skills, packages, and selected external integrations. | Shared; commit it. |
| `.agents/ticket-lookup.json` | Shared requirements-management URL and team lookup policy. | Shared; commit it. Never store credentials. |
| `.agents/ticket-lookup.local.json` | Machine-specific ticket-lookup URL override or local policy. | Local; ignore it. |
| `.agents/ticket-lookup/sites/` | Shared host-specific ticket navigation, parsing, and API-shape knowledge. | Shared; commit it. Never store ticket content or credentials. |
| `AGENTS.md` | Concise project entry point and links to reusable runbooks. | Shared; commit it. |
| `agents.d/` | Detailed shared runbooks, site knowledge, change recipes, and review checkpoints. | Shared; commit it. |

Platform files such as `CLAUDE.md`, `.claude/settings.json`, `.cac/`,
`.opencode/`, `opencode.json`, and `.opencode.yaml` are generated or updated
only for platforms the owner uses.

The effective `knowledge_asset_write_mode` is resolved in this order:

```text
current user request -> shared .agents/agent-seed.json -> full-access
```

The supported values are `ask-each-change`, `agent-approve`, and
`full-access`. Even in `full-access`, installs, hook changes, external network
actions, secrets, and production operations still require separate approval.

The first split-capable Agent Seed release migrates a legacy unified
`.agents/agent-seed.json` into shared and local files, preserves unknown legacy
fields in local state, and repairs the target project's Git ignore rules. This
does not change the Agent Seed source repository's own Git policy. New Agent
Seed releases read legacy configuration; old releases are not expected to
write the new split format safely.

Migration validates known legacy field shapes before writing. Unsupported or
malformed state is left unchanged and reported instead of being partially
rewritten.

`agent-seed-updater` is an approval-gated bundled direct skill for Codex,
Claude Code, codeagent-cli, and OpenCode. Agent Seed installs its canonical
`AGENTS.md` rule so it runs exactly once before the first project task in each
new conversation. It calls `check-agent-seed-updates.mjs`, which combines the
existing cached Agent Seed self-update check with shared desired-state and
target installation checks. It does not run Agent Seed onboarding or perform a repository
scan. Codex and OpenCode read `AGENTS.md` directly; Claude Code and
codeagent-cli use the root `CLAUDE.md` import.

`knowledge-updater` is an approval-gated bundled direct skill for Codex,
Claude Code, codeagent-cli, and OpenCode. After installation, Agent Seed adds a
concise canonical `AGENTS.md` rule requiring the main agent to invoke it after
every completed and verified task, immediately before the final response.
Codex and OpenCode read that rule directly; Claude Code and codeagent-cli use a
root `CLAUDE.md` import of `@AGENTS.md`. Skill availability and instruction
visibility are verified independently so partial or pre-existing installs can
repair a missing rule without replacing the skill.

The updater uses only durable facts established in the current conversation
plus existing `AGENTS.md` and relevant `agents.d/` files. It performs no repository scan, owner interview, transcript read, network action, or child-agent launch. It updates knowledge assets directly with minimal edits and always reports `updated`, `no new reusable knowledge`, `not initialized`, `conflict`, or `update failed`.

Legacy project-local SessionEnd entries that reference the former runner are
reported during Agent Seed onboarding and removed only after approval.
Personal or global hook settings are outside the default inspection scope.

For ticket lookup, `allow_prefilled_login_submit` defaults to `true`. When
enabled, ticket-lookup may click a login button once only when the
browser already shows both credential fields populated; it never reads or
fills credential values and stops for MFA, CAPTCHA, or failure.

Ticket lookup stores reusable site knowledge by hostname under
`.agents/ticket-lookup/sites/<host>.md`. It reads an existing
`.agents/sitemaps/<host>/` first, then this Markdown file, and records only
durable navigation, UI, API-shape, parsing, and limitation facts with
`Observed`, `Verified`, or `Inferred` provenance labels.

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

Released `agent-seed` packages include `scripts/update-agent-seed.mjs`. From an installed release package, check for a newer GitHub release. Successful `current` and `available` results are cached for 24 hours by default, so routine activations do not repeat the network request:

```sh
node scripts/update-agent-seed.mjs --json
```

Bypass that cache when an immediate check is needed:

```sh
node scripts/update-agent-seed.mjs --json --force-check
```

Apply the update only after deciding to replace the installed skill directory:

```sh
node scripts/update-agent-seed.mjs --apply
```

The updater reads `VERSION.json` for the current repository/version, calls the GitHub latest release API, downloads `agent-seed.zip`, expands it, and replaces the current skill root with the expanded package. Replacement first moves the old skill root to a temporary backup, copies the new package into place, and rolls back the backup if the copy fails. Files that existed only in the old package are removed instead of lingering as stale leftovers. When running from the repository source tree instead of a release package, pass `--repository owner/repo` because `VERSION.json` is generated only during release packaging.

On Windows, a running agent host can lock the installed skill directory. In that case an approved `--apply` stages the verified package in the user's local application-data directory, returns a queued result with `windows-directory-locked`, and starts a detached helper. The update completes automatically after the agent host exits and releases the lock. The helper records `updated` only after it verifies the installed `VERSION.json`, then sends a best-effort Windows desktop notification that the update is ready for the next session; terminal `failed` state needs a new `--apply` command.

When `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY` is set, the updater applies the proxy itself for the GitHub release check and asset download. If no updater or environment proxy is configured, the updater also checks Git's `http.proxy`/`https.proxy` settings and, on Windows, the current user's explicit system proxy settings, then reuses the discovered proxy for the GitHub release check. If an interactive update check still fails with a proxy-like network error and no proxy is configured, the updater asks for an HTTPS proxy URL, saves it to `.agents/agent-seed.local.json`, and retries once.

Proxy settings can also be persisted in `.agents/agent-seed.local.json`, which is ignored by Git because it contains machine-specific proxy or update state:

```sh
node scripts/update-agent-seed.mjs --set-https-proxy http://proxy.example:8080
node scripts/update-agent-seed.mjs --set-no-proxy localhost,127.0.0.1
```

During Agent Seed activation, `/agent-seed` reads the installed `VERSION.json`, resolves shared `.agents/agent-seed.json` policy with local `.agents/agent-seed.local.json` state, then runs `node scripts/update-agent-seed.mjs --json`. The shared `minimum_agent_seed_version` is a compatibility baseline: lower versions require an approved update, equal versions are current, and newer versions are never downgraded. A newer installed version may propose a baseline refresh, but startup never edits the shared file automatically. The default 24-hour cache avoids another network request after a successful `current` or `available` result; use `--force-check` for an immediate refresh. `self_update.update_mode` defaults to `notify`, while `manual` only reports state. Applying an update with `--apply` remains a separate approval. If the check cannot run, agents must report the update status as unknown rather than treating the skill as current.

After using a newer installed Agent Seed, an owner can explicitly refresh the
shared baseline and review the resulting Git diff:

```bash
node scripts/update-agent-seed.mjs --refresh-baseline --approved
```

## Managed Skill Updates

When Agent Seed installs a bundled direct skill, package, or selected external
integration, the team's desired version and target platform live in the
committed `.agents/managed-skills.json`. Managed target directories contain a
non-sensitive `.agent-seed-managed.json` version marker written only after a
successful approved install. External integration availability and actual
versions are recorded under `.agents/agent-seed.local.json`. Personal
`declined_install_offers` also remain local and are never shared.
At the start of a new conversation, the installed
`agent-seed-updater` runs the combined preflight for the project platform:

```bash
node scripts/check-agent-seed-updates.mjs <target-project> --platform <platform> --json
```

The Agent Seed part keeps the existing 24-hour cache and approval-gated apply
behavior. Missing or invalid Agent Seed version/baseline evidence is `unknown`,
and an apply candidate below the committed minimum is rejected. The managed
part reports `current`, `update-available`, `missing`,
`unverified`, `baseline-unavailable`, `legacy-unmanaged`, `install-available`,
or `declined-current-version`. `baseline-unavailable` also covers a shared
entry or version that the installed Agent Seed manifest cannot supply, even
when the local target is also missing. A
declined current version is diagnostic-only and the same version is suppressed
instead of prompting again. A higher manifest version prompts again. Deferring
or ignoring an offer does not record a decline.

The preflight does not hash installed directories, modify managed project
content, run onboarding, or scan the repository. After explicit owner
approval, install or update one managed item with:

```bash
node scripts/manage-managed-skills.mjs apply <target-project> --name <managed-name> --platform <platform> --approved
```

Record an explicit version-specific decline with:

```bash
node scripts/manage-managed-skills.mjs decline <target-project> --name <managed-name> --platform <platform> --confirmed
```

After a synchronous Agent Seed update, run the managed recheck immediately
against the newly installed manifests. When Windows reports `queued`, defer
that recheck until the next conversation after replacement completes.

Direct skills are staged and replaced with rollback on verification failure.
Bundled packages use their existing installer with backups of their declared
write roots. A legacy unrecorded installation is force-replaced only after the
same approval, then becomes managed. Apply operations reject versions below
either the shared baseline or verified installed marker. A successful install
of a higher managed version advances `.agents/managed-skills.json`; review and
commit that team baseline change. External integrations follow the same
no-downgrade shared-baseline rule but remain owned by their platform; Agent Seed
records their local status and invokes only a platform-native update action
after separate approval.

Startup `agent-seed-updater`, onboarding `agent-seed`, and end-of-task
`knowledge-updater` have separate responsibilities. `knowledge-updater` runs
after each completed task and maintains only durable project guidance.

## Bundled Packages

### `git-code-tracker`

- Version: `v1.0.4`
- Source: `https://github.com/yooocen/git-code-tracker` Release asset `ai-commit-statistic-skill-v1.0.4.zip`
- Ref: `refs/tags/v1.0.4`
- Commit: `8cb0855155c8ad7483232e9d5679ee19d8714df8`
- Bundled asset: `skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.4.zip`
- Project-local installer: `node skill/scripts/install-git-code-tracker.mjs <target-project>`

Do not run the installer without explicit approval. It automatically detects one supported platform from project or runtime evidence, copies only that platform's `ai-code-tracker` skill from the release asset, then runs the copied skill's `install.js`. For a new project, Agent Seed configures `.ai-tracking/config.json` with `uploadUrl` set to `http://7.213.196.158:8088/v1/records`; an existing non-empty project URL is preserved. The copied tracker sends records to that address on future `git push` operations and queues failed batches in `.ai-tracking/upload-outbox.json`. It may also write `.opencode/`, `.claude/`, `.cac/`, `.git/hooks`, `.gitignore`, and `AGENTS.md` in the target project. Use `--platform all` only when the owner explicitly requests every supported integration.

## Development Notes

- Edit source files under `skill/`.
- Do not edit generated files under `outputs/`.
- Do not edit packaged `VERSION.json` by hand; it is generated from the tag/ref environment during release.
- Keep bundled direct skills registered in `skill/bundled-skills.json`.
- Keep bundled packages registered in `skill/bundled-packages.json`.
- Keep recommended external plugins registered in `skill/external-packages.json`.
- Keep framework knowledge registered in `skill/framework-knowledge.json`; place built-in framework packs under `skill/references/frameworks/`.
- Run `make release` before publishing changes so the test and package build both exercise the current tree.
