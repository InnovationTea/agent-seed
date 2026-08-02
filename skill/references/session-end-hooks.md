# Claude-Compatible Session-End Hooks

Agent Seed supports the same knowledge-only hook shape for Claude Code and
codeagent-cli (cac). The latter uses the same hook schema with `.cac/` project
paths instead of `.claude/` paths.

The hook command must point to the installed Agent Seed script:

```text
<agent-seed-skill-root>/scripts/session-end-knowledge-update.mjs
```

Do not copy this hook into a project or modify platform settings without owner
approval. Hook changes are harness changes.

## Claude Code

Merge this `SessionEnd` entry into `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <agent-seed-skill-root>/scripts/session-end-knowledge-update.mjs --platform claude-code --json"
          }
        ]
      }
    ]
  }
}
```

## codeagent-cli

Use the same hook schema in `.cac/settings.json`, changing only the platform
argument:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <agent-seed-skill-root>/scripts/session-end-knowledge-update.mjs --platform codeagent-cli --json"
          }
        ]
      }
    ]
  }
}
```

On Windows, the script resolves `claude` to `claude.cmd` and
`codeagent-cli` to `codeagent-cli.cmd` when those commands are available on
`PATH`.

## Write Boundary

The script reads `session_end_knowledge_update` from `.agents/agent-seed.json`.
It defaults to `true`. Automatic child-agent execution additionally requires:

```json
{
  "knowledge_asset_write_mode": "full-access"
}
```

Without `full-access`, the hook writes only a candidate under
`.agents/session-summaries/`. With `full-access`, it starts a non-interactive
Claude-compatible child session with `Read,Edit` tools and instructs it to
update only the bounded `Reusable Knowledge` section in `AGENTS.md`.

The child session cannot modify source code, tests, dependencies, hooks,
platform settings, or external integrations. It must not copy credentials,
tokens, cookies, personal data, or one-off incident chatter. The
`AGENT_SEED_SESSION_END_CHILD=1` environment marker prevents the child session
from recursively invoking the same hook.

If the hook input does not include `transcript_path`, or the child command
fails, the script writes a candidate summary instead of retrying.
