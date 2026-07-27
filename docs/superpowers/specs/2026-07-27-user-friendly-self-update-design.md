# User-Friendly Self-Update Design

## Goal

Reduce needless activation-time update checks, make update state understandable,
and notify Windows users when a deferred update actually completes.

## Policy

- `self_update.check_interval_hours` defaults to 24. A fresh successful check
  records `last_check` as either `current` or `available`; another check inside
  the interval returns the stored result without making a network request.
- `self_update.update_mode` defaults to `notify`. `manual` preserves the same
  read-only check but suppresses the available-update prompt in Agent Seed
  instructions. No mode applies a replacement without explicit owner approval.
- A Windows queued update retains its existing detached helper. After that helper
  verifies the installed version and records `updated`, it makes a best-effort
  Windows balloon notification. Notification failures never fail or roll back a
  completed update.

## Interfaces

`node scripts/update-agent-seed.mjs --json` returns a cached structured result
when the stored successful check is still within the interval. `--force-check`
skips that cache. Existing `--apply` behavior is unchanged.

The updater exports a `notifyWindowsUpdateCompleted` helper with injected command
runner support for tests. On Windows it launches a detached PowerShell process
using `System.Windows.Forms.NotifyIcon`; all other platforms are no-ops.

## Recovery

Network failures keep the existing deferred/error behavior. A malformed or
unknown `last_check` never suppresses a network check. A notification process
failure is intentionally ignored after a successful replacement.
