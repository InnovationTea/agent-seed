# Agent Seed Default Update Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/agent-seed` run a read-only remote version check on every normal activation.

**Architecture:** Preserve the existing updater and local-state schema. Make the activation policy explicit in `skill/SKILL.md` and `README.md`, then add source-level contract tests in the existing Node test suite.

**Tech Stack:** Markdown, Node.js ESM, `node:test`.

---

### Task 1: Add the regression contract

**Files:**
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Write a failing test for the default check policy**

```js
assert.match(skill, /must run `node scripts\/update-agent-seed\.mjs --json`/i);
assert.match(skill, /must not use `self_update\.last_check`.*skip/i);
assert.match(skill, /explicitly asks to skip.*check_on_start.*false/is);
```

- [ ] **Step 2: Run the focused test file and confirm the policy assertions fail**

Run: `node --test tools/release.test.mjs`

Expected: FAIL because the current instructions say to decide whether to offer a check.

- [ ] **Step 3: Keep the separate apply-approval contract in the test**

```js
assert.match(skill, /Never run `--apply` without owner approval/);
```

- [ ] **Step 4: Re-run the focused test after implementation**

Run: `node --test tools/release.test.mjs`

Expected: PASS.

### Task 2: Make the activation policy unambiguous

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `README.md`

- [ ] **Step 1: Replace the optional-check wording with the ordered mandatory preflight**

```markdown
On every activation, read `VERSION.json`, read `.agents/agent-seed.json`, then run `node scripts/update-agent-seed.mjs --json` before onboarding conclusions.
```

- [ ] **Step 2: Document the exact skip conditions and state semantics**

```markdown
Only an explicit per-turn skip request or `self_update.check_on_start: false` may skip the check. `self_update.last_check` is historical and must not suppress a new check.
```

- [ ] **Step 3: Preserve separate authorization for mutation**

```markdown
`/agent-seed` authorizes the read-only check; `--apply` still requires explicit owner approval.
```

- [ ] **Step 4: Run the focused and release test suites**

Run: `node --test tools/update-agent-seed.test.mjs tools/release.test.mjs`

Expected: PASS.
