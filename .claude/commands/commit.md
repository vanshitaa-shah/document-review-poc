---
description: Stage and commit the current changes, following this project's commit conventions
---

Before committing, run in order:

1. `git status` — see what's untracked and what's staged.
2. `git diff` (and `git diff --staged` if anything is already staged) — read the actual
   change, not just the file list.
3. `git log --oneline -5` — match the tone of recent messages.

## What to check before staging

- Never stage `.env`, credentials, or anything under `api/uploads/` besides `.gitkeep` —
  `.gitignore` already excludes these; if `git status` shows one anyway, stop and ask.
- If the diff touches `DocumentVersion`, `Review`, `Approval`, `isCurrent`, supersession,
  transactions, or category filtering, re-check it against the five invariants in
  `versioning-invariants` before committing — a commit is a bad time to discover a
  violation.
- Stage specific files by name. Avoid `git add -A`/`git add .` when the working tree has
  unrelated in-progress work; stage only what belongs in this commit.

## Message style

Subject line format: `<type>-phase<N>: <description>`

- `type` is `feat`, `fix`, or `refactor` — nothing else. `feat` for new functionality,
  `fix` for correcting broken behavior, `refactor` for restructuring without changing
  behavior.
- `phase<N>` is the phase number this work belongs to (see `phases/`), e.g. `phase0`,
  `phase3`. Use the phase the change actually belongs to, not the phase currently in
  progress, if they differ.
- `description` is imperative mood, present tense, lowercase, no trailing period:
  "add version supersession transaction", not "Added" or "Adds".
- Examples: `feat-phase0: scaffold project foundation`,
  `fix-phase3: correct isolation level on supersession transaction`,
  `refactor-phase4: extract approval predicate into shared helper`.
- When a commit touches one of the five non-negotiable invariants, say which one in the
  body — it's the thing this project is graded on, and future-you will want to grep for
  it.
- Body explains *why*, not what — the diff already shows what. Skip the body entirely for
  small, self-explanatory changes.
- No bullet-point changelogs restating the diff file-by-file.

## After committing

Run `git status` again to confirm the working tree is clean (or show what's intentionally
left uncommitted), and `git log --oneline -1` to show the result.

Never push, amend, or rewrite history unless explicitly asked.
