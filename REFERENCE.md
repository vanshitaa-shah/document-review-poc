# Reference — what each piece does

Companion to [SCOPE.md](SCOPE.md) and [phases/](phases/). One line per thing, plus how
to actually use the Claude setup.

---

## Backend libraries

| Library | What it does | Why it's here |
|---|---|---|
| **Node 22** | JavaScript runtime | Current LTS |
| **TypeScript** | Types on top of JS | Catches wrong-shaped data before runtime |
| **Express 5** | HTTP server and routing | Small, no opinions, nothing to fight |
| **PostgreSQL 16** | The database | We need SERIALIZABLE transactions and partial unique indexes. This POC is unbuildable correctly without them. |
| **Prisma** | ORM — turns tables into typed JS objects, manages migrations | Type-safe queries and `$transaction` with an isolation level |
| **Zod** | Validates request bodies against a schema | Bad input is rejected at the door, never reaches business logic |
| **jsonwebtoken** | Creates and verifies JWTs | Login token, proves who is making each request |
| **bcrypt** | Hashes passwords | Never store a plaintext password, even in a POC |
| **multer** | Handles file uploads (multipart form data) | Express can't read uploaded files on its own |
| **pino** | Structured JSON logging | Logs you can search, not `console.log` |
| **Vitest** | Test runner | Fast, works natively with TypeScript |
| **Supertest** | Fires real HTTP requests at the app in tests | Tests the actual route, middleware included |

## Frontend libraries

| Library | What it does |
|---|---|
| **React 19** | The UI |
| **Vite** | Dev server and build tool — fast, no config |
| **Tailwind CSS** | Styling via utility classes in the markup |
| **react-router** | Client-side page routing |
| **@recogito/react-text-annotator** | The Medium-style bit: text selection, comment popup, drawing highlights over the text |
| **mammoth** | Converts `.docx` to HTML so it can be highlighted |
| **react-markdown** | Renders `.md` files |

## Infrastructure

| Thing | What it does |
|---|---|
| **Docker Compose** | Starts api + postgres with one command |
| **Named volumes** | Where Postgres data lives. Survives restarts and rebuilds; only `docker compose down -v` wipes it. Uploaded files live in Cloudinary. |

---

## Key functionality, briefly

**Partial unique index** — a uniqueness rule that only applies to some rows. Here:
"only one row per document may have `is_current = true`". The database refuses to break
it, so a bug in our code fails loudly instead of corrupting data quietly.

**SERIALIZABLE transaction** — the strictest isolation level. Postgres behaves as if
concurrent transactions ran one after another. If two would conflict, it aborts one with
error `40001`, and we retry it. This is what makes the revision-upload race safe.

**Conditional write** — putting the condition inside the `UPDATE ... WHERE` instead of
checking in JavaScript first. There is no gap between checking and writing, so nothing
can change underneath us.

**Query predicate for access control** — putting the "does this user have access"
condition into the `WHERE` clause, so an unauthorized row is never loaded at all.

**Cursor pagination** — "give me 20 rows after id X" instead of "skip 100, take 20".
Doesn't slow down on later pages and doesn't skip rows when new ones are inserted.

**Audit trail** — a database table recording who did what, when, to which version.
Written inside the same transaction as the action, so it can never disagree with reality.
This is the record a client asks for; logs are just for debugging.

**Anchoring (inline comments)** — storing *where* a comment attaches: the exact quoted
text, a bit of text either side, and character offsets. Tied to one version id.

---

## The `.claude` setup — how to use it

### CLAUDE.md
Loaded automatically at the start of every session. You never invoke it. It's why Claude
already knows the stack and the five invariants without being told.

Edit it when a decision changes. Keep it short — everything in it costs context on every
single message.

### Skills — `.claude/skills/`

Claude loads these on its own when the work matches the description. You can also force
one with `/versioning-invariants` etc.

| Skill | Loads when |
|---|---|
| `versioning-invariants` | Touching versions, approval, transactions, category access |
| `api-route-conventions` | Adding or changing an endpoint |
| `concurrency-testing` | Writing race or concurrency tests |

**Why these exist:** each encodes a rule that's easy to break by accident and that still
passes casual testing. `versioning-invariants` shows the wrong code next to the right
code for exactly that reason — the read-then-write approval bug looks completely
reasonable until two requests arrive at once.

### Commands — `.claude/commands/`

Type these in Claude Code.

| Command | Does |
|---|---|
| `/phase 03` | Reads `phases/03-*.md`, loads the right skill, works through it, then checks the "Done when" list honestly |
| `/check` | Typechecks api and web, runs tests. Reports real output, not a summary. |
| `/race` | Runs the concurrency suite. Runs it three times. **Treats flaky as failing** — a race test that's green sometimes means the invariant genuinely doesn't hold. |
| `/db-reset` | Drops, migrates, re-seeds. Then verifies the partial unique index survived. |
| `/invariants` | Audits the whole codebase against the five rules, reports file:line, fixes nothing until you confirm |

The two worth building a habit around: `/phase N` to start a day, `/invariants` before
you consider a backend phase finished.

### settings.json — `.claude/settings.json`

Controls what runs without asking you.

- **allow** — npm, prisma migrate, tsc, docker compose, read-only git, file reading.
  Routine work stops interrupting you.
- **ask** — `docker compose down -v`, `prisma migrate reset`, `git commit`, `git push`.
  The first two destroy data; the last two are outward-facing. These should interrupt you.
- **deny** — reading `.env` files. `.env.example` stays readable.

`git add` is allowed but `git commit` isn't, so staging is frictionless and committing
stays a decision.

Add to `allow` whenever a command prompts you repeatedly and is genuinely safe.

---

## Typical day

```
/phase 04              start the phase
                       ... work ...
/check                 typecheck + tests
/invariants            audit against the five rules
/race                  if the phase touched versioning
```
