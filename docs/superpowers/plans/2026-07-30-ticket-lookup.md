# Ticket Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distribute a `ticket-lookup` skill that reads a configured requirements-management URL and uses the configured browser-automation integration for read-only SR/AR ticket retrieval.

**Architecture:** Deliver a platform-neutral direct skill with a Codex discovery overlay, then register it in the existing bundled-skill manifest. The manifest declares the external integration through `external-packages.json`; the bundled Markdown stays configuration driven. The skill owns request matching, URL-resolution precedence, prerequisite messaging, and the no-write safety boundary. Release tests enforce this delivery contract without accessing a real requirements system.

**Tech Stack:** Markdown skills, JSON manifests, YAML Codex metadata, Node.js built-in `node:test`.

---

## File Structure

- Create: `skill/bundled-skills/ticket-lookup/skill/SKILL.md` - portable lookup workflow and configuration contract.
- Create: `skill/bundled-skills/ticket-lookup/overlays/codex/agents/openai.yaml` - Codex trigger metadata.
- Modify: `skill/bundled-skills.json` - direct-skill registration for four supported platforms.
- Modify: `tools/release.test.mjs` - delivered-skill contract test.

### Task 1: Add a failing ticket-lookup package contract

**Files:**
- Modify: `tools/release.test.mjs:after test("bundled direct skill manifest registers every bundled skill directory", ...)`

- [ ] **Step 1: Write the failing test**

```js
test("ticket-lookup bundled skill defines configurable read-only SR and AR retrieval", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));
  const ticketLookup = config.bundled_skills.find((skill) => skill.name === "ticket-lookup");

  assert.ok(ticketLookup, "expected ticket-lookup bundled skill");
  assert.equal(ticketLookup.kind, "multi-platform-direct-skill");
  assert.equal(ticketLookup.source_path, "bundled-skills/ticket-lookup/skill");
  assert.equal(ticketLookup.default_install.mode, "project-local");
  assert.equal(ticketLookup.default_install.offer_by_default, true);
  assert.equal(ticketLookup.default_install.requires_user_approval, true);
  assert.equal(ticketLookup.default_install.install_only_for_detected_or_requested_platforms, true);
  assert.deepEqual(ticketLookup.platforms.map((platform) => platform.platform).sort(), ["claude", "codeagent-cli", "codex", "opencode"]);
  assert.equal(ticketLookup.platforms.find((platform) => platform.platform === "codex").overlay_path, "bundled-skills/ticket-lookup/overlays/codex");
  assert.deepEqual(ticketLookup.external_dependency, {
    registry_path: "external-packages.json",
    plugin: "opencli",
  });

  const skill = await readFile(path.join(rootDir, "skill", ticketLookup.source_path, "SKILL.md"), "utf8");
  assert.match(skill, /SR/i);
  assert.match(skill, /AR/i);
  assert.match(skill, /\.agents\/ticket-lookup\.local\.json/);
  assert.match(skill, /\.agents\/ticket-lookup\.json/);
  assert.match(skill, /requirement_management_url/);
  assert.match(skill, /configured browser-automation skill/i);
  assert.match(skill, /read-only/i);
  assert.match(skill, /\.gitignore/);

  const codexPrompt = await readFile(path.join(rootDir, "skill", "bundled-skills", "ticket-lookup", "overlays", "codex", "agents", "openai.yaml"), "utf8");
  assert.match(codexPrompt, /ticket-lookup/i);
  assert.match(codexPrompt, /SR/i);
  assert.match(codexPrompt, /AR/i);
  assert.doesNotMatch(codexPrompt, /OpenCLI/i);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test --test-name-pattern="ticket-lookup bundled skill" tools/release.test.mjs`

Expected: FAIL with `expected ticket-lookup bundled skill` because the manifest entry and source directory do not yet exist.

- [ ] **Step 3: Commit the test**

Run: `git add tools/release.test.mjs` then `git commit -m "test: define ticket lookup bundle contract"`.

Expected: the commit contains only the failing test.

### Task 2: Deliver the platform-neutral skill and Codex overlay

**Files:**
- Create: `skill/bundled-skills/ticket-lookup/skill/SKILL.md`
- Create: `skill/bundled-skills/ticket-lookup/overlays/codex/agents/openai.yaml`

- [ ] **Step 1: Create `SKILL.md`**

```markdown
---
name: ticket-lookup
description: Use when a user asks to view, query, retrieve, or summarize an SR or AR ticket by its identifier from the configured requirements-management site.
---

# Ticket Lookup

Retrieve ticket content through the configured requirements-management site. This workflow is read-only.

## Trigger

Use this skill when the user asks to view, query, retrieve, inspect, or summarize one or more SR or AR ticket identifiers, such as `SR123456` or `AR12345`.

Match identifiers case-insensitively, normalize them to uppercase, and de-duplicate them while preserving the user's order. Do not invoke this skill for unrelated text that merely contains `SR` or `AR`.

## Configuration

Resolve the requirements-management URL from the project root in this order:

1. `.agents/ticket-lookup.local.json`
2. `.agents/ticket-lookup.json`

Each file has this schema:

```json
{
  "requirement_management_url": "https://requirements.example.internal"
}
```

The shared `.agents/ticket-lookup.json` is team configuration and may be committed. `.agents/ticket-lookup.local.json` is an optional machine-specific override. Before creating the local override, ask for approval to add `.agents/ticket-lookup.local.json` to the target project's `.gitignore`.

The local file replaces the shared file's `requirement_management_url`. Never hard-code a requirements-management URL in this skill. Do not store credentials, cookies, tokens, browser-profile paths, or personal account information in either configuration file.

Stop and report the required file and field when neither configuration file provides an absolute `http://` or `https://` `requirement_management_url`.

## Lookup Workflow

1. Identify the requested SR and AR ticket identifiers.
2. Resolve the configured URL before opening a browser.
3. Confirm that the configured browser-automation skill is available. When it is missing, explain that browser retrieval depends on the configured external integration and request approval to follow its installation flow. Do not mark the ticket as read.
4. Use the configured browser-automation skill to open the configured URL. Reuse an authenticated browser session when available; do not attempt to install a browser extension, configure a browser, or sign in on the user's behalf.
5. Search the visible site UI for each requested identifier and extract the content relevant to the user's question.
6. Report found, not-found, inaccessible, and browser/session failures separately for each ticket.

## Safety

Only perform read-only browser actions. Do not create, edit, comment on, transition, submit, delete, or otherwise modify ticket data. Ask for separate task-specific confirmation before any external-state-changing browser action.
```

- [ ] **Step 2: Create the Codex overlay**

```yaml
interface:
  display_name: "Ticket Lookup"
  short_description: "Retrieve configured SR and AR ticket content through browser automation."
  default_prompt: "Use $ticket-lookup to view SR or AR ticket content from the configured requirements-management site."
```

- [ ] **Step 3: Verify the test remains red for the intended reason**

Run: `node --test --test-name-pattern="ticket-lookup bundled skill" tools/release.test.mjs`

Expected: FAIL with `expected ticket-lookup bundled skill`; the source files exist but are not registered yet.

- [ ] **Step 4: Commit the skill files**

Run: `git add skill/bundled-skills/ticket-lookup/skill/SKILL.md skill/bundled-skills/ticket-lookup/overlays/codex/agents/openai.yaml` then `git commit -m "feat: add ticket lookup bundled skill"`.

Expected: the commit contains the portable workflow and Codex overlay only.

### Task 3: Register project-local installation

**Files:**
- Modify: `skill/bundled-skills.json:append to bundled_skills`

- [ ] **Step 1: Append the complete manifest entry**

```json
{
  "name": "ticket-lookup",
  "version": "$AGENT_SEED_VERSION",
  "kind": "multi-platform-direct-skill",
  "source_path": "bundled-skills/ticket-lookup/skill",
  "purpose": "Retrieve SR and AR ticket content from a project-configured requirements-management site through OpenCLI.",
  "default_install": {
    "mode": "project-local",
    "offer_by_default": true,
    "requires_user_approval": true,
    "install_only_for_detected_or_requested_platforms": true
  },
  "external_dependency": {
    "registry_path": "external-packages.json",
    "plugin": "opencli"
  },
  "platforms": [
    { "platform": "codex", "target_path": "skills/ticket-lookup", "overlay_path": "bundled-skills/ticket-lookup/overlays/codex", "detection_paths": [".codex", "skills"], "verification": "SKILL.md exists at skills/ticket-lookup/SKILL.md" },
    { "platform": "claude", "target_path": ".claude/skills/ticket-lookup", "detection_paths": [".claude", "CLAUDE.md"], "verification": "SKILL.md exists at .claude/skills/ticket-lookup/SKILL.md" },
    { "platform": "codeagent-cli", "target_path": ".cac/skills/ticket-lookup", "detection_paths": [".cac"], "verification": "SKILL.md exists at .cac/skills/ticket-lookup/SKILL.md" },
    { "platform": "opencode", "target_path": ".opencode/skills/ticket-lookup", "detection_paths": [".opencode", "opencode.json", ".opencode.yaml"], "verification": "SKILL.md exists at .opencode/skills/ticket-lookup/SKILL.md" }
  ],
  "writes": ["skills/ticket-lookup", ".claude/skills/ticket-lookup", ".cac/skills/ticket-lookup", ".opencode/skills/ticket-lookup"],
  "safety": {
    "personal_directory_install_requires_explicit_request": true,
    "existing_target_requires_user_decision": true
  }
}
```

- [ ] **Step 2: Verify green**

Run: `node --test --test-name-pattern="ticket-lookup bundled skill" tools/release.test.mjs`

Expected: PASS for `ticket-lookup bundled skill defines configurable read-only SR and AR retrieval`.

- [ ] **Step 3: Run adjacent manifest regressions**

Run: `node --test --test-name-pattern="bundled direct skill|ticket-lookup bundled skill" tools/release.test.mjs`

Expected: every matching bundled-skill test passes, including Codex and codeagent-cli target checks.

- [ ] **Step 4: Commit the registration**

Run: `git add skill/bundled-skills.json` then `git commit -m "feat: register ticket lookup skill"`.

Expected: the commit contains the manifest entry only.

### Task 4: Verify the distributable artifacts

**Files:**
- Verify: `tools/release.test.mjs`
- Verify: `skill/bundled-skills.json`
- Verify: `skill/bundled-skills/ticket-lookup/skill/SKILL.md`
- Verify: `skill/bundled-skills/ticket-lookup/overlays/codex/agents/openai.yaml`

- [ ] **Step 1: Run the full test suite**

Run: `make check`

Expected: the Node suites in `tools/release.test.mjs`, `tools/update-agent-seed.test.mjs`, `tools/git-code-tracker-release.test.mjs`, and `tools/managed-skill-updates.test.mjs` finish with zero failures.

- [ ] **Step 2: Build a temporary release**

Run: `make release VERSION=v0.0.0-ticket-lookup-test`

Expected: exit code 0 and ignored release files including `outputs/bundled-skills/ticket-lookup.zip` and `outputs/bundled-skills/ticket-lookup-codex.zip`.

- [ ] **Step 3: Check release contents**

Run:

```bash
node -e "const { access } = require('node:fs/promises'); Promise.all(['outputs/bundled-skills/ticket-lookup/SKILL.md', 'outputs/bundled-skills/ticket-lookup-codex/SKILL.md', 'outputs/bundled-skills/ticket-lookup-codex/agents/openai.yaml'].map(access)).then(() => console.log('ticket-lookup release artifacts present'))"
```

Expected: `ticket-lookup release artifacts present`.

- [ ] **Step 4: Inspect final changes**

Run: `git diff --check HEAD~3..HEAD` and `git status --short`.

Expected: no whitespace errors and no non-ignored files left uncommitted.
