# Ticket Lookup Design

## Goal

Distribute a project-local `ticket-lookup` skill that recognizes requests to
view SR and AR tickets by identifier, then uses an installed OpenCLI skill to
retrieve their content from a project-configured requirements-management site.

## Scope

- Add `ticket-lookup` as an Agent Seed bundled direct skill.
- Support SR and AR identifiers in user requests, including multiple IDs.
- Read the requirements-management URL from project configuration; never embed
  a site URL in the skill source or generated guidance.
- Use OpenCLI only for read-only browser navigation and extraction.
- Document the OpenCLI prerequisite and its existing approval-gated install
  flow.
- Add release tests for the bundled-skill registration and delivered skill
  contract.

## Non-Goals

- Do not install OpenCLI automatically or make it mandatory for all projects.
- Do not store credentials, cookies, tokens, or personal browser paths.
- Do not submit, modify, comment on, or otherwise change tickets.
- Do not encode application-specific selectors or assume a particular
  requirements-management product.

## Distribution

`skill/bundled-skills/ticket-lookup/skill/` is the source for a direct
project-local skill. `skill/bundled-skills.json` registers it for the same
supported platforms as the existing direct skills, with an approval-gated
project-local install. Its trigger metadata names the SR/AR lookup workflow so
agents can select it during routine conversation instead of requiring the
parent `agent-seed` skill to be active.

Agent Seed continues to offer the configured direct skill during onboarding.
Its generated guidance may reference the installed skill, but the lookup rules
live in `ticket-lookup` so they remain available outside onboarding.

## Configuration

The skill resolves configuration from the target-project root in this order:

1. `.agents/ticket-lookup.local.json`
2. `.agents/ticket-lookup.json`

Both files use this schema:

```json
{
  "requirement_management_url": "https://requirements.example.internal"
}
```

The shared `.agents/ticket-lookup.json` is intended to be committed. The local
file is an optional per-machine override and must be added to `.gitignore` when
created. The local file replaces the URL value from the shared file. The skill
does not use `.agents/agent-seed.json`, which is Agent Seed operator state.

If neither usable URL exists, or the selected URL is not an absolute HTTP(S)
URL, the skill reports the configuration problem and does not invoke OpenCLI.

## Lookup Flow

1. Detect a request intent such as view, query, retrieve, or summarize and one
   or more case-insensitive SR or AR identifiers.
2. Normalize identifiers to uppercase and de-duplicate them while preserving
   their order in the user request.
3. Resolve the configured requirements-management URL.
4. Confirm that the OpenCLI skill is available. If it is missing, explain that
   browser retrieval requires it and request the existing approval-gated
   installation; do not claim that the ticket was read.
5. Use OpenCLI to open the configured URL and search the visible site UI for
   each identifier. Reuse an authenticated browser session when one is
   available.
6. Extract the ticket content requested by the user and report each ticket's
   result. Preserve a clear distinction between found, not found, inaccessible,
   and browser/session failures.

The OpenCLI action is read-only. Any UI action that would create, edit,
transition, comment on, submit, or delete data requires separate user
confirmation and is outside this skill's normal workflow.

## Error Handling

- No identifier or no lookup intent: do not select the skill solely because
  the message contains unrelated text.
- Missing or invalid configuration: name the expected configuration file and
  field without exposing credentials.
- OpenCLI unavailable: request approval to install it using the configured
  external-plugin process.
- Browser bridge unavailable or user not authenticated: explain the
  prerequisite and stop without attempting a login or browser configuration
  change.
- Ticket not found: report the normalized ID as not found.
- Several IDs: continue with independent read-only lookups and return each
  individual outcome.

## Testing

Release tests will verify that `ticket-lookup` is registered as a bundled
direct skill with project-local approval requirements and supported platform
paths. They will also load the delivered `SKILL.md` and assert the trigger
terms, configuration precedence, URL validation, OpenCLI dependency, and
read-only safety rule. Tests do not connect to a real browser or requirements
system.
