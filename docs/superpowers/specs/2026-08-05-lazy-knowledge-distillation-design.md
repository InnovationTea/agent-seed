# Lazy Knowledge Distillation Design

## Goal

Run Agent Seed onboarding automatically only for projects whose initial knowledge
distillation has not completed, while keeping routine task updates incremental and
providing an explicit full-refresh path.

## Design

Store project-shared onboarding state in `.agents/agent-seed.json` under
`knowledge_distillation`. The state is complete only after scanning, owner
interviews, asset writes, and final verification finish successfully. The
presence of `AGENTS.md` alone is not treated as proof of completion, and the
absence of `agents.d/` is allowed because `knowledge-updater` creates focused
files only when detailed knowledge requires them.

At conversation start, Agent Seed checks the shared state and the `AGENTS.md`
entry point. A missing or non-complete state, or a missing entry point, starts
initial onboarding. A complete state skips onboarding and leaves the normal
`knowledge-updater` completion step unchanged.

An explicit user request for a full refresh, such as "full knowledge distillation
and owner interviews", always bypasses the complete state. The refresh updates
existing assets incrementally according to the existing conflict and write-mode
rules; a failed refresh preserves existing assets and leaves the state
non-complete for retry.

## State

Supported persisted states are `in_progress`, `complete`, and `failed`.
Missing or invalid state is interpreted as `missing` for start-up decisions.
`complete` requires a non-empty `completed_at` timestamp. The state remains in
the shared config so all checkouts see the same onboarding result.

## Error Handling

Interrupted or failed onboarding must not be recorded as complete. The last
step or concise error may be retained in the state for the next activation to
report. Routine `knowledge-updater` conflicts or write failures do not change
the onboarding completion state.

## Verification

Unit tests cover missing, complete, invalid, and forced-refresh decisions,
state persistence, required completion metadata, and preservation of existing
shared policy. Release tests cover the user-facing skill instructions and the
explicit refresh wording.
