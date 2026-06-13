---
name: github-pr-description
description: Use when writing GitHub pull request descriptions, PR bodies, merge request summaries, or `gh pr create --body` content from code changes, commits, diffs, or issue context.
---

# GitHub PR Description

Use this skill to write concise, reviewable GitHub pull request descriptions that explain what changed, why it changed, and how it was validated.

## Workflow

1. Gather context before drafting.
   - Inspect the branch diff against the intended base branch, usually `main`.
   - Read changed files when the diff alone does not explain intent.
   - Check recent commits included in the PR.
   - Note validation commands already run and their outcomes.

2. Identify the reviewer-relevant story.
   - State the behavior or capability change, not just file names.
   - Mention user-visible impact when present.
   - Call out migrations, config changes, CI changes, security-sensitive changes, or release impacts.
   - Avoid implementation trivia unless it helps review.

3. Write the PR body in this structure by default:

```markdown
## Summary
- 
- 

## Validation
- 

## Notes
- 
```

4. Omit sections that add no value.
   - If there are no special notes, omit `## Notes`.
   - If no validation was run, include `## Validation` with `- Not run (reason).`
   - If screenshots are relevant but unavailable, include `- Screenshots not included; no visible UI change.` only when helpful.

5. Keep it specific and short.
   - Prefer 2-4 bullets in `Summary`.
   - Prefer exact command names in `Validation`, for example `pnpm test`.
   - Do not say "minor changes", "various fixes", or "updated files" without naming the effect.

## Useful Commands

Use these as appropriate:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git log --oneline origin/main..HEAD
gh pr diff
gh pr view --json title,body,baseRefName,headRefName
```

Before creating or updating a PR with `gh`, verify the intended base and head branches.

## Examples

### Feature Or Fix

```markdown
## Summary
- add persisted provider selection for new chat sessions
- reuse the stored provider when opening the app instead of defaulting to OpenAI
- add store coverage for migration and fallback behavior

## Validation
- pnpm test
- pnpm lint
```

### CI Or Tooling

```markdown
## Summary
- add GitHub Actions checks for pull requests and pushes to `main`
- split lint, tests, app build, and Electron build into separate status checks
- install dependencies with `pnpm install --frozen-lockfile` to catch stale lockfiles

## Validation
- pnpm lint
- pnpm test
- pnpm build
- pnpm build:electron

## Notes
- After merge, enable branch protection requiring `lint`, `test`, `build`, and `build-electron`.
```

### No Local Validation

```markdown
## Summary
- update the README setup steps for local Docker search
- clarify the required environment variables for OpenAI-backed tools

## Validation
- Not run; documentation-only change.
```

## Quality Bar

A good PR description lets a reviewer answer:

- What changed?
- Why is this needed?
- What should I focus on while reviewing?
- How was this validated?
- Are there risks, follow-ups, or operational steps after merge?
