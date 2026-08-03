# Knowledge Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the platform-specific SessionEnd workflow with a lightweight project-local `knowledge-updater` skill that maintains `AGENTS.md` and `agents.d/` immediately before every final task response.

**Architecture:** Deliver `knowledge-updater` through the existing bundled direct-skill manifest and Codex overlay. Agent Seed remains responsible for approval-gated installation and for adding a concise recurring completion rule to generated `AGENTS.md`; the installed skill owns current-conversation filtering, knowledge classification, minimal writes, conflict handling, and the mandatory one-line status. Remove all executable SessionEnd machinery and retain only approval-gated legacy-hook migration guidance in Agent Seed.

**Tech Stack:** Markdown skills and references, JSON manifests, YAML Codex metadata, Node.js built-in `node:test`, existing release tooling.

---

## File Structure

- Create: `skill/bundled-skills/knowledge-updater/skill/SKILL.md` - portable recurring update workflow and safety boundary.
- Create: `skill/bundled-skills/knowledge-updater/overlays/codex/agents/openai.yaml` - Codex discovery metadata.
- Modify: `skill/bundled-skills.json` - four-platform project-local registration.
- Modify: `skill/SKILL.md` - install/completion-rule guidance, legacy-hook migration, and removal of SessionEnd behavior.
- Modify: `skill/references/output-assets.md` - exact `AGENTS.md` completion-rule template and installation behavior.
- Modify: `README.md` - public behavior, asset ownership, and migration documentation.
- Modify: `tools/release.test.mjs` - new skill, parent integration, migration, and removal contracts.
- Modify: `Makefile` - remove the obsolete SessionEnd test suite.
- Modify: `.gitignore` - stop treating `.agents/session-summaries/` as a supported generated path.
- Delete: `skill/scripts/session-end-knowledge-update.mjs` - obsolete lifecycle runner.
- Delete: `skill/references/session-end-hooks.md` - obsolete hook configuration.
- Delete: `tools/session-end-knowledge-update.test.mjs` - obsolete runner tests.

### Task 1: Define The Knowledge-Updater Delivery Contract

**Files:**
- Modify: `tools/release.test.mjs:after the ticket-lookup bundled skill contract`

- [ ] **Step 1: Add a failing bundled-skill contract**

Add this test:

```js
test("knowledge-updater bundled skill defines recurring bounded knowledge maintenance", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));
  const updater = config.bundled_skills.find((skill) => skill.name === "knowledge-updater");

  assert.ok(updater, "expected knowledge-updater bundled skill");
  assert.equal(updater.kind, "multi-platform-direct-skill");
  assert.equal(updater.source_path, "bundled-skills/knowledge-updater/skill");
  assert.equal(updater.default_install.mode, "project-local");
  assert.equal(updater.default_install.offer_by_default, true);
  assert.equal(updater.default_install.requires_user_approval, true);
  assert.equal(updater.default_install.install_only_for_detected_or_requested_platforms, true);
  assert.deepEqual(updater.platforms.map((platform) => platform.platform).sort(), ["claude", "codeagent-cli", "codex", "opencode"]);
  assert.equal(
    updater.platforms.find((platform) => platform.platform === "codex").overlay_path,
    "bundled-skills/knowledge-updater/overlays/codex",
  );

  const skill = await readFile(path.join(rootDir, "skill", updater.source_path, "SKILL.md"), "utf8");
  assert.match(skill, /after.*task.*before.*final response/is);
  assert.match(skill, /current conversation/i);
  assert.match(skill, /AGENTS\.md/);
  assert.match(skill, /agents\.d\//);
  assert.match(skill, /do not scan.*repository/is);
  assert.match(skill, /do not.*child agent/is);
  assert.match(skill, /smallest coherent edit/i);
  assert.match(skill, /conflict.*not updated/is);
  assert.match(skill, /Knowledge assets: no new reusable knowledge/);
  assert.match(skill, /Knowledge assets: updated/);

  const codexPrompt = await readFile(
    path.join(rootDir, "skill", "bundled-skills", "knowledge-updater", "overlays", "codex", "agents", "openai.yaml"),
    "utf8",
  );
  assert.match(codexPrompt, /knowledge-updater/i);
  assert.match(codexPrompt, /before.*final response/i);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test --test-name-pattern="knowledge-updater bundled skill" tools/release.test.mjs`

Expected: FAIL with `expected knowledge-updater bundled skill` because neither the manifest entry nor source directory exists.

- [ ] **Step 3: Commit the failing contract**

Run:

```bash
git add tools/release.test.mjs
git commit -m "test: define knowledge updater contract"
```

Expected: one commit containing only the failing release contract.

### Task 2: Deliver The Portable Skill And Codex Overlay

**Files:**
- Create: `skill/bundled-skills/knowledge-updater/skill/SKILL.md`
- Create: `skill/bundled-skills/knowledge-updater/overlays/codex/agents/openai.yaml`

- [ ] **Step 1: Create the portable skill**

Create `SKILL.md` with this complete workflow:

```markdown
---
name: knowledge-updater
description: Use after completing every project task and before the final response to preserve durable knowledge from the current conversation in AGENTS.md and agents.d/ and report the knowledge-asset status.
---

# Knowledge Updater

Maintain project knowledge assets as a lightweight completion step. Run after the main task and its verification are complete, immediately before the final response.

## Inputs

Use only facts, decisions, commands, results, and owner preferences established in the current conversation, plus the existing `AGENTS.md` and directly relevant files under `agents.d/`.

Do not scan or search the repository, Git history, session files, external directories, browser state, or the network. Do not invoke Agent Seed or start a child agent. Repository facts already established by the main task may be reused from current context without reopening their source files.

## Eligible Knowledge

Preserve knowledge only when it is durable, project-specific, reusable by a future agent, and supported as `Owner-confirmed`, `Observed during run`, `Repo-confirmed`, `Preference`, or `Risk judgment`.

Exclude secrets, personal data, private account identifiers, machine-specific paths, raw conversation text, one-off task details, temporary debugging attempts, generic advice, duplicate guidance, and unsupported inference. If current evidence is insufficient, make no change.

Convert accepted knowledge into future-facing instructions, commands with success signals, symptom-to-recovery playbooks, change recipes, or escalation rules.

## Classification

- Keep concise entry rules, cross-cutting constraints, and links in `AGENTS.md`.
- Put bootstrap knowledge in `agents.d/bootstrap.md`.
- Put approved tools, scripts, and skills in `agents.d/tooling.md`.
- Put run, build, test, and lint loops in `agents.d/development-loop.md`.
- Put boundaries, entry points, and data flow in `agents.d/architecture-map.md`.
- Put symptoms, diagnosis, and recovery in `agents.d/debug-playbook.md`.
- Put repeated changes and required checks in `agents.d/change-recipes.md`.
- Put review evidence and done criteria in `agents.d/review-handoff.md`.
- Put invariants, hazards, and escalation rules in `agents.d/risk-areas.md`.

Read only the relevant existing assets before editing. Preserve their headings, tone, source labels, and organization. Make the smallest coherent edit and avoid duplication. When a new `agents.d/` file is required, add a concise link to the existing `AGENTS.md` index.

## Write Boundary

The installed completion rule authorizes minimal edits to `AGENTS.md` and `agents.d/` without per-change confirmation. It does not authorize deleting knowledge, broad rewrites, conflict resolution, source or test edits, installs, hook or platform changes, network access, external integrations, or personal/global directory writes.

If candidate knowledge contradicts existing guidance, do not choose a winner and do not edit either rule. Report the conflict so the owner can resolve it later. Treat equivalent wording as a duplicate.

## Status

Return exactly one status for the main agent to append to its final response:

```text
Knowledge assets: updated (AGENTS.md, agents.d/debug-playbook.md)
Knowledge assets: no new reusable knowledge
Knowledge assets: not initialized
Knowledge assets: conflict, not updated (agents.d/development-loop.md)
Knowledge assets: update failed (<concise reason>)
```

Use `updated` only when files actually changed and name only those files. If `AGENTS.md` is absent, return `not initialized`; do not create onboarding assets or invoke Agent Seed. If `agents.d/` is absent, concise knowledge may update `AGENTS.md`, while detailed eligible knowledge may create one standard focused file and add its index link. A conflict or write failure must not invalidate the completed main task.

The final response may translate the status into the user's working language, but it must preserve the same outcome and file list.
```

- [ ] **Step 2: Create the Codex overlay**

Create `agents/openai.yaml`:

```yaml
interface:
  display_name: "Knowledge Updater"
  short_description: "Preserve reusable project knowledge after each task."
  default_prompt: "Use $knowledge-updater after completing the task and before the final response, then append its knowledge-asset status."
```

- [ ] **Step 3: Run the focused test and verify the intended remaining failure**

Run: `node --test --test-name-pattern="knowledge-updater bundled skill" tools/release.test.mjs`

Expected: FAIL with `expected knowledge-updater bundled skill` because the source now exists but is not registered.

- [ ] **Step 4: Commit the skill files**

Run:

```bash
git add skill/bundled-skills/knowledge-updater/skill/SKILL.md skill/bundled-skills/knowledge-updater/overlays/codex/agents/openai.yaml
git commit -m "feat: add knowledge updater skill"
```

Expected: one commit containing only the portable skill and Codex overlay.

### Task 3: Register Four-Platform Project-Local Installation

**Files:**
- Modify: `skill/bundled-skills.json:append to bundled_skills`

- [ ] **Step 1: Append the manifest entry**

Add this object to `bundled_skills`:

```json
{
  "name": "knowledge-updater",
  "version": "$AGENT_SEED_VERSION",
  "kind": "multi-platform-direct-skill",
  "source_path": "bundled-skills/knowledge-updater/skill",
  "purpose": "Maintain AGENTS.md and agents.d from durable knowledge established during the current task before the final response.",
  "default_install": {
    "mode": "project-local",
    "offer_by_default": true,
    "requires_user_approval": true,
    "install_only_for_detected_or_requested_platforms": true
  },
  "platforms": [
    {
      "platform": "codex",
      "target_path": "skills/knowledge-updater",
      "overlay_path": "bundled-skills/knowledge-updater/overlays/codex",
      "detection_paths": [".codex", "skills"],
      "verification": "SKILL.md exists at skills/knowledge-updater/SKILL.md"
    },
    {
      "platform": "claude",
      "target_path": ".claude/skills/knowledge-updater",
      "detection_paths": [".claude", "CLAUDE.md"],
      "verification": "SKILL.md exists at .claude/skills/knowledge-updater/SKILL.md"
    },
    {
      "platform": "codeagent-cli",
      "target_path": ".cac/skills/knowledge-updater",
      "detection_paths": [".cac"],
      "verification": "SKILL.md exists at .cac/skills/knowledge-updater/SKILL.md"
    },
    {
      "platform": "opencode",
      "target_path": ".opencode/skills/knowledge-updater",
      "detection_paths": [".opencode", "opencode.json", ".opencode.yaml"],
      "verification": "SKILL.md exists at .opencode/skills/knowledge-updater/SKILL.md"
    }
  ],
  "writes": [
    "skills/knowledge-updater",
    ".claude/skills/knowledge-updater",
    ".cac/skills/knowledge-updater",
    ".opencode/skills/knowledge-updater"
  ],
  "safety": {
    "personal_directory_install_requires_explicit_request": true,
    "existing_target_requires_user_decision": true
  }
}
```

- [ ] **Step 2: Run the focused contract and verify green**

Run: `node --test --test-name-pattern="knowledge-updater bundled skill" tools/release.test.mjs`

Expected: PASS for `knowledge-updater bundled skill defines recurring bounded knowledge maintenance`.

- [ ] **Step 3: Run adjacent bundled-skill contracts**

Run: `node --test --test-name-pattern="bundled direct skill|knowledge-updater bundled skill|codeagent-cli .cac targets" tools/release.test.mjs`

Expected: all matching tests pass, including directory registration and target-path invariants.

- [ ] **Step 4: Commit the manifest registration**

Run:

```bash
git add skill/bundled-skills.json
git commit -m "feat: register knowledge updater skill"
```

Expected: one commit containing only the manifest entry.

### Task 4: Integrate The Recurring Completion Rule Into Agent Seed

**Files:**
- Modify: `tools/release.test.mjs:replace the session-update integration contracts`
- Modify: `skill/SKILL.md:replace Knowledge-Only Session Updates and update installation guidance`
- Modify: `skill/references/output-assets.md:Asset Selection and Bundled Direct Skill Installation`

- [ ] **Step 1: Replace the old positive SessionEnd contracts with failing parent-integration contracts**

Replace the tests named `Agent Seed documents controlled knowledge-only session updates and project configuration boundaries` and `Agent Seed ships Claude-compatible session-end hook guidance` with:

```js
test("Agent Seed installs a knowledge-updater completion rule without lifecycle hooks", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "SKILL.md"), "utf8");
  const outputAssets = await readFile(path.join(rootDir, "skill", "references", "output-assets.md"), "utf8");

  for (const content of [skill, outputAssets]) {
    assert.match(content, /knowledge-updater/i);
    assert.match(content, /after.*task.*before.*final response/is);
    assert.match(content, /AGENTS\.md/);
    assert.match(content, /owner approval|user approval/i);
  }

  assert.match(outputAssets, /Knowledge assets: no new reusable knowledge/);
  assert.match(outputAssets, /Knowledge assets: updated/);
});

test("Agent Seed treats legacy SessionEnd hooks as approval-gated migration", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "SKILL.md"), "utf8");

  assert.match(skill, /legacy/i);
  assert.match(skill, /session-end-knowledge-update\.mjs/);
  assert.match(skill, /\.claude\/settings\.json/);
  assert.match(skill, /\.cac\/settings\.json/);
  assert.match(skill, /approval/i);
  assert.match(skill, /must not.*silently/is);
  assert.match(skill, /personal|global/i);
});
```

- [ ] **Step 2: Run the focused tests and verify red**

Run: `node --test --test-name-pattern="knowledge-updater completion rule|legacy SessionEnd hooks" tools/release.test.mjs`

Expected: FAIL because the parent skill and output reference still describe the old SessionEnd flow.

- [ ] **Step 3: Replace the parent SessionEnd section**

In `skill/SKILL.md`, replace `## Knowledge-Only Session Updates` with a `## Incremental Knowledge Updater` section that explicitly requires:

```markdown
## Incremental Knowledge Updater

Agent Seed performs initial repository scanning and owner interviews. Routine incremental maintenance belongs to the bundled `knowledge-updater` skill.

Offer its project-local installation for every detected, requested, or owner-confirmed platform according to `bundled-skills.json`. Installation and the corresponding `AGENTS.md` edit require owner approval. After an approved install, add a concise project rule requiring the main agent to invoke `knowledge-updater` after completing and verifying every task, immediately before its final response, and to append exactly one returned knowledge-asset status.

Do not run Agent Seed, scan the repository, interview the owner, start a child agent, or configure a lifecycle hook for routine updates.

During onboarding, inspect only project-local `.claude/settings.json` and `.cac/settings.json` files already in the target-root evidence set for legacy commands that reference `session-end-knowledge-update.mjs`. Report the exact project file and offer removal. Removal requires explicit approval; never silently edit hook settings and never inspect personal or global settings without separate authorization. Existing `.agents/session-summaries/` content is legacy local data and is left untouched.
```

Remove the progressive-disclosure link to `references/session-end-hooks.md`. Update the activation/install wording so an approved `knowledge-updater` install also requires the concise completion rule in `AGENTS.md`; do not change approval rules for unrelated bundled skills.

- [ ] **Step 4: Add the exact generated rule to `output-assets.md`**

Add this template under Asset Selection:

```markdown
After an approved project-local `knowledge-updater` install, add this concise portable completion rule to `AGENTS.md` and keep the detailed workflow in the skill:

> After completing and verifying every task, invoke the installed `knowledge-updater` skill immediately before the final response. Let it use only current-conversation knowledge plus existing `AGENTS.md` and relevant `agents.d/` files; do not let it scan the repository. Append exactly one status returned by the skill, such as `Knowledge assets: updated (...)` or `Knowledge assets: no new reusable knowledge`.

Do not add this rule before installation succeeds. Do not generate SessionEnd hooks.
```

In Bundled Direct Skill Installation, state that `knowledge-updater` is the one direct skill whose successful install also adds this approved recurring `AGENTS.md` rule.

- [ ] **Step 5: Run the focused tests and verify green**

Run: `node --test --test-name-pattern="knowledge-updater completion rule|legacy SessionEnd hooks" tools/release.test.mjs`

Expected: both matching tests pass.

- [ ] **Step 6: Commit the parent integration**

Run:

```bash
git add tools/release.test.mjs skill/SKILL.md skill/references/output-assets.md
git commit -m "feat: run knowledge updater before final responses"
```

Expected: one commit containing the parent integration contract and guidance.

### Task 5: Remove The SessionEnd Runtime And Enforce Its Absence

**Files:**
- Modify: `tools/release.test.mjs:add obsolete-runtime absence contract`
- Modify: `Makefile:check target`
- Modify: `.gitignore`
- Delete: `skill/scripts/session-end-knowledge-update.mjs`
- Delete: `skill/references/session-end-hooks.md`
- Delete: `tools/session-end-knowledge-update.test.mjs`

- [ ] **Step 1: Add a failing absence contract**

Add `access` to the existing `node:fs/promises` imports if it is not present, then add:

```js
test("release source no longer contains the SessionEnd implementation", async () => {
  const rootDir = process.cwd();
  const obsoletePaths = [
    path.join(rootDir, "skill", "scripts", "session-end-knowledge-update.mjs"),
    path.join(rootDir, "skill", "references", "session-end-hooks.md"),
  ];

  for (const obsoletePath of obsoletePaths) {
    await assert.rejects(access(obsoletePath), { code: "ENOENT" });
  }

  const makefile = await readFile(path.join(rootDir, "Makefile"), "utf8");
  const gitignore = await readFile(path.join(rootDir, ".gitignore"), "utf8");
  assert.doesNotMatch(makefile, /session-end-knowledge-update/);
  assert.doesNotMatch(gitignore, /session-summaries/);
});
```

- [ ] **Step 2: Run the absence contract and verify red**

Run: `node --test --test-name-pattern="no longer contains the SessionEnd implementation" tools/release.test.mjs`

Expected: FAIL because the obsolete script and hook reference still exist.

- [ ] **Step 3: Delete the obsolete runtime files and references**

Delete the three obsolete files. Remove `tools/session-end-knowledge-update.test.mjs` from the `Makefile` check command and remove `.agents/session-summaries/` from `.gitignore`.

- [ ] **Step 4: Run the absence and parent integration contracts**

Run: `node --test --test-name-pattern="no longer contains the SessionEnd implementation|knowledge-updater completion rule|legacy SessionEnd hooks" tools/release.test.mjs`

Expected: all matching tests pass. The legacy string remains only as migration detection guidance, not as a shipped command or script.

- [ ] **Step 5: Commit runtime removal**

Run:

```bash
git add tools/release.test.mjs Makefile .gitignore skill/scripts/session-end-knowledge-update.mjs skill/references/session-end-hooks.md tools/session-end-knowledge-update.test.mjs
git commit -m "refactor: remove session end knowledge runner"
```

Expected: one commit deleting the runtime and updating its checks.

### Task 6: Update Public Documentation And Migration Semantics

**Files:**
- Modify: `tools/release.test.mjs:add README contract`
- Modify: `README.md:Project Configuration And Knowledge Assets and release behavior`

- [ ] **Step 1: Add a failing public-documentation contract**

Add:

```js
test("README documents lightweight knowledge-updater behavior", async () => {
  const rootDir = process.cwd();
  const readme = await readFile(path.join(rootDir, "README.md"), "utf8");

  assert.match(readme, /knowledge-updater/i);
  assert.match(readme, /after.*task.*before.*final response/is);
  assert.match(readme, /AGENTS\.md/);
  assert.match(readme, /agents\.d\//);
  assert.match(readme, /current conversation/i);
  assert.match(readme, /no repository scan/i);
  assert.match(readme, /legacy.*SessionEnd/is);
  assert.match(readme, /approval/i);
  assert.doesNotMatch(readme, /session_end_knowledge_update/);
  assert.doesNotMatch(readme, /\.agents\/session-summaries/);
});
```

- [ ] **Step 2: Run the documentation contract and verify red**

Run: `node --test --test-name-pattern="README documents lightweight knowledge-updater" tools/release.test.mjs`

Expected: FAIL because the README still documents SessionEnd configuration and candidate summaries.

- [ ] **Step 3: Rewrite the public knowledge-maintenance section**

Update `README.md` to state:

```markdown
`knowledge-updater` is an approval-gated bundled direct skill for Codex, Claude Code, codeagent-cli, and OpenCode. After installation, Agent Seed adds a concise `AGENTS.md` rule requiring the main agent to invoke it after every completed and verified task, immediately before the final response.

The updater uses only durable facts established in the current conversation plus existing `AGENTS.md` and relevant `agents.d/` files. It performs no repository scan, owner interview, transcript read, network action, or child-agent launch. It updates knowledge assets directly with minimal edits and always reports `updated`, `no new reusable knowledge`, `not initialized`, `conflict`, or `update failed`.

Legacy project-local SessionEnd entries that reference `session-end-knowledge-update.mjs` are reported during Agent Seed onboarding and removed only after approval. Personal or global hook settings are outside the default inspection scope.
```

Remove `.agents/session-summaries/` from the configuration table and remove all instructions for `session_end_knowledge_update`, SessionEnd hook templates, transcript paths, and child sessions. Add `knowledge-updater` to the bundled-skill/public artifact discussion where appropriate.

- [ ] **Step 4: Run the documentation contract and verify green**

Run: `node --test --test-name-pattern="README documents lightweight knowledge-updater" tools/release.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit public documentation**

Run:

```bash
git add tools/release.test.mjs README.md
git commit -m "docs: document lightweight knowledge updates"
```

Expected: one commit containing README behavior and its contract.

### Task 7: Verify Tests And Release Artifacts

**Files:**
- Verify: `skill/bundled-skills/knowledge-updater/skill/SKILL.md`
- Verify: `skill/bundled-skills/knowledge-updater/overlays/codex/agents/openai.yaml`
- Verify: `skill/bundled-skills.json`
- Verify: `skill/SKILL.md`
- Verify: `skill/references/output-assets.md`
- Verify: `README.md`
- Verify: `tools/release.test.mjs`
- Verify: `Makefile`
- Verify: `.gitignore`

- [ ] **Step 1: Search active product sources for obsolete SessionEnd behavior**

Run:

```bash
rg -n "session_end_knowledge_update|AGENT_SEED_SESSION_END_CHILD|session-end-hooks\.md|session-summaries" skill README.md Makefile .gitignore
```

Expected: no matches. The literal `session-end-knowledge-update.mjs` may appear only in the legacy migration rule and absence tests.

- [ ] **Step 2: Run the full test suite**

Run: `make check`

Expected: every Node test completes with zero failures; the obsolete SessionEnd suite is no longer part of the command.

- [ ] **Step 3: Build a temporary release**

Run: `make release VERSION=v0.0.0-knowledge-updater-test`

Expected: exit code 0 and generated artifacts including `outputs/bundled-skills/knowledge-updater.zip` and `outputs/bundled-skills/knowledge-updater-codex.zip`.

- [ ] **Step 4: Verify delivered contents and obsolete-file absence**

Run:

```bash
node -e "const { access } = require('node:fs/promises'); const paths = ['outputs/bundled-skills/knowledge-updater/SKILL.md','outputs/bundled-skills/knowledge-updater-codex/SKILL.md','outputs/bundled-skills/knowledge-updater-codex/agents/openai.yaml']; Promise.all(paths.map(access)).then(async () => { for (const p of ['outputs/agent-seed/scripts/session-end-knowledge-update.mjs','outputs/agent-seed/references/session-end-hooks.md']) { try { await access(p); throw new Error('obsolete release file present: ' + p); } catch (error) { if (error.code !== 'ENOENT') throw error; } } console.log('knowledge-updater release artifacts verified'); })"
```

Expected: `knowledge-updater release artifacts verified`.

- [ ] **Step 5: Inspect final repository state**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline --decorate origin/main..HEAD
```

Expected: no whitespace errors; only the implementation-plan file remains uncommitted if it has not yet been committed; the branch history contains the approved design and focused implementation commits.
