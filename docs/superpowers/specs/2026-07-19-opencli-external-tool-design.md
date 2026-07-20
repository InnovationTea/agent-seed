# OpenCLI External Tool Integration Design

## Goal

Register OpenCLI as a default, approval-gated external tool in `agent-seed` for Codex, Claude Code, codeagent-cli, and OpenCode. The integration should make browser-backed web automation available without vendoring OpenCLI's CLI or skills.

## Scope

- Add an `opencli` entry to `skill/external-packages.json`.
- Offer the installation during Agent Seed activation whenever a supported platform is detected or requested.
- Keep the installation network-backed and owner-approved.
- Describe validation and browser-specific prerequisites in the manifest entry.
- Add focused release-test coverage for the registration.

## Non-Goals

- Do not copy OpenCLI source, extension assets, or upstream skills into `skill/`.
- Do not install OpenCLI silently or pin a release version in this repository.
- Do not install the Chrome Browser Bridge extension automatically.
- Do not grant an agent independent authority to perform browser writes, submissions, publishing, deletion, or external communication.

## Architecture

`skill/external-packages.json` remains the sole registry for the recommendation. The existing Activation Preflight already requires every matching external plugin to be offered before onboarding proceeds; OpenCLI uses that mechanism without adding a new distribution type.

Each supported platform receives the same two upstream installation actions after owner approval:

1. Install the runtime with `npm install -g @jackwener/opencli`.
2. Install the upstream agent skills with `npx skills add jackwener/opencli`.

The manifest records the user-visible Browser Bridge extension as a separate, manual prerequisite. It is needed only for OpenCLI browser commands and adapters that use a logged-in browser session. Public and local adapter commands do not require it.

## Activation And Safety Flow

1. Agent Seed detects a supported platform using repository or runtime evidence.
2. The Activation Preflight sees the configured OpenCLI entry and offers its install action by default.
3. The owner explicitly approves or declines the network-backed installation. A decline or deferral is recorded using the existing external-plugin skip-reason rule.
4. After approval, the agent installs the upstream runtime and skills, then confirms `opencli --version` and that the platform recognizes the installed OpenCLI skills.
5. Before a browser-backed workflow, the agent tells the owner that Chrome/Chromium, the OpenCLI Browser Bridge extension, and an authenticated browser session may be required. It runs `opencli doctor` only after the owner authorizes that environment check.
6. Before any browser action that changes external state, the agent asks for task-specific confirmation unless the project owner already granted that exact authority in project guidance.

## Manifest Contract

The OpenCLI entry has `default_recommendation.requires_network` and `requires_user_approval` set to `true`, with `safety_level` set to `ask-first`. Its purpose and trigger describe website automation, structured extraction, and development or repair of reusable OpenCLI adapters.

For Codex, Claude Code, codeagent-cli, and OpenCode, the entry records:

- a platform-appropriate install action using the two upstream commands;
- evidence that OpenCLI or its skills are already installed;
- verification of the runtime and skill discovery;
- the separate manual Browser Bridge requirement for browser-backed work.

No platform action modifies browser configuration or installs an extension.

## Testing

Extend `tools/release.test.mjs` with a focused test that loads `skill/external-packages.json` and asserts that OpenCLI:

- is present in `recommended_external_plugins`;
- is marked network-backed, approval-gated, and ask-first;
- covers Codex, Claude Code, codeagent-cli, and OpenCode;
- gives each platform both the runtime install action and the upstream skill-install action;
- includes runtime and agent-skill verification guidance; and
- calls out the manual Browser Bridge prerequisite rather than treating it as automatically installed.

Run the existing release test suite after the change. The packaging test implicitly confirms the changed manifest remains in the release artifact.

## Compatibility And Risks

OpenCLI's upstream README and one skill currently disagree on the lowest supported Node version (20 versus 21). Agent Seed will not repeat a version claim; the install action and `opencli --version` verification leave the authoritative runtime check to OpenCLI. If installation fails due to Node compatibility, the agent must report the prerequisite rather than attempting an unapproved runtime upgrade.

OpenCLI's skills and browser command surface evolve upstream. Because Agent Seed installs them from the upstream project rather than copying them, agents receive the upstream-supported combination of skills and CLI. This avoids local skill/CLI drift at the cost of requiring network access and owner approval during installation.
