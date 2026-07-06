# Framework Knowledge Interface Design

## Purpose

Add a framework knowledge interface to `agent-seed` so scans can use curated framework guidance in addition to repository evidence and owner interviews. The first built-in knowledge pack targets Nuwa, while the interface also supports target-project-local knowledge that can supplement or override built-in guidance.

## Goals

- Provide built-in framework knowledge without hardcoding framework prose into the main workflow.
- Let target projects provide their own framework knowledge files inside the scan boundary.
- Keep source labels explicit so preset knowledge never becomes a repo-confirmed fact.
- Use framework knowledge to improve scanning, owner questions, and generated runbooks.
- Validate the configuration shape with release tests.

## Non-Goals

- Do not claim Nuwa behavior as confirmed unless repository evidence or the owner confirms it.
- Do not inspect external SDKs, personal skill directories, plugin caches, or framework source trees unless the user explicitly asks.
- Do not build a runtime parser or executable plugin system; this is a skill-readable configuration and reference interface.

## Architecture

Add a top-level `skill/framework-knowledge.json` file. It is the built-in registry for framework knowledge packs and contains framework names, aliases, fingerprint terms, knowledge file paths, project-local override candidates, source labeling rules, and safety rules.

Add built-in framework knowledge under `skill/references/frameworks/`. The initial file is `skill/references/frameworks/nuwa.md`.

During the framework fingerprint pass, the distiller reads the built-in registry, checks for target-project-local framework knowledge registries or framework notes, and then uses matching entries to guide scans and owner interviews.

## Built-In Registry Shape

`framework-knowledge.json` should expose a top-level `framework_knowledge` array. Each entry should include:

- `name`: Canonical framework name.
- `display_name`: Human-readable name.
- `aliases`: Search aliases and alternate spellings.
- `fingerprints`: Search terms and file patterns to inspect inside the target root.
- `knowledge_path`: Built-in Markdown reference path inside the skill.
- `project_local`: Candidate project-local registry and knowledge file paths.
- `source_policy`: Required labels such as `Preset`, `Repo-confirmed`, `Owner-confirmed`, `Inferred`, and `Unknown`.
- `safety`: Rules preventing preset knowledge from being written as confirmed project facts.

## Project-Local Knowledge

The target project may provide a registry or knowledge notes inside the scan boundary. Suggested candidate paths:

- `.agents/framework-knowledge.json`
- `agents.d/framework-knowledge.json`
- `agents.d/frameworks/*.md`
- `docs/agent-frameworks/*.md`

Project-local knowledge has higher relevance than built-in knowledge because it is closer to the project, but it still needs explicit source labeling. If project-local knowledge conflicts with repository evidence or owner answers, the distiller must call out the conflict and ask which rule wins.

## Nuwa Knowledge Pack

The Nuwa pack should provide:

- Search aliases such as `nuwa`, `nuw`, Huawei/Harmony ecosystem terms, and any owner-provided Chinese names.
- Common repository signals to inspect, including manifests, build profiles, lifecycle hooks, generators, DSL/schema files, route/page/component registration, and generated directories.
- Questions the distiller should ask only after repository evidence has been scanned.
- Guidance on generated-code boundaries, framework-owned files, command confirmation, debug surfaces, and escalation rules.

All Nuwa knowledge starts as `Preset`. Generated onboarding files may use it as a checklist or prompt source, but facts about the target project must remain `Repo-confirmed` or `Owner-confirmed`.

## Scan Flow

1. Establish the target project root and keep all scans inside it.
2. Read built-in `framework-knowledge.json`.
3. Check target-project-local framework knowledge candidates.
4. Run the existing framework fingerprint pass using built-in aliases, project-local aliases, and owner-mentioned names.
5. Load matching built-in and project-local framework knowledge files.
6. Present scan summary with explicit `Repo-confirmed`, `Preset`, `Inferred`, `Missing`, and conflict sections when needed.
7. Use preset knowledge to drive targeted owner questions.
8. Generate or update `AGENTS.md` and `agents.d/` using confirmed project facts, while keeping unresolved preset-driven items in `Missing Context`.

## Output Rules

- `AGENTS.md` should not contain long framework background. It should link to `agents.d/` files for detailed framework rules when generated.
- Framework-specific commands may be documented only when found in repo files or owner-confirmed.
- Generated files should identify framework knowledge sources when that distinction affects automation safety.
- If Nuwa semantics remain unresolved, place them under `Missing Context` rather than filling gaps.

## Test Plan

Add release tests that verify:

- `skill/framework-knowledge.json` exists and has a valid `framework_knowledge` array.
- Each entry has non-empty names, aliases, fingerprints, a Markdown `knowledge_path`, source policy, and safety rules.
- Each built-in `knowledge_path` exists under `skill/`.
- The Nuwa entry exists and points to `references/frameworks/nuwa.md`.
- Nuwa-specific prose stays in the Nuwa knowledge pack instead of being duplicated broadly across main workflow files, except for routing references.

## Documentation Updates

Update:

- `skill/SKILL.md` to mention built-in and project-local framework knowledge during scanning.
- `skill/references/framework-fingerprints.md` to route through the registry and source labels.
- `skill/references/knowledge-distillation.md` to include framework knowledge in the tooling/framework inventory.
- `README.md` to document the new registry and Nuwa pack in the repository layout and behavior summary.

## Open Questions

No blocking open questions. The initial project-local candidate paths are intentionally conservative and can be expanded later if real projects reveal stronger conventions.
