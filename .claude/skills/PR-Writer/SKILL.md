---
name: pr-writer
description: "Use when: writing polished pull request descriptions from diffs, commit history, tickets, or implementation notes. Produces reviewer-friendly summaries with testing and risk context."
user-invocable: true
argument-hint: "Provide diff context, changed files, commit messages, ticket info, or rough PR notes"
---

# PR-Writer Skill

## Purpose

Generate clear, accurate, reviewer-friendly pull request descriptions from code changes, commit history, issue context, and developer notes.

## When to use

Use this skill whenever the user provides a diff, changed files, commit history, branch name, ticket, or rough notes and wants a polished PR description.

## Core behavior

- Infer the purpose of the change from available context.
- Write for reviewers, not for the author.
- Be specific about what changed and why.
- Distinguish user-facing changes from internal refactors.
- Call out risks, migrations, feature flags, breaking changes, and testing.
- Do not invent details that are not supported by the input.
- If information is missing, write `Not specified`.

## Template

The output MUST follow the structure defined in `.github/pull_request_template.md`. Use a file-reading tool to retrieve `.github/pull_request_template.md`. If no tool is available or the file cannot be found, use the fallback Output template below. The `# Description` section from that file is the main body - fill it with the enriched content described below. Copy the merge checklist sections verbatim from `.github/pull_request_template.md` as read from the repository. If `.github/pull_request_template.md` is available, its structure takes precedence over the Required output structure section below, which serves only as a guide for content enrichment.

## Required output structure

1. Title (above the template body)
2. Description (Jira link + overview - replaces the placeholder in the template)
3. Why this change
4. What changed
5. Testing
6. Risks / rollout notes
7. Merge checklists (copied verbatim from `.github/pull_request_template.md` when available; otherwise from the Output template section below)

## Style rules

- Keep it concise but complete.
- Use plain English.
- Prefer short bullets under sections.
- Use title format `OMAS-<ticket-id>: <summary>` when a ticket key is available in the input.
- If no ticket key is provided, set the title value exactly to `Not specified`.
- Mention impacted components, APIs, DB/schema changes, config changes, and UI changes when relevant.
- Highlight anything reviewers should pay special attention to.
- If the change is small, compress the description while keeping all important facts.
- If the change is large, organize by subsystem or file area.

## Input handling

- If the user provides raw diffs, summarize the intent behind the code changes.
- If the user provides rough notes, rewrite them into a professional PR description.
- If the user provides a ticket, align wording with the ticket goal.
- If the user provides commits, merge overlapping points into a clean narrative.
- If tests are mentioned, separate automated tests from manual verification.
- If there are breaking changes, place them prominently near the top.

## Output template

Fallback template when `.github/pull_request_template.md` is unavailable:

Title: <OMAS-<ticket-id>: clear PR title when ticket key is available; otherwise Not specified>

# Description

https://sanoma.atlassian.net/browse/OMAS-<ticket-id>

<2-4 sentence overview of the change and outcome>

### Why this change
- <problem or goal>
- <business or technical reason>

### What changed
- <major code change 1>
- <major code change 2>
- <API / UI / DB / config details if relevant>

### Testing
- Automated: <unit/integration/e2e or Not specified>
- Manual: <manual verification steps or Not specified>

### Risks / rollout notes
- <risk, migration, monitoring, feature flag, rollback note, or None identified>

## Merge checklist (author)

- [ ] Related documentation is up-to-date or a task to update documentation exists in Jira with label Documentation
- [ ] Change is verified by designer or change doesn't include design changes

## Merge checklist (reviewer)

- [ ] Why and what for the change is documented in JIRA
- [ ] Change has been verified
- [ ] Impacted features have been regression tested
- [ ] Change implements our conventions

## Pushing the description to GitHub

If this section grows beyond a small executable recipe, move operational logic to a repository script and keep this skill focused on output format.

When asked to update or add a description to a pull request, use the repository script `scripts/pr_writer_update_pr.sh`. This keeps logic in one place and returns clear mismatch/error information. If `scripts/pr_writer_update_pr.sh` is not found, inform the user that the script is missing and offer to update the PR via `gh pr edit` directly or provide the description for manual pasting.

```bash
# Check-only: detect existing PR for current branch and print diagnostics
bash scripts/pr_writer_update_pr.sh --check-only

# Update: write full body to a local temp file and patch the PR
body_file="$(mktemp "${TMPDIR:-.}/pr-body.XXXXXX.md")"
cat > "$body_file" << 'EOF_BODY'
<FULL PR BODY HERE>
EOF_BODY
bash scripts/pr_writer_update_pr.sh --title "<title>" --body-file "$body_file"
rm -f "$body_file"
```

If verification still shows old content, report the failure to the user.

For a quick existing-PR check without updating anything, use the same script in check-only mode.

## Quality bar

A good PR description should let a reviewer quickly understand:
- what changed
- why it changed
- how it was validated
- what could go wrong
