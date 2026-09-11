# Phase 10 — Hardening & demo

**Day 12** · Depends on: everything

## Goal
It runs from a clean clone, and you can defend every decision in the walkthrough.

## Tasks

**Clean-clone check**
- Delete volumes *and* images, clone fresh, copy `.env.example` to `.env`,
  `docker compose up`
- A build that only works incrementally isn't done
- Confirm file persistence explicitly: upload → `docker compose restart` → download
  the same file back

**Mocked E2E happy path**
- One test walking the whole flow: login → upload → submit → comment → approve →
  download

**README**
- Setup: the one command, and what goes in `.env`
- The decisions and why, written down so they can be read rather than recalled:
  - Full copies per version, not diffs — files are binary, diffing is meaningless,
    and reconstructing version N must be a single file read
  - Revision upload cancels in-flight reviews — with what happens to a reviewer
    who clicks approve a moment too late
  - Single-current enforced by a database index, not application code
  - Comments anchored per version, no carry-over
- `EXPLAIN ANALYZE` output for version history

**Walkthrough rehearsal**
Run through the three questions in §7 of the spec out loud:
1. *Only the current version can be approved — show me the enforcement.*
   → the conditional `WHERE ... AND is_current = true`, and the partial unique index
   behind it
2. *Full copies or diffs? What made you choose?*
   → binary files, O(1) reconstruction, storage cost accepted deliberately
3. *An approved document is locked — show me an attempt to modify it.*
   → `curl` a mutation at an approved version, show the 409

Then the two live demos:
- Run the looped race test and explain what each assertion rules out
- Two browser windows, produce the stale-approval 409 on screen

## Done when
- Clean clone comes up with one command
- Full test suite passes, including the 50× race test
- README explains every tradeoff without you needing to be in the room
- You can answer all three walkthrough questions without looking anything up
