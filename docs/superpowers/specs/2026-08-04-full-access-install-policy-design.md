# Full-Access Installation Policy Design

## Goal

Make `full-access` a consistent autonomous execution mode. When Agent Seed
resolves this mode, in-scope installs, external network access, and writes to
personal or global directories do not require separate owner approval.
Applicable missing Superpowers and OpenCLI integrations must be installed and
verified before onboarding continues.

## Scope

The policy applies to Agent Seed activation and onboarding actions described by
`external-packages.json`, `bundled-skills.json`, and `bundled-packages.json`.
It does not make every manifest entry universally applicable. Existing platform,
project-evidence, and trigger checks still decide whether an entry applies.

The following actions become autonomous in `full-access`:

- project-local knowledge asset and generated guidance writes;
- installation of applicable default or recommended integrations;
- network access required by those installs and their verification;
- writes to personal or global directories required by those installs.

The following actions continue to require explicit approval in every mode:

- hook creation or modification;
- access to or storage of secrets;
- production actions;
- destructive actions.

`ask-each-change` and `agent-approve` retain their existing behavior.

## Central Permission Resolution

Agent Seed resolves `knowledge_asset_write_mode` before the Activation Preflight.
The current user request still takes precedence over shared
`.agents/agent-seed.json`, which still takes precedence over the `full-access`
default.

The resolved mode controls both knowledge-asset writes and installation
authorization:

- In `full-access`, applicable default or recommended installs run without an
  approval prompt.
- In `agent-approve` and `ask-each-change`, installs, network access, and
  personal or global writes continue to require approval.

This is a central mode rule rather than a Superpowers or OpenCLI exception, so
manifest entries and instructions cannot drift into conflicting meanings of
`full-access`.

## Activation Preflight

The preflight continues to inspect all three manifests and determine the active
platform before taking installation action. It then evaluates each applicable
entry using the resolved mode.

In `full-access`:

1. Detect whether each applicable default or recommended integration is already
   installed and passes its configured verification.
2. Install missing integrations with the configured platform-native action.
3. Permit the install's required network and personal or global writes without a
   separate prompt.
4. Run the configured verification.
5. Continue onboarding only after every required preflight integration is
   installed or verified as already available.

This includes conditionally applicable tools only when their existing trigger is
satisfied. It does not install unrelated platform tools merely because the mode
is `full-access`.

Superpowers and OpenCLI are required preflight integrations on every supported
platform where they apply. A missing Superpowers or OpenCLI installation cannot
be declined or deferred in `full-access`. Existing recurring-prompt behavior
continues in the two approval-gated modes.

Other applicable items marked as default recommendations or default installs,
including `git-code-tracker`, follow the same autonomous installation rule. This
keeps the mode consistent across external plugins, bundled direct skills, and
bundled packages.

## Platform Constraints

Agent Seed uses only install actions declared for the detected platform. If a
platform requires an interactive marketplace or another manual action that the
agent cannot complete, the preflight stops and reports the exact required action.
The owner completes that action manually, after which activation can rerun the
configured verification.

OpenCLI's CLI and agent skills are part of the required installation. The
OpenCLI Browser Bridge remains a workflow-specific manual prerequisite because
browser-extension installation cannot be reliably automated. Its absence does
not block general Agent Seed onboarding; it is reported only when a later
browser-backed workflow requires it.

## Failure Handling

An install or verification failure in `full-access` blocks onboarding. Agent Seed
reports:

- the integration and detected platform;
- the attempted install or verification action;
- the observed failure without exposing secrets;
- the concrete remediation or manual step;
- that onboarding has not continued.

Agent Seed must not reinterpret a failed required installation as a decline or
record a decline reason. A later activation retries detection and installation.
It must not bypass hook, secret, production, or destructive-action approval to
recover from an installation failure.

## Configuration And Documentation

The manifests will express the mode-aware activation policy without duplicating
it across every platform entry. Agent Seed instructions, platform default
prompts, README guidance, and relevant reference files will define the expanded
`full-access` semantics consistently.

Any existing statement that installs, network access, or personal/global writes
always require approval will be narrowed to the two approval-gated modes. Hook,
secret, production, and destructive-action safeguards remain explicit.

## Verification

Regression tests will cover:

- manifest policy fields that make applicable default installs autonomous in
  `full-access`;
- Superpowers and OpenCLI as required preflight integrations in `full-access`;
- automatic installation and verification guidance across supported platforms;
- blocking behavior after install or verification failure;
- unchanged approval behavior in `ask-each-change` and `agent-approve`;
- retained approval requirements for hooks, secrets, production actions, and
  destructive actions;
- consistent wording in Agent Seed instructions, platform prompts, README, and
  packaged release output.

A fresh-agent dry run will validate already-installed, successful automatic
install, failed install, interactive/manual platform install, conditionally
inapplicable tool, and OpenCLI Browser Bridge paths.
