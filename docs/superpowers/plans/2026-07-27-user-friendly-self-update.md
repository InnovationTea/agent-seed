# User-Friendly Self-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache routine update checks and notify Windows users when a queued self-update completes.

**Architecture:** Keep all policy and update state in the existing updater and `.agents/agent-seed.json`. Preserve explicit `--apply`; extend the detached Windows helper with an isolated, best-effort notifier.

**Tech Stack:** Node.js ESM, `node:test`, PowerShell/System.Windows.Forms on Windows.

---

### Task 1: Cached Update Checks

**Files:**
- Modify: `skill/scripts/update-agent-seed.mjs`
- Modify: `tools/update-agent-seed.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
assert.equal(updater.shouldCheckForUpdates({ last_check: { status: "current", checked_at: now }, check_interval_hours: 24 }, now), false);
assert.equal(updater.shouldCheckForUpdates({ last_check: { status: "available", checked_at: old }, check_interval_hours: 24 }, now), true);
```

- [ ] **Step 2: Run the focused updater tests and verify the new tests fail**

Run: `node --test tools/update-agent-seed.test.mjs`

Expected: FAIL because `shouldCheckForUpdates` is not exported.

- [ ] **Step 3: Implement cache policy and state recording**

```js
export function shouldCheckForUpdates(selfUpdate, now = new Date()) {
  const checkedAt = Date.parse(selfUpdate?.last_check?.checked_at || "");
  const intervalHours = normalizeCheckIntervalHours(selfUpdate?.check_interval_hours);
  return !SUCCESSFUL_CHECK_STATUSES.has(selfUpdate?.last_check?.status)
    || !Number.isFinite(checkedAt)
    || now.getTime() - checkedAt >= intervalHours * 60 * 60 * 1_000;
}
```

Use this policy before fetching GitHub, add `--force-check`, and write `current`
or `available` state after a fresh check.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `node --test tools/update-agent-seed.test.mjs`

Expected: PASS.

### Task 2: Windows Completion Notification

**Files:**
- Modify: `skill/scripts/update-agent-seed.mjs`
- Modify: `tools/update-agent-seed.test.mjs`

- [ ] **Step 1: Write failing tests for notification dispatch and failure isolation**

```js
const result = updater.notifyWindowsUpdateCompleted({ platform: "win32", runner });
assert.equal(calls[0].command, "powershell.exe");
assert.equal(updater.notifyWindowsUpdateCompleted({ platform: "linux", runner }), false);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tools/update-agent-seed.test.mjs`

Expected: FAIL because `notifyWindowsUpdateCompleted` is not exported.

- [ ] **Step 3: Implement a detached PowerShell balloon notification**

```js
export function notifyWindowsUpdateCompleted({ platform = process.platform, runner = spawn, version } = {}) {
  if (platform !== "win32") return false;
  try { runner("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", notificationScript(version)], { detached: true, stdio: "ignore", windowsHide: true }).unref(); return true; }
  catch { return false; }
}
```

Invoke it only after `runDeferredUpdate` has verified the installed version and
recorded `updated`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `node --test tools/update-agent-seed.test.mjs`

Expected: PASS.

### Task 3: Document The Revised Activation Contract

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `README.md`
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Add source-level contract tests for cached checks and explicit apply**

```js
assert.match(skill, /check_interval_hours/);
assert.match(skill, /--force-check/);
assert.match(skill, /Never run `--apply` without owner approval/);
```

- [ ] **Step 2: Update the activation instructions and public README**

State the 24-hour default, manual force check, `notify` default, and Windows
completion notification. Keep the explicit `--apply` approval boundary.

- [ ] **Step 3: Run the full suite**

Run: `node --test tools/release.test.mjs tools/update-agent-seed.test.mjs tools/git-code-tracker-release.test.mjs`

Expected: all tests pass.
