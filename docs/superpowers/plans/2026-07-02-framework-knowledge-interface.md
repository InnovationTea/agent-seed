# Framework Knowledge Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in and project-local framework knowledge interface to `agent-seed`, with Nuwa as the first built-in framework knowledge pack.

**Architecture:** Use a configuration-driven registry at `skill/framework-knowledge.json` and Markdown knowledge packs under `skill/references/frameworks/`. The skill workflow reads the registry during framework fingerprinting, stays inside the target root for project-local knowledge, and labels preset knowledge separately from confirmed repository or owner facts.

**Tech Stack:** Markdown skill instructions, JSON configuration, Node.js `node:test` release tests.

---

### Task 1: Add Failing Registry Validation Tests

**Files:**
- Modify: `tools/release.test.mjs`
- Test: `tools/release.test.mjs`

- [ ] **Step 1: Add the failing test**

Append this test before the `markdownFiles` helper in `tools/release.test.mjs`:

```js
test("framework knowledge config registers valid built-in knowledge packs", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "framework-knowledge.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.ok(Array.isArray(config.framework_knowledge));
  assert.ok(config.framework_knowledge.length > 0);

  const nuwa = config.framework_knowledge.find((entry) => entry.name === "nuwa");
  assert.ok(nuwa, "expected Nuwa framework knowledge entry");
  assert.equal(nuwa.knowledge_path, "references/frameworks/nuwa.md");

  for (const entry of config.framework_knowledge) {
    assert.equal(typeof entry.name, "string");
    assert.notEqual(entry.name.trim(), "");
    assert.equal(typeof entry.display_name, "string");
    assert.notEqual(entry.display_name.trim(), "");
    assert.ok(Array.isArray(entry.aliases));
    assert.ok(entry.aliases.length > 0);
    assert.ok(entry.aliases.every((alias) => typeof alias === "string" && alias.trim() !== ""));

    assert.ok(Array.isArray(entry.fingerprints.search_terms));
    assert.ok(entry.fingerprints.search_terms.length > 0);
    assert.ok(entry.fingerprints.search_terms.every((term) => typeof term === "string" && term.trim() !== ""));

    assert.ok(Array.isArray(entry.fingerprints.file_patterns));
    assert.ok(entry.fingerprints.file_patterns.length > 0);
    assert.ok(entry.fingerprints.file_patterns.every((pattern) => typeof pattern === "string" && pattern.trim() !== ""));

    assert.equal(typeof entry.knowledge_path, "string");
    assert.match(entry.knowledge_path, /^references\/frameworks\/.+\.md$/);
    await stat(path.join(rootDir, "skill", entry.knowledge_path));

    assert.ok(Array.isArray(entry.project_local.registry_paths));
    assert.ok(entry.project_local.registry_paths.length > 0);
    assert.ok(Array.isArray(entry.project_local.knowledge_paths));
    assert.ok(entry.project_local.knowledge_paths.length > 0);

    assert.ok(Array.isArray(entry.source_policy.labels));
    assert.deepEqual(entry.source_policy.labels, [
      "Preset",
      "Repo-confirmed",
      "Owner-confirmed",
      "Inferred",
      "Unknown",
    ]);
    assert.equal(entry.source_policy.preset_may_confirm_project_facts, false);
    assert.equal(entry.safety.stay_inside_target_root, true);
    assert.equal(entry.safety.external_sdk_inspection_requires_user_request, true);
  }
});

test("framework-specific prose stays in framework knowledge packs", async () => {
  const rootDir = process.cwd();
  const allowedFiles = new Set([
    path.normalize(path.join(rootDir, "skill", "framework-knowledge.json")),
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "nuwa.md")),
    path.normalize(path.join(rootDir, "skill", "references", "framework-fingerprints.md")),
    path.normalize(path.join(rootDir, "README.md")),
  ]);
  const files = [path.join(rootDir, "README.md"), ...(await markdownFiles(path.join(rootDir, "skill")))]
    .filter((filePath) => !allowedFiles.has(path.normalize(filePath)));

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    assert.equal(
      /\bNuwa\b/i.test(content),
      false,
      `${path.relative(rootDir, filePath)} hardcodes Nuwa prose outside framework knowledge routing`
    );
  }
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test tools/release.test.mjs`

Expected: FAIL because `skill/framework-knowledge.json` does not exist.

- [ ] **Step 3: Commit the failing test if working in strict TDD mode**

Run:

```bash
git add tools/release.test.mjs
git commit -m "test: require framework knowledge registry"
```

Expected: Commit succeeds, or skip the commit if the current session keeps red tests uncommitted until the next green step.

### Task 2: Add Built-In Registry And Nuwa Knowledge Pack

**Files:**
- Create: `skill/framework-knowledge.json`
- Create: `skill/references/frameworks/nuwa.md`
- Test: `tools/release.test.mjs`

- [ ] **Step 1: Create `skill/framework-knowledge.json`**

Create this file:

```json
{
  "framework_knowledge": [
    {
      "name": "nuwa",
      "display_name": "Nuwa",
      "aliases": [
        "nuwa",
        "nuw",
        "huawei nuwa",
        "huaweicloud nuwa",
        "harmony",
        "openharmony",
        "arkui",
        "arkts",
        "鸿蒙",
        "女娲"
      ],
      "fingerprints": {
        "search_terms": [
          "nuwa",
          "nuw",
          "huawei",
          "huaweicloud",
          "harmony",
          "openharmony",
          "arkui",
          "arkts",
          "oh-package",
          "build-profile",
          "hvigor",
          "ability",
          "module.json5",
          "app.json5",
          "generated",
          "generator",
          "schema",
          "dsl",
          "lifecycle",
          "route",
          "router",
          "page",
          "component",
          "service"
        ],
        "file_patterns": [
          "oh-package.json5",
          "build-profile.json5",
          "hvigorfile.*",
          "module.json5",
          "app.json5",
          "*nuwa*",
          "*nuw*",
          "*schema*",
          "*generated*",
          "*generator*",
          "*route*",
          "*router*"
        ]
      },
      "knowledge_path": "references/frameworks/nuwa.md",
      "project_local": {
        "registry_paths": [
          ".agents/framework-knowledge.json",
          "agents.d/framework-knowledge.json"
        ],
        "knowledge_paths": [
          "agents.d/frameworks/*.md",
          "docs/agent-frameworks/*.md"
        ]
      },
      "source_policy": {
        "labels": [
          "Preset",
          "Repo-confirmed",
          "Owner-confirmed",
          "Inferred",
          "Unknown"
        ],
        "preset_may_confirm_project_facts": false,
        "conflicts_require_owner_resolution": true
      },
      "safety": {
        "stay_inside_target_root": true,
        "external_sdk_inspection_requires_user_request": true,
        "generated_commands_require_repo_or_owner_confirmation": true
      }
    }
  ]
}
```

- [ ] **Step 2: Create `skill/references/frameworks/nuwa.md`**

Create this file:

```markdown
# Nuwa Framework Knowledge

Use this built-in knowledge pack when repository evidence, owner input, or project-local framework knowledge suggests a Nuwa-style framework. Public information may be incomplete, so every item in this file starts as `Preset` and must not be written as a target-project fact until repository evidence or the owner confirms it.

## Source Rules

- Label this file's guidance as `Preset`.
- Label exact files, commands, dependencies, manifests, generated directories, or annotations found in the target project as `Repo-confirmed`.
- Label framework semantics, safe generator usage, edit boundaries, and recovery steps explained by the owner as `Owner-confirmed`.
- Label naming-pattern guesses as `Inferred`.
- Keep unresolved framework behavior under `Unknown` or `Missing Context`.

## Fingerprint Search

Search inside the target project root only. Combine owner-provided names with these terms:

```bash
rg -n -i "nuwa|nuw|huawei|huaweicloud|harmony|openharmony|arkui|arkts|oh-package|build-profile|hvigor|ability|module\.json5|app\.json5|generator|generated|schema|dsl|lifecycle|route|router|page|component|service" <target-project-root>
rg --files <target-project-root> | rg -i "nuwa|nuw|oh-package\.json5|build-profile\.json5|hvigorfile|module\.json5|app\.json5|schema|generated|generator|routes?|routers?|pages?|components?|services?|abilities?"
```

Do not inspect installed SDKs, personal/global skill directories, plugin caches, or external framework source trees unless the user explicitly asks.

## Evidence To Inspect

- Package and build metadata such as `package.json`, `oh-package.json5`, `build-profile.json5`, `hvigorfile.*`, Gradle/Maven files, lockfiles, and custom CLI wrappers.
- App, module, route, page, ability, service, schema, DSL, generator, or plugin manifests.
- Entry modules, lifecycle hooks, decorators, annotations, dependency injection setup, bridge/native integration, and resource folders.
- Generated directories and files that should not be edited by hand.
- Scripts for scaffold, generate, update, preview, simulator/device runs, build variants, validation, lint, and clean.
- Debug surfaces such as logs, generated artifacts, devtools, simulator or device output, build caches, and repeated framework error messages.

## Owner Questions

Ask only questions that repository evidence and project-local framework knowledge cannot answer:

- What is Nuwa responsible for in this repo: UI, routing, code generation, build packaging, runtime services, device integration, backend integration, or another layer?
- Which files are Nuwa-owned or generated, and which files should agents edit by hand?
- What commands are the confirmed golden path for install, generate, run or preview, build, test, lint, and clean?
- What output, artifact, device state, port, log line, or test result proves the Nuwa workflow is healthy?
- Which Nuwa errors are common, and what recovery steps are approved?
- Which conventions are easy for agents to miss: naming, folder placement, lifecycle order, registration files, generated artifacts, or files that must change together?
- Are vendor tools, VPN/internal registries, SDK versions, IDE plugins, devices, simulators, or credentials required?
- May agents run Nuwa generators autonomously, ask first, or never run them?

## Distillation Targets

- `agents.d/bootstrap.md`: SDKs, internal registries, vendor tools, devices, simulators, environment variables, and setup blockers.
- `agents.d/tooling.md`: Nuwa CLIs, generators, validators, safety levels, inputs, outputs, and failure recovery.
- `agents.d/architecture-map.md`: Nuwa entry points, module boundaries, generated-code boundaries, lifecycle flow, routing, and files that change together.
- `agents.d/change-recipes.md`: Adding or changing pages, components, services, modules, schemas, routes, generated artifacts, or platform bridges.
- `agents.d/debug-playbook.md`: Nuwa symptoms, logs, caches, diagnostics, and owner-approved recovery.
- `agents.d/risk-areas.md`: Generated files, compatibility constraints, SDK or device requirements, release packaging, internal APIs, and escalation triggers.

## Do Not Guess

- Do not assume Nuwa is ArkUI, HarmonyOS, OpenHarmony, or a generic web framework.
- Do not write framework-specific commands as facts unless they appear in repository files or the owner confirms them.
- Do not treat preset generated-file boundaries as confirmed. Ask the owner or cite repo evidence.
- Do not turn temporary troubleshooting notes, secrets, personal paths, internal account names, or one-off incident chatter into reusable runbook content.
```

- [ ] **Step 3: Run the tests to verify GREEN for registry validation**

Run: `node --test tools/release.test.mjs`

Expected: Existing tests may still fail only if Nuwa prose remains in old routing docs; registry path validation should pass.

- [ ] **Step 4: Commit registry and Nuwa pack**

Run:

```bash
git add skill/framework-knowledge.json skill/references/frameworks/nuwa.md tools/release.test.mjs
git commit -m "feat: add framework knowledge registry"
```

Expected: Commit succeeds.

### Task 3: Route Skill Workflow Through Framework Knowledge

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `skill/references/framework-fingerprints.md`
- Modify: `skill/references/knowledge-distillation.md`
- Test: `tools/release.test.mjs`

- [ ] **Step 1: Update `skill/SKILL.md` progressive disclosure**

In the `Progressive Disclosure` section, replace the framework bullet with:

```markdown
- For uncommon, private, vendor, internally named, or preset-supported frameworks, or when the user mentions a framework the model may not know well, read `references/framework-fingerprints.md`. If `framework-knowledge.json` contains a matching framework entry or the target project provides project-local framework knowledge, load only the matching framework knowledge files before interviewing the owner.
```

- [ ] **Step 2: Update `skill/SKILL.md` core rules**

Add these bullets near the existing framework and source-preservation rules:

```markdown
- Treat built-in and project-local framework knowledge as scan guidance and interview prompts, not as confirmed target-project facts.
- Label framework knowledge sources explicitly: `Preset`, `Repo-confirmed`, `Owner-confirmed`, `Inferred`, or `Unknown`.
```

- [ ] **Step 3: Update `skill/SKILL.md` scan instructions**

In the framework fingerprint pass, add instructions equivalent to:

```markdown
- Inspect `framework-knowledge.json` before framework fingerprinting and merge matching aliases, fingerprint terms, and knowledge paths with owner-mentioned names.
- Check project-local framework knowledge candidates from the matching registry entry, staying inside the target root.
- Load matching built-in or project-local framework knowledge only after a name, alias, fingerprint, or owner mention makes it relevant.
- Keep preset knowledge out of `Confirmed`; use it for `Preset`, `Missing`, owner questions, and targeted scan terms.
```

- [ ] **Step 4: Update `skill/references/framework-fingerprints.md`**

Add sections for:

```markdown
## Framework Knowledge Registry

When `skill/framework-knowledge.json` exists, use it as the built-in framework knowledge registry. Read only matching entries. Match entries by owner-mentioned names, aliases, fingerprint terms, file patterns, dependencies, manifests, generated directories, or project-local framework knowledge.

For each matching entry:

- Load `knowledge_path` from the skill only when the framework is relevant.
- Search only inside the target project root.
- Check the entry's `project_local.registry_paths` and `project_local.knowledge_paths` inside the target root.
- Treat built-in and project-local guidance as `Preset` until repository evidence or the owner confirms a target-project fact.
- If project-local knowledge conflicts with repository evidence or owner answers, ask which source wins.
```

Update the existing Nuwa handling section so it points to `framework-knowledge.json` and `references/frameworks/nuwa.md` instead of carrying detailed Nuwa prose inline.

- [ ] **Step 5: Update `skill/references/knowledge-distillation.md`**

In the `Knowledge Map` framework inventory bullet, include built-in and project-local framework knowledge sources. Add a small structure:

```markdown
## Framework Knowledge Sources
- Framework:
- Source: Built-in preset, project-local preset, repo evidence, owner answer, or unknown.
- Registry entry:
- Knowledge file:
- Matching evidence:
- Confirmed facts:
- Questions still needed:
- Safety level:
```

- [ ] **Step 6: Run tests**

Run: `node --test tools/release.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit workflow routing**

Run:

```bash
git add skill/SKILL.md skill/references/framework-fingerprints.md skill/references/knowledge-distillation.md
git commit -m "docs: route scans through framework knowledge"
```

Expected: Commit succeeds.

### Task 4: Update Repository Documentation

**Files:**
- Modify: `README.md`
- Test: `tools/release.test.mjs`

- [ ] **Step 1: Update repository layout**

Add `framework-knowledge.json` and `references/frameworks/` to the `skill/` tree in `README.md`:

```text
|   |-- framework-knowledge.json
|   |-- references/
|   |   `-- frameworks/   # Built-in framework knowledge packs such as Nuwa
```

- [ ] **Step 2: Update behavior summary**

Add one bullet to `What The Skill Produces`:

```markdown
- Built-in and project-local framework knowledge routing, starting with a Nuwa preset that improves scans and owner interviews without treating preset knowledge as confirmed project facts.
```

- [ ] **Step 3: Update development notes**

Add:

```markdown
- Keep framework knowledge registered in `skill/framework-knowledge.json`; place built-in framework packs under `skill/references/frameworks/`.
```

- [ ] **Step 4: Run tests**

Run: `node --test tools/release.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit README update**

Run:

```bash
git add README.md
git commit -m "docs: document framework knowledge packs"
```

Expected: Commit succeeds.

### Task 5: Final Verification

**Files:**
- Read: `docs/superpowers/specs/2026-07-02-framework-knowledge-interface-design.md`
- Read: `git status --short`
- Test: `tools/release.test.mjs`

- [ ] **Step 1: Run the full release test**

Run: `node --test tools/release.test.mjs`

Expected: PASS with all tests passing.

- [ ] **Step 2: Build release artifact**

Run: `node tools/release.mjs`

Expected: Writes `outputs/agent-seed/` and `outputs/agent-seed.zip`.

- [ ] **Step 3: Inspect release package contents**

Run: `rg --files outputs/agent-seed`

Expected: Output includes:

```text
outputs/agent-seed/framework-knowledge.json
outputs/agent-seed/references/frameworks/nuwa.md
```

- [ ] **Step 4: Check working tree**

Run: `git status --short`

Expected: Clean or only generated `outputs/` files if they are ignored.

- [ ] **Step 5: Report completion**

Final response should summarize created and modified files, test and release commands run, and any residual risk such as unverified Nuwa semantics that still require owner confirmation in target projects.
