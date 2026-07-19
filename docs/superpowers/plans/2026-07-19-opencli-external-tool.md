# OpenCLI External Tool Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCLI an approval-gated external tool that Agent Seed offers by default for Codex, Claude Code, codeagent-cli, and OpenCode.

**Architecture:** Register upstream installation and verification metadata in `skill/external-plugins.json`; do not vendor OpenCLI code or skills. Extend the release tests with an OpenCLI-specific contract test, while the generic manifest test continues validating the shared schema.

**Tech Stack:** JSON configuration, Node.js built-in `node:test`, GNU Make release targets.

---

## File Structure

- Modify: `skill/external-plugins.json` - declare OpenCLI's default, approval-gated external-tool recommendation for the four supported platforms.
- Modify: `tools/release.test.mjs` - assert the OpenCLI registration and its safety/install contract.
- Create: `docs/superpowers/plans/2026-07-19-opencli-external-tool.md` - this implementation plan.

### Task 1: Register And Validate OpenCLI

**Files:**

- Modify: `tools/release.test.mjs:535` - add a focused OpenCLI manifest-contract test before the DevEco CLI test.
- Modify: `skill/external-plugins.json:8` - append the `opencli` entry to `recommended_external_plugins`.

- [ ] **Step 1: Write the failing OpenCLI manifest-contract test**

Add this test before `test("external plugins include DevEco CLI for HarmonyOS projects", ...)`:

```js
test("external plugins include OpenCLI for browser automation", async () => {
  const configPath = path.join(process.cwd(), "skill", "external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const opencli = config.recommended_external_plugins.find((plugin) => plugin.name === "opencli");

  assert.ok(opencli, "expected OpenCLI recommendation");
  assert.equal(opencli.display_name, "OpenCLI");
  assert.match(opencli.purpose, /website|browser|web/i);
  assert.match(opencli.use_when, /default/i);
  assert.equal(opencli.default_recommendation.requires_network, true);
  assert.equal(opencli.default_recommendation.requires_user_approval, true);
  assert.equal(opencli.default_recommendation.safety_level, "ask-first");
  assert.match(opencli.default_recommendation.recommend_by_default_when, /supported platform/i);

  const supportedPlatforms = ["codex", "claude", "codeagent-cli", "opencode"];
  assert.deepEqual(opencli.platforms.map((platform) => platform.platform).sort(), supportedPlatforms.sort());

  for (const platform of opencli.platforms) {
    assert.match(platform.install_action, /npm install -g @jackwener\/opencli/);
    assert.match(platform.install_action, /npx skills add jackwener\/opencli/);
    assert.match(platform.install_action, /Browser Bridge/i);
    assert.match(platform.install_action, /do not install.*automatically/i);
    assert.ok(platform.detection_evidence.some((entry) => /opencli --version|OpenCLI skills/i.test(entry)));
    assert.match(platform.verification, /opencli --version/);
    assert.match(platform.verification, /skills/i);
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test --test-name-pattern="external plugins include OpenCLI" tools/release.test.mjs
```

Expected: the test fails with `expected OpenCLI recommendation` because no `opencli` entry exists yet.

- [ ] **Step 3: Add the OpenCLI external-plugin configuration**

Append this object to `recommended_external_plugins` after the existing `deveco-cli` object, preserving valid JSON commas:

```json
{
  "name": "opencli",
  "display_name": "OpenCLI",
  "purpose": "Website and browser automation, structured web extraction, and development or repair of reusable OpenCLI adapters through upstream-managed CLI and agent skills.",
  "use_when": "Offer by default when a supported agent platform is detected or requested. Use after owner approval for website automation, browser-backed extraction, or OpenCLI adapter workflows.",
  "do_not_vendor_unless_explicitly_requested": true,
  "default_recommendation": {
    "requires_network": true,
    "requires_user_approval": true,
    "safety_level": "ask-first",
    "recommend_by_default_when": "A supported platform is detected or requested during Agent Seed activation."
  },
  "platforms": [
    {
      "platform": "codex",
      "install_action": "After user approval, run npm install -g @jackwener/opencli, then run npx skills add jackwener/opencli. For browser-backed work, separately ask the owner to manually install the OpenCLI Browser Bridge extension; do not install browser extensions automatically.",
      "detection_evidence": [
        "opencli --version succeeds in the current environment.",
        "OpenCLI skills are already visible to the Codex session or project."
      ],
      "verification": "Confirm opencli --version succeeds and Codex recognizes the installed OpenCLI skills. Run opencli doctor only after the owner authorizes a browser-bridge diagnostic."
    },
    {
      "platform": "claude",
      "install_action": "After user approval, run npm install -g @jackwener/opencli, then run npx skills add jackwener/opencli. For browser-backed work, separately ask the owner to manually install the OpenCLI Browser Bridge extension; do not install browser extensions automatically.",
      "detection_evidence": [
        "opencli --version succeeds in the current environment.",
        "OpenCLI skills are already visible to the Claude Code session or project."
      ],
      "verification": "Confirm opencli --version succeeds and Claude Code recognizes the installed OpenCLI skills. Run opencli doctor only after the owner authorizes a browser-bridge diagnostic."
    },
    {
      "platform": "codeagent-cli",
      "install_action": "After user approval, run npm install -g @jackwener/opencli, then run npx skills add jackwener/opencli. For browser-backed work, separately ask the owner to manually install the OpenCLI Browser Bridge extension; do not install browser extensions automatically.",
      "detection_evidence": [
        "opencli --version succeeds in the current environment.",
        "OpenCLI skills are already visible to the codeagent-cli session or project."
      ],
      "verification": "Confirm opencli --version succeeds and codeagent-cli recognizes the installed OpenCLI skills. Run opencli doctor only after the owner authorizes a browser-bridge diagnostic."
    },
    {
      "platform": "opencode",
      "install_action": "After user approval, run npm install -g @jackwener/opencli, then run npx skills add jackwener/opencli. For browser-backed work, separately ask the owner to manually install the OpenCLI Browser Bridge extension; do not install browser extensions automatically.",
      "detection_evidence": [
        "opencli --version succeeds in the current environment.",
        "OpenCLI skills are already visible to OpenCode through opencode.json, .opencode.yaml, or its loaded skill list."
      ],
      "verification": "Confirm opencli --version succeeds and OpenCode recognizes the installed OpenCLI skills from opencode.json, .opencode.yaml, or its loaded skill list. Run opencli doctor only after the owner authorizes a browser-bridge diagnostic."
    }
  ]
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test --test-name-pattern="external plugins include OpenCLI" tools/release.test.mjs
```

Expected: one OpenCLI test passes; tests skipped by the name pattern are reported as skipped.

- [ ] **Step 5: Run the complete validation suite and package build**

Run:

```bash
make check
make release VERSION=v0.0.0-opencli-test
```

Expected: both Node test files pass; the release command recreates ignored `outputs/agent-seed/`, `outputs/agent-seed.zip`, and `outputs/agent-seed-release.json` with the OpenCLI entry included in the packaged `external-plugins.json`.

- [ ] **Step 6: Review the final diff and commit**

Run:

```bash
git diff --check
git diff -- skill/external-plugins.json tools/release.test.mjs
git add skill/external-plugins.json tools/release.test.mjs
git commit -m "feat: recommend OpenCLI as external tool"
```

Expected: no whitespace errors; the commit contains only the OpenCLI manifest registration and its focused regression test.
