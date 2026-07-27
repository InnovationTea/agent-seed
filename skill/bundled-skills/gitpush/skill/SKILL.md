---
name: gitpush
description: Commit local Git changes and push them to the user's fork remote in a fork-based repository with origin and upstream configured. Use when the user asks to run gitpush, /gitpush, commit and push current changes, or optionally run gitpush --squash to squash the current feature branch into one commit before pushing with --force-with-lease.
---

# GitPush

Run one fork-based commit-and-push workflow. Treat squash as an optional preparation step, not a separate workflow.

## Invocation

- Use the default path for `gitpush`, `/gitpush`, or requests to commit and push current changes.
- Enable squash mode only when the user explicitly passes `--squash`, says `/gitpush --squash`, or clearly asks to squash the branch before pushing.
- In squash mode, accept an optional target branch argument. For unqualified names like `develop`, resolve to `upstream/develop` because the squash base should normally be the source repository's integration branch. Use `origin/<target>` only when the user explicitly supplies a remote-qualified ref like `origin/release`. Keep remote-qualified refs like `origin/release` or `upstream/release` unchanged.

## Workflow

1. Record the start time.
2. Verify the current directory is inside a Git worktree and pin that worktree for the entire workflow. This supports both the primary worktree and any linked worktree created with `git worktree add`:

```bash
git rev-parse --is-inside-work-tree
CURRENT_WORKTREE=$(git rev-parse --show-toplevel)
git worktree list --porcelain
```

The `worktree` entry whose path is `CURRENT_WORKTREE` is the only worktree in scope. Run every remaining Git command from that directory (or use `git -C "$CURRENT_WORKTREE" ...`). In command blocks below, `git` is shorthand for that pinned context.

- Never change to another listed worktree, the common Git directory, or the repository's primary worktree during this workflow.
- `git add -A`, `git diff`, `git commit`, and `git reset --soft` affect the pinned worktree and its checked-out branch only; they do not include uncommitted files from other worktrees.
- Remotes and fetched refs are shared by all worktrees. Fetching is therefore safe, but commit, reset, and push decisions must continue to use the pinned branch from this worktree.

3. Verify `HEAD` is attached to a branch:

```bash
git branch --show-current
```

4. Inspect the worktree:

```bash
git status --porcelain
```

5. Verify required remotes are configured before creating a commit:

```bash
git remote
git remote get-url origin
git remote get-url upstream
```

If `origin` is missing, stop and tell the user: `origin` must point to the user's fork of the source repository. If `upstream` is missing, stop and tell the user: `upstream` must point to the source repository.

6. If squash mode is enabled, run the squash preparation steps below before generating the final commit message.
7. Stage all current changes:

```bash
git add -A
```

8. Inspect staged changes:

```bash
git diff --cached --stat
git diff --cached --name-status
```

9. If there is no staged content, stop and report that there is nothing to commit.
10. Generate a concise Chinese Conventional Commit message from the staged diff:

```text
feat: 描述
fix: 描述
docs: 描述
style: 描述
refactor: 描述
test: 描述
chore: 描述
```

Use `chore: 更新代码` only when the type cannot be inferred.

11. Bootstrap commit signing before committing:

```bash
git config --get commit.gpgsign
git config --get gpg.format
git config --get user.signingkey
```

If signing is already configured, keep the user's existing configuration. If signing is not configured, inspect SSH public keys in this order:

```text
~/.ssh/id_ed25519.pub
~/.ssh/id_ecdsa.pub
~/.ssh/id_rsa.pub
~/.ssh/*.pub
```

Only auto-configure SSH signing when the selected `.pub` file has a same basename private key next to it, such as `~/.ssh/id_ed25519` for `~/.ssh/id_ed25519.pub`. Prefer the first usable key from the ordered list. If only one usable SSH key exists, configure SSH signing automatically:

```bash
git config --global gpg.format ssh
git config --global user.signingkey SSH_PUBLIC_KEY_PATH
git config --global commit.gpgsign true
```

After auto-configuration, tell the user that GitHub verification also requires adding the same public key as a signing key in GitHub Settings > SSH and GPG keys. If multiple usable SSH keys exist and none is clearly preferred by the ordered list, ask the user which key to use. If no usable SSH key exists, continue to the signed commit attempt and use the failure guidance below if it fails.

12. Commit with a GitHub-verifiable signature:

```bash
git commit -S -m "提交信息"
```

Use the user's existing Git signing configuration. The `-S` flag must produce a GPG, SSH, or S/MIME signature that GitHub can verify. If this fails because signing is not configured, help the user enable commit signing before retrying:

```bash
# GPG signing
git config --global user.signingkey KEY_ID
git config --global commit.gpgsign true

# SSH signing
git config --global gpg.format ssh
git config --global user.signingkey PATH_TO_PUBLIC_SSH_KEY
git config --global commit.gpgsign true
```

Do not retry without `-S`, and do not fall back to an unsigned commit.

13. Push to the user's writable fork remote, `origin`:

```bash
git push origin CURRENT_BRANCH
```

If the branch has no upstream, also set it:

```bash
git push -u origin CURRENT_BRANCH
```

If squash mode was enabled, push with lease protection instead:

```bash
git push --force-with-lease origin CURRENT_BRANCH
```

If squash mode was enabled and the branch has no upstream, use:

```bash
git push -u origin CURRENT_BRANCH --force-with-lease
```

Never use `git push --force`.

## Squash Preparation

Run these steps only when squash mode is enabled.

1. Stop immediately if the current branch is protected:

```text
main
master
develop
dev
release
staging
production
prod
```

2. Verify and fetch remote refs. `origin` must point to the user's fork of the source repository, and `upstream` must point to the source repository. Stop with that guidance if either remote is missing:

```bash
git remote
git remote get-url origin
git remote get-url upstream
git fetch origin
git fetch upstream
```

3. Resolve the target branch:

- If the user supplied a remote-qualified target like `upstream/main` or `origin/develop`, use it as given.
- If the user supplied an unqualified target like `main` or `develop`, resolve it to `upstream/<target>`. Do not fall back to `origin/<target>` unless the user explicitly supplied the remote-qualified `origin/<target>` ref.
- If the user did not supply a target, choose the first existing ref from `upstream/main`, `upstream/master`, then `upstream/develop`. If none exists, stop and ask the user for an explicit target branch.

Verify the selected target exists:

```bash
git rev-parse --verify TARGET_BRANCH
```

4. Verify the target branch is an ancestor of `HEAD`:

```bash
git merge-base --is-ancestor TARGET_BRANCH HEAD
```

If this fails, stop. Tell the user to rebase or merge the target branch first. This prevents a squash commit from accidentally reverting changes that exist on the target branch.

5. Count commits to squash:

```bash
git rev-list --count TARGET_BRANCH..HEAD
```

If the count is `0` and the worktree is clean, stop and report that there is nothing to commit.

6. Stage uncommitted work so it is included in the squashed commit:

```bash
git add -A
```

7. Capture summary information before rewriting:

```bash
git rev-list --count TARGET_BRANCH..HEAD
git diff --cached --name-status
git diff --name-status TARGET_BRANCH...HEAD
```

8. Soft-reset to the target branch:

```bash
git reset --soft TARGET_BRANCH
```

After this, return to the main workflow at staged-change inspection. The final commit message should describe the whole squashed diff.

## Failure Rules

- Stop on any failed precheck, failed fetch, missing required remote (`origin` or `upstream`), missing target branch, detached `HEAD`, protected branch squash, failed signed commit, or rejected push.
- Preserve the relevant Git output in the final error.
- If `git commit -S` fails because signing is unavailable or misconfigured, include the signing setup commands from the commit step in the failure guidance.
- If `--force-with-lease` rejects the push, do not retry with `--force`.

## Output

On success, summarize:

- Whether squash mode was used
- Current branch
- Target branch and squashed commit count, when applicable
- Commit message
- Changed file counts
- Push result
- Elapsed time

On failure, use:

```text
提交失败
原因: <specific reason>
```
