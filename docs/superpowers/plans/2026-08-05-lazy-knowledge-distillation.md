# Lazy Knowledge Distillation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared completion marker and explicit full-refresh behavior for Agent Seed onboarding.

**Architecture:** Extend the existing shared Agent Seed config helper with a small knowledge-distillation state API. Update the Agent Seed and README instructions to use that state for first-run activation while leaving `knowledge-updater` as the incremental maintenance path.

**Tech Stack:** Node.js ESM, `node:test`, Markdown skill guidance.

---

### Task 1: Add failing state tests

**Files:**
- Modify: `tools/agent-seed-config.test.mjs`
- Test: `tools/agent-seed-config.test.mjs`

- [x] Add tests for missing and invalid state being treated as `missing`, complete state skipping automatic onboarding when `AGENTS.md` exists, missing `AGENTS.md` forcing onboarding, and an explicit full-refresh forcing onboarding.
- [x] Add persistence tests for `in_progress`, `complete`, and `failed`, including completion timestamp validation and policy preservation.
- [x] Run `node --test tools/agent-seed-config.test.mjs` and verify the new tests fail because the state API is absent.

### Task 2: Implement the shared state API

**Files:**
- Modify: `skill/scripts/agent-seed-config.mjs`
- Test: `tools/agent-seed-config.test.mjs`

- [x] Add state normalization, start-decision, and shared-state writer helpers.
- [x] Preserve the existing split-config migration and effective-config behavior while retaining the new shared field.
- [x] Run the focused config tests and verify they pass.

### Task 3: Align skill guidance

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `skill/bundled-skills/knowledge-updater/skill/SKILL.md`
- Modify: `skill/references/output-assets.md`
- Modify: `README.md`
- Test: `tools/release.test.mjs`

- [x] Document first-run detection, completion timing, incomplete-state handling, and explicit full refresh.
- [x] State that `agents.d/` is optional at initialization and is created on demand by `knowledge-updater`.
- [x] Add release assertions for the new lifecycle wording without changing incremental updater boundaries.

### Task 4: Verify and review

**Files:**
- Test: `tools/agent-seed-config.test.mjs`, `tools/release.test.mjs`, and the repository check suite

- [x] Run the focused tests.
- [x] Run `make check`.
- [x] Review the diff for accidental changes to install policy, platform gating, or knowledge-updater scope.
