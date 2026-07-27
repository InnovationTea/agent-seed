# Managed Skill Updates Design

## Goal

Allow Agent Seed to detect and, after owner approval, update the skills and
packages it manages in a target project. Keep externally installed plugins
under their platform's ownership while making their availability and update
state visible during Agent Seed activation.

## Managed Content

`bundled-skills.json` and `bundled-packages.json` are the source of truth for
Agent Seed-managed content. Every entry must have a stable release version.
The existing direct bundled skills replace their `local` marker with the
version of the Agent Seed release that ships them. `git-code-tracker` keeps
its pinned package version.

Project-local managed-install state lives in
`.agents/managed-skills.json`. It records each installed entry's name,
version, content kind, platform, target path, source identifier, and the
content digest created immediately after a successful installation. The file
contains separate `managed_skills` and `external_integrations` collections.

## Activation Checks

On activation, Agent Seed compares each installed managed record with its
current bundled manifest entry and reports one of these states:

- `current`: installed version and digest match the managed record.
- `update-available`: the manifest version is newer and the installed digest
  matches the last managed digest.
- `missing`: the recorded target path no longer exists.
- `locally-modified`: the target digest differs from the managed digest.
- `legacy-unmanaged`: a configured target exists but has no managed record or
  usable version metadata.

No activation check changes project files. A user must approve each update.

## Managed Upgrade

For `update-available`, Agent Seed stages the new content, validates it using
the manifest's existing verification command or rule, then replaces the
target directory. The prior directory is retained as a temporary backup until
verification succeeds. Failure restores the prior directory and leaves its
state record unchanged. Success writes the new version and digest.

`locally-modified` targets are never overwritten by the normal update flow.
Agent Seed reports the path and asks the owner to resolve the customization or
request an explicit manual replacement.

`legacy-unmanaged` targets are the migration exception. If the owner approves
an update, Agent Seed force-replaces the target with the current bundled
content and starts managing it by writing a fresh state record. This supports
old copies that predate version metadata. Without approval, the target remains
untouched.

Direct bundled skills use a common staged copy-and-replace helper. Bundled
packages continue to use their package installer; the helper records state
only after that installer and its verification succeed. Package-specific
configuration preservation, such as the tracker upload URL, remains the
installer's responsibility.

## External Integrations

`external-packages.json` entries are not owned by Agent Seed. They are
installed and updated by the platform's native marketplace, plugin manager,
configuration refresh, or package manager. When Agent Seed installs or
detects one, it may write an `external_integrations` record containing the
plugin name, platform, installation ownership (`agent-seed-assisted` or
`discovered`), and the observed version when the platform can supply one.

Activation checks external integrations as `available`, `missing`,
`update-available`, or `version-unknown`. It uses only a manifest-declared
platform-native status command or detection rule. A reported update is always
an owner prompt: after approval, Agent Seed invokes the declared platform
native update command and rechecks the result. It never copies, deletes, or
overwrites an external plugin directory. Discovered integrations can receive
advice but are not updated automatically by Agent Seed.

## Configuration And Documentation

The manifests gain the metadata needed for managed version comparison and
external status/update commands. Agent Seed activation guidance describes the
two ownership models, all states, per-update approval, legacy migration, and
the locally-modified protection. The managed state file is treated as local
operator state and added to `.gitignore` alongside
`.agents/agent-seed.json`.

## Verification

Node tests cover manifest validation, state read/write, version comparison,
digest-based modification detection, missing targets, successful staged
updates, rollback on verification failure, legacy force migration after
approval, and rejection of normal updates for locally modified targets.
Tests also cover external status recording, an available-update prompt path,
native update invocation only after approval, and the prohibition on direct
external-directory replacement. Release tests assert that all required files
and metadata are present in the packaged artifact.
