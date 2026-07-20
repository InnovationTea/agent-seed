# Agent Seed Default Update Check Design

## Goal

Make every Agent Seed activation perform a read-only GitHub latest-release check by default, so a successful historical update cannot be misread as the current remote state.

## Policy

1. The activation preflight reads the installed skill's `VERSION.json` and the target project's `.agents/agent-seed.json`.
2. It then runs `node scripts/update-agent-seed.mjs --json` before onboarding conclusions.
3. The only exceptions are an explicit per-turn request to skip the check or `self_update.check_on_start: false` in the project config.
4. `self_update.last_check` is historical evidence only. Its `updated`, `queued`, or `deferred` values must never suppress this activation's check.
5. `/agent-seed` authorizes the read-only check. Applying an available update remains a separate, explicit owner approval.

## Scope

The released skill instructions and public README will state this policy without ambiguity. The updater's download, replacement, and Windows deferred-update behavior remain unchanged. Existing `.agents/agent-seed.json` files remain compatible; no schema migration is needed.

## Verification

The updater test suite will assert that the instruction text requires the ordered local metadata reads and `--json` check, identifies the two exclusions, rejects `last_check.status: updated` as a skip signal, and retains the separate `--apply` approval boundary.
