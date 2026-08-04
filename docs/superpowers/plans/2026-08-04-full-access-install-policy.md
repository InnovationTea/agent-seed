# Full-Access Installation Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent Seed install and verify every applicable default integration without separate install, network, global-write, or declared-side-effect approval in `full-access`, while preserving approval gates in the other modes.

**Architecture:** Encode one mode-aware activation contract at the top of each install manifest, with item-level approval metadata expressed by mode instead of unconditional booleans. Resolve `knowledge_asset_write_mode` before Activation Preflight, then let the manifest contract drive detection, installation, verification, blocking failures, and declared side effects across external plugins, bundled direct skills, and bundled packages.

**Tech Stack:** JSON manifests, Markdown/YAML agent instructions, Node.js `node:test`, PowerShell release packaging, GNU Make.

---

## File Map

- `skill/external-packages.json`: mode-aware external-plugin policy, required Superpowers/OpenCLI list, and neutral platform install actions.
- `skill/bundled-skills.json`: mode-aware default direct-skill install and post-install authorization metadata.
- `skill/bundled-packages.json`: mode-aware default package install policy, including authorization of declared `.git/hooks` writes.
- `skill/SKILL.md`: authoritative Activation Preflight decision flow and safety boundary.
- `skill/agents/openai.yaml`: compact Codex activation prompt that selects behavior from the resolved mode.
- `README.md`: user-facing definition of all three modes and conditional `git-code-tracker` approval wording.
- `skill/references/output-assets.md`: generated-guidance rules for external plugins, direct skills, and bundled packages.
- `skill/references/update-existing-assets.md`: update workflow interpretation of the three modes.
- `skill/references/knowledge-distillation.md`: mode-aware tooling inventory and onboarding interview guidance.
- `skill/references/fresh-agent-dry-run.md`: dry-run checks for autonomous and approval-gated install paths.
- `tools/release.test.mjs`: JSON-contract, instruction, documentation, safety-boundary, and release regression coverage.

### Task 1: Define The Mode-Aware Manifest Contract

**Files:**
- Modify: `tools/release.test.mjs:210`
- Modify: `tools/release.test.mjs:321`
- Modify: `tools/release.test.mjs:362`
- Modify: `tools/release.test.mjs:419`
- Modify: `tools/release.test.mjs:466`
- Modify: `tools/release.test.mjs:804`
- Modify: `tools/release.test.mjs:832`
- Modify: `skill/external-packages.json:2`
- Modify: `skill/bundled-skills.json:2`
- Modify: `skill/bundled-packages.json:2`

- [ ] **Step 1: Add shared manifest-policy assertions to the release tests**

Add this helper above `test("external packages config uses the generalized file name", ...)`:

```js
function assertModeAwareInstallPolicy(activationPolicy, { requiredIntegrations, appliesToDefaultInstalls } = {}) {
  assert.deepEqual(activationPolicy.mode_policy.approval_gated_modes, ["ask-each-change", "agent-approve"]);
  assert.deepEqual(activationPolicy.mode_policy.full_access, {
    default_install_action: "must_install_and_verify_before_onboarding",
    requires_user_approval: false,
    allow_network: true,
    allow_personal_or_global_writes: true,
    authorize_declared_install_side_effects: true,
    failure_action: "block_onboarding",
    ...(requiredIntegrations ? { required_integrations: requiredIntegrations } : {}),
    ...(appliesToDefaultInstalls ? { applies_to_default_installs: true } : {}),
  });
  assert.deepEqual(activationPolicy.skip_reason_required_in_modes, ["ask-each-change", "agent-approve"]);
  assert.equal(activationPolicy.requires_user_approval, undefined);
  assert.equal(activationPolicy.skip_reason_required, undefined);
}

function assertModeAwareItemApproval(item) {
  assert.deepEqual(item.requires_user_approval_in_modes, ["ask-each-change", "agent-approve"]);
  assert.equal(item.requires_user_approval, undefined);
}
```

In `external packages config includes install metadata`, replace the unconditional approval assertions with:

```js
  assert.equal(config.activation_policy.on_agent_seed_start, "must_check");
  assert.equal(config.activation_policy.approval_gated_missing_action, "must_offer_before_onboarding");
  assertModeAwareInstallPolicy(config.activation_policy, {
    requiredIntegrations: ["superpowers", "opencli"],
  });
  assert.deepEqual(config.activation_policy.recurring_install_prompt, {
    applies_to: ["opencli"],
    modes: ["ask-each-change", "agent-approve"],
    missing_action: "must_ask_every_activation_before_onboarding",
    declined_action: "record_reason_and_continue",
    previous_decline_suppresses_prompt: false,
  });
```

Inside the external-plugin loop, replace the old approval and safety assertions with:

```js
    assertModeAwareItemApproval(plugin.default_recommendation);
    assert.deepEqual(plugin.default_recommendation.safety_level_by_mode, {
      "ask-each-change": "ask-first",
      "agent-approve": "ask-first",
      "full-access": "autonomous",
    });
```

In `bundled install manifests require activation preflight handling`, use:

```js
  for (const config of [bundledSkills, bundledPackages]) {
    assert.equal(config.activation_policy.on_agent_seed_start, "must_check");
    assert.equal(config.activation_policy.approval_gated_default_install_action, "must_offer_before_onboarding");
    assertModeAwareInstallPolicy(config.activation_policy, { appliesToDefaultInstalls: true });
  }

  assert.deepEqual(bundledPackages.activation_policy.recurring_install_prompt, {
    applies_to: ["git-code-tracker"],
    modes: ["ask-each-change", "agent-approve"],
    missing_action: "must_ask_every_activation_before_onboarding",
    declined_action: "record_reason_and_continue",
    previous_decline_suppresses_prompt: false,
  });

  for (const entry of bundledSkills.bundled_skills) {
    assertModeAwareItemApproval(entry.default_install);
    if (entry.post_install) {
      assertModeAwareItemApproval(entry.post_install);
    }
  }

  for (const entry of bundledPackages.bundled_packages) {
    assertModeAwareItemApproval(entry.default_install);
  }
```

Also change each focused direct-skill test from `assert.equal(...requires_user_approval, true)` to:

```js
  assertModeAwareItemApproval(entry.default_install);
```

Use the local variable already present in each test (`ticketLookup`, `updater`, or the corresponding entry) in place of `entry`. For `updater.post_install`, assert:

```js
  assert.deepEqual(updater.post_install, {
    action: "ensure-agent-seed-updater-startup-rule",
    requires_user_approval_in_modes: ["ask-each-change", "agent-approve"],
    instruction_files: ["AGENTS.md", "CLAUDE.md"],
  });
```

Update the OpenCLI and DevEco focused tests to call `assertModeAwareItemApproval(...)` and assert `safety_level_by_mode` instead of the removed unconditional fields.

- [ ] **Step 2: Run the manifest tests and verify they fail for the old schema**

Run:

```powershell
node --test --test-name-pattern="external packages config includes install metadata|bundled install manifests require activation preflight handling|ticket-lookup bundled skill|agent-seed-updater bundled skill|knowledge-updater bundled skill|external plugins include OpenCLI|external plugins include DevEco CLI" tools/release.test.mjs
```

Expected: FAIL because `mode_policy`, `approval_gated_missing_action`, `approval_gated_default_install_action`, and `requires_user_approval_in_modes` do not exist yet.

- [ ] **Step 3: Replace unconditional root policy fields in all three manifests**

Use this structure in `skill/external-packages.json`:

```json
"activation_policy": {
  "on_agent_seed_start": "must_check",
  "approval_gated_missing_action": "must_offer_before_onboarding",
  "skip_reason_required_in_modes": [
    "ask-each-change",
    "agent-approve"
  ],
  "mode_policy": {
    "approval_gated_modes": [
      "ask-each-change",
      "agent-approve"
    ],
    "full_access": {
      "default_install_action": "must_install_and_verify_before_onboarding",
      "requires_user_approval": false,
      "allow_network": true,
      "allow_personal_or_global_writes": true,
      "authorize_declared_install_side_effects": true,
      "failure_action": "block_onboarding",
      "required_integrations": [
        "superpowers",
        "opencli"
      ]
    }
  },
  "update_policy": {
    "ownership": "platform-native",
    "version_check": "best-effort",
    "update_requires_user_approval": true
  },
  "recurring_install_prompt": {
    "applies_to": [
      "opencli"
    ],
    "modes": [
      "ask-each-change",
      "agent-approve"
    ],
    "missing_action": "must_ask_every_activation_before_onboarding",
    "declined_action": "record_reason_and_continue",
    "previous_decline_suppresses_prompt": false
  }
}
```

Use the same `skip_reason_required_in_modes` and `mode_policy` structure in both bundled manifests, but replace `required_integrations` with:

```json
"applies_to_default_installs": true
```

Keep the existing recurring prompt only in `bundled-packages.json`, adding its `modes` array. Rename each bundled manifest's `default_install_action` to `approval_gated_default_install_action`.

- [ ] **Step 4: Make item-level approval metadata mode-aware**

In every `default_recommendation`, `default_install`, and `post_install` object that currently contains `"requires_user_approval": true`, replace it with:

```json
"requires_user_approval_in_modes": [
  "ask-each-change",
  "agent-approve"
]
```

In every external `default_recommendation`, replace `"safety_level": "ask-first"` with:

```json
"safety_level_by_mode": {
  "ask-each-change": "ask-first",
  "agent-approve": "ask-first",
  "full-access": "autonomous"
}
```

Do not remove `existing_target_requires_user_decision`: replacing or merging an existing target remains a destructive ambiguity. Do not change `update_requires_user_approval`: managed updates are outside this installation-policy change.

- [ ] **Step 5: Make external install actions independent of approval mode**

Remove phrases such as `After user approval` and `only with separate approval` from `platforms[].install_action`. State only the action and applicability; the root mode policy decides authorization.

For OpenCLI, preserve this behavior in every platform entry:

```text
Run npm install -g @jackwener/opencli, then run npx skills add jackwener/opencli. For browser-backed work, separately tell the owner to manually install the OpenCLI Browser Bridge extension; do not install browser extensions automatically.
```

For DevEco CLI, distinguish the required CLI install from workflow-specific initialization:

```text
Run npm install -g @deveco/deveco-cli@latest. Run the platform-specific devecocli init command only when the selected workflow requires project or MCP initialization.
```

Preserve each platform's existing command arguments and `.cac` adaptation guidance.

- [ ] **Step 6: Run the focused manifest tests and verify they pass**

Run the command from Step 2 again.

Expected: all selected tests PASS; unrelated tests are reported as skipped by the name pattern.

- [ ] **Step 7: Commit the manifest contract**

```powershell
git add tools/release.test.mjs skill/external-packages.json skill/bundled-skills.json skill/bundled-packages.json
git commit -m "feat: make install manifests mode aware"
```

### Task 2: Enforce Full-Access Behavior In Agent Instructions

**Files:**
- Modify: `tools/release.test.mjs:860`
- Modify: `tools/release.test.mjs:882`
- Modify: `tools/release.test.mjs:903`
- Modify: `tools/release.test.mjs:973`
- Modify: `skill/SKILL.md:12`
- Modify: `skill/SKILL.md:214`
- Modify: `skill/SKILL.md:236`
- Modify: `skill/SKILL.md:257`
- Modify: `skill/agents/openai.yaml:4`

- [ ] **Step 1: Add failing behavioral instruction tests**

Add this test after `Agent Seed documents recurring prompts for required integrations`:

```js
test("Agent Seed resolves full-access before installing applicable defaults", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "SKILL.md"), "utf8");
  const prompt = await readFile(path.join(rootDir, "skill", "agents", "openai.yaml"), "utf8");

  assert.match(skill, /resolve `knowledge_asset_write_mode` before the Activation Preflight/i);
  assert.match(skill, /full-access.*install.*without.*approval/is);
  assert.match(skill, /network.*personal.*global.*without.*approval/is);
  assert.match(skill, /manifest-declared.*side effects.*hooks/is);
  assert.match(skill, /Superpowers.*OpenCLI.*required/is);
  assert.match(skill, /install.*verification.*failure.*block.*onboarding/is);
  assert.match(skill, /interactive.*manual.*stop.*onboarding/is);
  assert.match(skill, /standalone hook.*secrets.*production.*destructive/is);
  assert.match(skill, /ask-each-change.*agent-approve.*ask/is);

  assert.match(prompt, /resolve.*knowledge_asset_write_mode.*before.*preflight/i);
  assert.match(prompt, /full-access.*install.*verify.*without approval/i);
  assert.match(prompt, /Superpowers.*OpenCLI/i);
  assert.match(prompt, /failure.*block onboarding/i);
});
```

Update the recurring-prompt test so it asserts prompts apply to `ask-each-change` and `agent-approve`, while `full-access` requires install and verification. Rename `core skill instructions define Superpowers SDD as an ask-first external workflow` to `core skill instructions define mode-aware Superpowers SDD installation` and replace its generic `/approval/i` assertion with both approval-gated and autonomous full-access assertions.

- [ ] **Step 2: Run the instruction tests and verify they fail**

Run:

```powershell
node --test --test-name-pattern="Agent Seed documents recurring prompts|Agent Seed resolves full-access|Codex default prompt|cross-platform default package|mode-aware Superpowers" tools/release.test.mjs
```

Expected: FAIL because the current instructions always require install approval and do not resolve the mode before preflight.

- [ ] **Step 3: Rewrite the Activation Preflight around the resolved mode**

In `skill/SKILL.md`, require this order:

```text
1. Resolve knowledge_asset_write_mode from the current request, shared config, or full-access default.
2. Inspect all three manifests and determine the applicable platform and entries.
3. Detect and verify existing integrations.
4. In full-access, install and verify missing applicable defaults without approval; authorize required network, personal/global writes, and all manifest-declared side effects, including hooks.
5. In ask-each-change or agent-approve, retain the existing offer, recurring prompt, decline reason, and future re-prompt flow.
6. Block onboarding when a full-access install or verification fails. For an interactive marketplace or manual platform action, stop with the exact action and rerun verification after completion.
```

State explicitly that Superpowers and OpenCLI are required when applicable in `full-access`, while conditional entries such as DevEco CLI remain subject to their existing evidence triggers. State that installed and verified entries are never reinstalled.

- [ ] **Step 4: Apply the general side-effect rule without tool-specific exceptions**

In the Activation Preflight and Core Rules, add the general rule:

```text
In full-access, authorization of an applicable manifest install covers every side effect declared by that install, including project files, personal/global files, network access, and hooks. Standalone hook changes outside an authorized install, secrets, production actions, destructive actions, and unresolved replacement/merge conflicts still require owner approval.
```

Update direct-skill and bundled-package bullets to use the mode policy instead of always asking. Keep detected/requested platform gating. Keep existing-target replacement decisions because an undeclared overwrite is destructive, not a normal declared install side effect.

- [ ] **Step 5: Make the Superpowers workflow paragraph mode-aware**

Preserve all named SDD skills. Change the missing-plugin branch to say:

```text
When Superpowers is missing and applies to the selected platform, install and verify it as a required preflight integration in full-access. In ask-each-change or agent-approve, recommend it and proceed only after approval; if declined or unavailable, document the equivalent SDD stages without claiming the skills are installed.
```

- [ ] **Step 6: Update the Codex default prompt**

Replace the single-line prompt with a compact instruction that says to resolve the mode before preflight, auto-install and verify applicable defaults in `full-access`, require Superpowers/OpenCLI, block on failure, and retain approval prompts in the other two modes. Keep the request to inspect all three manifests before onboarding.

- [ ] **Step 7: Run the focused instruction tests and verify they pass**

Run the command from Step 2 again.

Expected: all selected tests PASS.

- [ ] **Step 8: Commit the executable guidance**

```powershell
git add tools/release.test.mjs skill/SKILL.md skill/agents/openai.yaml
git commit -m "feat: enforce full-access installs during preflight"
```

### Task 3: Align Public Guidance And Dry-Run Checks

**Files:**
- Modify: `tools/release.test.mjs:914`
- Modify: `README.md:67`
- Modify: `README.md:296`
- Modify: `skill/references/output-assets.md:93`
- Modify: `skill/references/output-assets.md:299`
- Modify: `skill/references/output-assets.md:329`
- Modify: `skill/references/output-assets.md:364`
- Modify: `skill/references/update-existing-assets.md:21`
- Modify: `skill/references/knowledge-distillation.md:115`
- Modify: `skill/references/knowledge-distillation.md:201`
- Modify: `skill/references/fresh-agent-dry-run.md:13`

- [ ] **Step 1: Add a failing cross-document consistency test**

Add this test after `knowledge asset write mode is persistent and documented across write workflows`:

```js
test("full-access install policy is consistent across public and internal guidance", async () => {
  const rootDir = process.cwd();
  const readme = await readFile(path.join(rootDir, "README.md"), "utf8");
  const outputAssets = await readFile(path.join(rootDir, "skill", "references", "output-assets.md"), "utf8");
  const updateExisting = await readFile(path.join(rootDir, "skill", "references", "update-existing-assets.md"), "utf8");
  const knowledgeDistillation = await readFile(path.join(rootDir, "skill", "references", "knowledge-distillation.md"), "utf8");
  const dryRun = await readFile(path.join(rootDir, "skill", "references", "fresh-agent-dry-run.md"), "utf8");

  for (const [name, content] of Object.entries({ readme, outputAssets, updateExisting })) {
    assert.match(content, /full-access.*install.*without.*approval/is, name);
    assert.match(content, /network.*personal.*global/is, name);
    assert.match(content, /declared.*side effects.*hooks/is, name);
    assert.match(content, /standalone hook.*secrets.*production.*destructive/is, name);
  }

  assert.match(knowledgeDistillation, /approval.*mode/i);
  assert.match(knowledgeDistillation, /full-access.*autonomous/is);
  assert.match(dryRun, /resolved.*mode/i);
  assert.match(dryRun, /full-access.*install.*verify/is);
  assert.match(dryRun, /failure.*block.*onboarding/is);
});
```

Do not name individual external plugins in these references; the existing `external plugin prose stays configuration driven` test requires generic documentation outside `skill/SKILL.md` and `external-packages.json`.

- [ ] **Step 2: Run the cross-document test and verify it fails**

Run:

```powershell
node --test --test-name-pattern="full-access install policy is consistent|knowledge asset write mode is persistent|external plugin prose stays configuration driven" tools/release.test.mjs
```

Expected: FAIL because the current README and references say installation always requires approval.

- [ ] **Step 3: Update README mode and bundled-package guidance**

Define the modes as follows:

```text
ask-each-change and agent-approve keep separate approval for installs, install network access, and personal/global writes. full-access performs applicable default installs and verification autonomously, including required network, personal/global writes, and every manifest-declared side effect such as hooks. Standalone hook changes, secrets, production actions, destructive actions, and unresolved replacement conflicts still require approval.
```

Change the `git-code-tracker` paragraph from an unconditional `Do not run the installer without explicit approval` rule to a mode-aware rule. Explain that `.git/hooks` is already declared in `default_install.writes`, so `full-access` authorizes it as part of the selected install; the two approval-gated modes must disclose and approve the same side effect before running.

- [ ] **Step 4: Update output and existing-asset references**

In both mode tables, use the exact same safety boundary as README. In external-plugin, direct-skill, and bundled-package sections:

```text
- Read approval behavior from activation_policy.mode_policy and the resolved mode.
- In full-access, execute applicable defaults and verification without a separate prompt.
- In the approval-gated modes, present the configured action and declared side effects before asking.
- Do not reinterpret network or personal/global writes as independent approvals when they are declared parts of a full-access install.
- Require approval for standalone hooks, secrets, production, destructive actions, and unresolved replacement/merge conflicts.
```

Remove unconditional instructions that prohibit automatic install whenever `requires_network` is true.

- [ ] **Step 5: Update knowledge-distillation inventory fields and onboarding questions**

Replace the single `Requires user approval` inventory field with:

```markdown
- Approval by mode:
- Declared install side effects:
- Failure action:
```

Tell agents to copy `requires_user_approval_in_modes`, `safety_level_by_mode`, and the root `mode_policy`. For default installs, ask only in `ask-each-change` and `agent-approve`; in `full-access`, install automatically after applicability is established.

- [ ] **Step 6: Expand the fresh-agent dry-run matrix**

Update the external-plugin, direct-skill, and bundled-package slices to require the resolved mode. Add checks for:

```text
- already installed and verified;
- successful autonomous full-access install;
- full-access install or verification failure that blocks onboarding;
- interactive/manual install action that blocks until verification passes;
- approval, decline reason, and future re-prompt in ask-each-change and agent-approve;
- declared install side effects versus standalone privileged actions;
- conditionally inapplicable entries;
- workflow-specific browser-extension prerequisites.
```

Keep the dry run reasoning-only unless the current environment authorizes commands under its resolved mode.

- [ ] **Step 7: Run the focused documentation tests and verify they pass**

Run the command from Step 2 again.

Expected: all selected tests PASS, including the configuration-driven external-plugin prose guard.

- [ ] **Step 8: Commit the synchronized guidance**

```powershell
git add tools/release.test.mjs README.md skill/references/output-assets.md skill/references/update-existing-assets.md skill/references/knowledge-distillation.md skill/references/fresh-agent-dry-run.md
git commit -m "docs: define autonomous full-access installs"
```

### Task 4: Verify Source And Packaged Release Behavior

**Files:**
- Verify: `tools/release.test.mjs`
- Verify: `outputs/agent-seed/external-packages.json`
- Verify: `outputs/agent-seed/bundled-skills.json`
- Verify: `outputs/agent-seed/bundled-packages.json`
- Verify: `outputs/agent-seed/SKILL.md`
- Verify: `outputs/agent-seed/agents/openai.yaml`

- [ ] **Step 1: Run whitespace and JSON parsing checks**

```powershell
git diff --check
Get-Content -Raw skill/external-packages.json | ConvertFrom-Json | Out-Null
Get-Content -Raw skill/bundled-skills.json | ConvertFrom-Json | Out-Null
Get-Content -Raw skill/bundled-packages.json | ConvertFrom-Json | Out-Null
```

Expected: no output from `git diff --check`; every `ConvertFrom-Json` command exits successfully.

- [ ] **Step 2: Run the complete test suite**

```powershell
make check
```

Expected: all tests in `release.test.mjs`, `update-agent-seed.test.mjs`, `git-code-tracker-release.test.mjs`, `managed-skill-updates.test.mjs`, `agent-seed-updater.test.mjs`, and `agent-seed-config.test.mjs` PASS.

- [ ] **Step 3: Build a disposable release package**

```powershell
make release VERSION=v0.0.0-full-access-policy-test
```

Expected: tests pass again, then `outputs/agent-seed/`, `outputs/agent-seed.zip`, and `outputs/agent-seed-release.json` are regenerated successfully.

- [ ] **Step 4: Verify the packaged mode policy and instructions**

```powershell
$external = Get-Content -Raw outputs/agent-seed/external-packages.json | ConvertFrom-Json
$skills = Get-Content -Raw outputs/agent-seed/bundled-skills.json | ConvertFrom-Json
$packages = Get-Content -Raw outputs/agent-seed/bundled-packages.json | ConvertFrom-Json
$external.activation_policy.mode_policy.full_access
$skills.activation_policy.mode_policy.full_access
$packages.activation_policy.mode_policy.full_access
Select-String -Path outputs/agent-seed/SKILL.md -Pattern 'full-access', 'manifest-declared', 'block onboarding'
Select-String -Path outputs/agent-seed/agents/openai.yaml -Pattern 'full-access', 'Superpowers', 'OpenCLI'
```

Expected: all three policy objects show `requires_user_approval: false`, autonomous network/global-write/declared-side-effect authorization, and `failure_action: block_onboarding`. The external policy lists Superpowers and OpenCLI as required integrations. Packaged instructions contain the full-access and blocking rules.

- [ ] **Step 5: Review the final diff and repository state**

```powershell
git diff HEAD~3 --stat
git diff HEAD~3 -- README.md skill tools/release.test.mjs
git status --short
```

Expected: the diff contains only the approved policy, instructions, documentation, and tests. Generated `outputs/` remain ignored, and `git status --short` is empty after the three implementation commits.
