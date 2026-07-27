# Git Code Tracker v1.0.5 Integration Design

## Goal

Bundle upstream Git Code Tracker `v1.0.5` in Agent Seed so new project-local
installations record the released tracker version instead of falling back to
`0.1.0`.

## Release Asset

Replace the bundled `ai-commit-statistic-skill-v1.0.4.zip` asset with the
unmodified upstream `ai-commit-statistic-skill-v1.0.5.zip` release asset. Pin
the package manifest to `v1.0.5`, update the archive filename and asset path,
and retain the GitHub repository source.

The upstream v1.0.5 release notes identify this as the version-issue fix. The
integration must verify the downloaded archive digest when it is available
from the release metadata.

## Installation Behavior

Agent Seed's wrapper continues to extract the selected platform skill, invoke
the copied upstream installer, apply the existing default upload URL only when
the project has no non-empty `uploadUrl`, then run the upstream check command.

The wrapper must not rewrite `installedVersion`; that value is owned by the
upstream v1.0.5 installer. A clean project install must produce
`.ai-tracking/config.json` with `installedVersion` set to `1.0.5` and the
existing default upload URL. An existing non-empty project upload URL remains
unchanged.

## Tests

Update release and installation tests to pin v1.0.5. Add an installation
assertion for `installedVersion: "1.0.5"` alongside the existing upload URL
assertion, and retain coverage that preserves an existing project upload URL.

Run the targeted Node test suites and the repository release verification
after integration.
