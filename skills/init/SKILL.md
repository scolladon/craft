---
name: init
description: Scaffold a craft customization by interview and write a named manifest. Triggers — "scaffold a craft customization", "craft:init", "generate a named manifest", "create a craft config for this repo".
argument-hint: [<name>]
---

# craft:init — named-manifest generator

Standalone session-owned skill. You (the session) probe the repo, interview the user over the full Tier-0/1 catalog, emit a manifest, lint it in a temp path, and move it into place only on a clean lint. No worker agent is spawned. Never call `worktree-setup.sh` (it installs deps). Never touch `.claude/workflow.md`.

Input: `$ARGUMENTS` (optional name; if absent, ask for one during interview).

---

## Preamble — probe + name validation (read-only)

Before asking anything, build the `CapabilityReport` from read-only probes.

### 1. Name resolution

Parse `--scope user|local` out of `$ARGUMENTS` first (default `local`) and strip it from the string; bind the result as `scope`. This is only a pre-fill — the Step 1 interview still asks the scope question and the user's answer there wins.

If the remaining `$ARGUMENTS` is non-empty, treat it as the candidate `<name>`. Otherwise hold name until the interview's first question.

When a candidate name is available, validate it immediately and bind the name and its local-scope path to shell variables:

```bash
name="<the candidate name>"
manifest_final="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-config.js" "$name")"
```

- Exit 0: the name is valid; `$manifest_final` holds the LOCAL-scope path (e.g. `.claude/craft-<name>.md`) for the Done report and local-existence checks. It no longer supplies the land target — Step 3 passes `$name` and `$scope` to `init-land.js`, which re-derives the destination itself.
- Non-zero: STOP — surface the stderr diagnostic; do not proceed.

Defer validation to the moment a name is provided if it was not in `$ARGUMENTS`.

### 2. Ecosystem detection

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-ecosystem.sh" .
```

Capture stdout as `ecosystem` (one of `npm|pnpm|yarn|bun|uv|poetry|cargo|go|bundler|composer`). If the command exits non-zero or produces empty output, set `ecosystem = null` and `lockfile = null`. The detected lockfile name is the file whose presence triggered the match (derive from ecosystem: `npm`→`package-lock.json`, `pnpm`→`pnpm-lock.yaml`, `yarn`→`yarn.lock`, `bun`→`bun.lockb`, `uv`→`uv.lock`, `poetry`→`poetry.lock`, `cargo`→`Cargo.toml`, `go`→`go.mod`, `bundler`→`Gemfile.lock`, `composer`→`composer.lock`).

### 3. Test-command discovery (gate probe, read-only)

Probe for a discoverable test command using the gate precedence: `descriptor.gate → manifest.gates[phaseId] → none`. In practice, check for common test runners in order: `package.json` `test` script, `Makefile` with a `test` target, `Cargo.toml`, `go.mod`, `pytest.ini`/`setup.cfg`/`pyproject.toml`. Set `testCmd` to the discovered command string, or `null` if none found.

### 4. Git remote presence

```bash
git remote
```

Set `hasRemote = true` if the command produces any output, `false` otherwise. A failure (git absent) degrades only the `hasRemote` dimension — never aborts the probe.

### 5. Harness technique enumeration

Enumerate candidate technique ids by reading the repo's own validation/architecture
conventions — same probe style as `testCmd`:

- Check for documented harness commands in `README.md`, `CONTRIBUTING.md`, `package.json`
  scripts, `Makefile`, and `.claude/workflow.md` / `.claude/craft-*.md` (any declared
  `techniquePlan` entries). Each discoverable command that validates or enforces a
  quality property (lint, typecheck, format-check, boundary-check, …) produces one
  candidate id derived from the command's purpose (e.g. `lint`, `typecheck`,
  `format-check`, `boundary-check`).
- Set `harnessTechniques` to the deduplicated list of discovered ids (possibly empty).

### 6. Existing named configs

```bash
ls .claude/craft-*.md 2>/dev/null
```

Capture matching filenames; extract the name segment from each (strip `.claude/craft-` prefix and `.md` suffix). Store as `existingNames[]`.

**State-mutating probes** (if any are later needed) must run in a `mktemp` throwaway directory — never against the working tree.

**CapabilityReport shape (immutable once built):**

```
{
  ecosystem:        string | null,
  lockfile:         string | null,
  testCmd:          string | null,
  hasRemote:        boolean,
  harnessTechniques: string[],
  existingNames:    string[],
}
```

---

## Procedure

### Step 1 — Interview (interactive)

Drive `AskUserQuestion` over the full Tier-0/1 catalog below, one question per point, defaults pre-filled from the CapabilityReport. A point the probe rules out is either skipped or asked with a "this will no-op in your repo" note — never silently dropped.

**Name (if not yet validated)**

If no valid name was supplied in `$ARGUMENTS`, ask:

> "What name should this customization have? (kebab-case, e.g. `ci` or `strict-review`)"

Validate immediately and bind the same shell variables the Preamble does — so `$manifest_final` is captured on this deferred path too (used for the Done report and local-existence checks):

```bash
name="<the answer>"
manifest_final="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-config.js" "$name")"
```

On non-zero: explain the constraint and re-ask.

**Scope**

Ask, pre-filled from the `--scope` parsed in the Preamble (default `local` if none was given):

> "Where should this config live — this repo (`local`) or your user config (`~/.claude`, portable across repos)? [local]"

Bind the answer to `scope` (overrides the Preamble pre-fill on disagreement). Re-ask on any value other than `local`/`user`.

**Catalog questions (Tier-0)**

| Point | Question (default from probe) | Emits |
|---|---|---|
| skip | "Drop any phases from the default walk? List phase ids (comma-separated), or leave empty." | `pipeline.skip: […]` |
| model | "Route any agent to a different model tier? (e.g. `reviewer=opus`, `fallback=haiku`; leave empty to use defaults)" | `models.<agent>` (+ `models.fallback`) |
| gate | "Test/gate command?" (default = `testCmd` from probe, or ask explicitly if `testCmd: null` — see note below) | `gates.part` and/or `gates.phase` |
| execution | "Run any phase inline (in-session) rather than as a spawned agent? List `<phase>=inline` or `<phase>=agent`, or leave empty." | `phases.<id>.execution` |
| profile | "Whole-flow execution mode? (`full` / `lean` / `solo`, or leave empty for default)" | `pipeline.profile` |
| harness | "Declare validation/architecture techniques for this repo? (e.g. `validation.techniques: [lint, typecheck]`, or leave empty to rely on convention discovery)" — when `harnessTechniques` is empty, note: "no harness techniques discovered; phases will derive or no-op at runtime" | `phases.<phase>.harness.*` |
| backlog | "Use a tracker? (`file` with a path, `custom` with a label, or leave empty)" | `backlog: { source, ref }` |
| memory | "Enable per-repo advisory memory? (`file` for default location, `custom` with a path, or leave empty)" | `memory: { source, ref }` |
| policy | "Permission posture for outward actions? (e.g. `always: [commit, push]`, `ask: [propose]`, `never: [external-send]`)" — skip or note "no remote found; propose/integrate will no-op" if `hasRemote: false` | `policy: { always?, ask?, never? }` |

**Catalog questions (Tier-1)**

| Point | Question (default from probe) | Emits |
|---|---|---|
| context | "House-rules file to inject globally or per-phase? (e.g. `docs/rules.md` globally, or `implementation=docs/impl-rules.md`)" | `context: <path>` / `phases.<id>.context` |
| override | "Replace any phase's procedure body with your own file? (e.g. `implementation=.claude/my-impl.md`)" | `phases.<id>.override` |
| role / procedure | "Swap any phase's agent role or orchestrating skill? (e.g. `implementation.role=my-coder`)" | `phases.<id>.role` / `phases.<id>.procedure` |
| insert | "Insert a new phase? (leave empty to skip, or answer the sub-questions below)" — if the user wants to insert, drive the lettered sub-interview: | `pipeline.insert: [...]` |

  - **(a) command** — "What does the phase run — a skill/command (worker step), or a shell check?" → worker emits `procedure: <skill>`; check emits `gate: <command>`.
  - **(b) position** — "After which existing phase should it run?" (offer the resolved phase-id list) → emits `after: <id>`.
  - **(c) does-it-block** — "Should a failure block the pipeline (hard gate) or be advisory?" → blocking shell check emits `gate`; advisory emits no gate.

  Emit the **flat** shape (`after`/`id` as siblings of the phase fields — the nested `phase:{}` form is rejected at manifest-lint):

  ```yaml
  pipeline:
    insert:
      - after: <id>     # after/id are SIBLINGS of the phase fields, not a wrapper
        id: <id>
        procedure: <command>  # present when a worker step
        gate: <command>       # present when a blocking shell check
  ```

  No `archetype` key — narrate the inference outcome: "no archetype needed — craft will infer `harness|construction` from your gate/produces" so the collapsed descriptor stays legible.
| DoD | "Point at a Definition-of-Done artifact? (file path)" | `paths.dod` |

**No-test-command edge:** When `testCmd: null`, the gate question has no default. Surface a clear warning:

> "No test command was discovered. A manifest without a gate command will cause craft to refuse to run at the gate-floor. Please provide an explicit gate command, or leave empty and understand the run will be blocked."

Do not emit a silently-unrunnable manifest — make the consequence explicit.

After all questions are answered, present a brief summary of non-empty choices and ask:

> "Proceed to generate the manifest with these settings? (yes / edit)"

On "edit": re-ask any question the user specifies. On "yes": proceed to Step 2.

If the user aborts at any point: leave the repo unchanged (no temp file, no landed file), and stop.

---

### Step 2 — Emit

Assemble the `Answers` object from the interview responses. Write it to a temp JSON file:

```bash
answers_tmp="$(mktemp /tmp/craft-init-answers.XXXXXX)"
```

Write the collected answers as a JSON object to `$answers_tmp`.

Ensure the CHOSEN destination's `.claude/` exists, then invoke the emitter, writing to an UNPREDICTABLE temp file created with `mktemp` inside that same directory (never a guessable PID-based name):

```bash
dest_claude_dir=".claude"; [ "$scope" = "user" ] && dest_claude_dir="$HOME/.claude"
mkdir -p "$dest_claude_dir"
manifest_tmp="$(mktemp "${dest_claude_dir}/.craft-${name}.tmp.XXXXXX")"
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-emit.js" "$answers_tmp" "$manifest_tmp"
```

`$name` here is the kebab name already validated in the Preamble, so the `mktemp` template is safe; `mktemp` then makes the suffix unpredictable and creates the file with `O_EXCL`, closing the TOCTOU window between lint and move (both inside Step 3) — nothing can swap the linted bytes before the move. Reuse `$manifest_tmp` verbatim in Step 3 — never re-splice `$name` into a later path.

The temp manifest is written inside the CHOSEN destination's `.claude/` — this is load-bearing: `manifest-lint`'s `fileExists` ROOT resolves to `dirname(dirname(manifestAbsPath))` = the destination root (the repo root for `local`, `$HOME` for `user`), so ref-existence checks (context files, DoD path, etc.) resolve exactly where the landed file will live. For `user` scope this means a repo-relative ref fails lint at `$HOME` by design — a user-scope config must be self-contained.

On non-zero exit from the emitter: STOP — surface stderr; remove `$answers_tmp` and `$manifest_tmp`; nothing lands.

Remove `$answers_tmp` after the emitter exits (whether success or failure). On any non-landing exit from here on, also remove `$manifest_tmp` so no stray temp is left behind.

**`.claude/` unwritable:** if the write fails at any point, STOP — report the path and reason; no partial file is left.

---

### Step 3 — Land (lint-then-move)

Run the deterministic land helper, which lints the temp file and moves it atomically only on a clean lint:

```bash
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js" "$manifest_tmp" "$name" --scope "$scope"
```

Pass `$name` and `$scope` — NOT `$manifest_final`; `init-land` re-derives the destination itself from the same validated kebab name. The helper lints `$manifest_tmp` first; only on exit 0 does it rename the temp into place (a POSIX atomic rename on the same filesystem). The live `.claude/workflow.md` is never touched.

When `scope` is `user` and a local `.claude/craft-<name>.md` already exists, `init-land` emits a shadow-warning on stderr — the move still proceeds (different path, no overwrite of the local file). Surface this warning to the user.

**Non-zero exit:** STOP — surface the stderr diagnostic; remove `$manifest_tmp` if it still exists; nothing lands; any prior `craft-<name>.md` at the destination scope is untouched byte-for-byte.

**Exit 0:** the config is in place at the chosen scope and lints clean. Proceed to Done.

Never swallow a lint failure; the helper ensures the move never occurs unless lint exits 0.

---

### Done

Report:

- Landed path: `.claude/craft-<name>.md` (local) or `~/.claude/craft-<name>.md` (user)
- Scope: `$scope`
- Status: lints clean
- Next step: `/craft:run --config <name> <brief>`

---

## Error semantics

| Failure | Behaviour |
|---|---|
| Invalid name (path separator, traversal, uppercase, empty) | STOP; surface the `init-config.js` diagnostic; do not proceed |
| Emitter exits non-zero | STOP; surface stderr; remove temp answers JSON; nothing lands |
| Temp manifest fails lint | STOP; surface `manifest-lint` diagnostic block; remove `$manifest_tmp`; prior same-name file untouched |
| `.claude/` unwritable | STOP; report path + reason; no partial file |
| Interview aborted | Leave repo unchanged; no temp; no landed file |
| Re-run for existing name | Direct overwrite after a clean lint; only that named file is replaced; other `.claude/craft-*.md` and `.claude/workflow.md` untouched |
| Probe error (e.g. git absent) | Degrade that dimension to a question; never abort the full probe |
| No discoverable test command | Ask for an explicit gate command; warn about the gate-floor consequence; do not emit a silently-unrunnable manifest |
| User scope + ref-bearing config (e.g. `context: <path>`) | Lint REJECTS before the move — a user-scope config must be self-contained; nothing lands at `~/.claude` |
| User scope + local same-name config present | Shadow warning surfaced on stderr; the config still lands at `~/.claude` (advisory, no overwrite of the local file) |
