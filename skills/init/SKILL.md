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

If `$ARGUMENTS` is non-empty, treat it as the candidate `<name>`. Otherwise hold name until the interview's first question.

When a candidate name is available, validate it immediately and bind BOTH the name and the resolved path to shell variables — every later step reuses these, and the path is NEVER reconstructed from the raw name:

```bash
name="<the candidate name>"
manifest_final="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-config.js" "$name")"
```

- Exit 0: the name is valid; `$manifest_final` holds the resolved, validated path (e.g. `.claude/craft-<name>.md`). Reuse `$manifest_final` verbatim in Step 4 — never splice the raw name into a later path.
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

### 5. Mutation and architecture tool presence

- `mutationTool`: check for a Stryker config file (e.g. `stryker.config.js`, `stryker.config.mjs`, `stryker.config.cjs`, `.strykerrc.json`, `.strykerrc.js`). Set `'stryker'` if any found, else `null`.
- `archTool`: check for a dependency-cruiser config (`.dependency-cruiser.js`, `.dependency-cruiser.cjs`, `.dependency-cruiser.mjs`, `.dependency-cruiser.json`). Set `'dependency-cruiser'` if any found, else `null`.

### 6. Existing named configs

```bash
ls .claude/craft-*.md 2>/dev/null
```

Capture matching filenames; extract the name segment from each (strip `.claude/craft-` prefix and `.md` suffix). Store as `existingNames[]`.

**State-mutating probes** (if any are later needed) must run in a `mktemp` throwaway directory — never against the working tree.

**CapabilityReport shape (immutable once built):**

```
{
  ecosystem:     string | null,
  lockfile:      string | null,
  testCmd:       string | null,
  hasRemote:     boolean,
  mutationTool:  'stryker' | null,
  archTool:      'dependency-cruiser' | null,
  existingNames: string[],
}
```

---

## Procedure

### Step 1 — Interview (interactive)

Drive `AskUserQuestion` over the full Tier-0/1 catalog below, one question per point, defaults pre-filled from the CapabilityReport. A point the probe rules out is either skipped or asked with a "this will no-op in your repo" note — never silently dropped.

**Name (if not yet validated)**

If no valid name was supplied in `$ARGUMENTS`, ask:

> "What name should this customization have? (kebab-case, e.g. `ci` or `strict-review`)"

Validate immediately and bind the same shell variables the Preamble does — so `$manifest_final` is captured on this deferred path too (Step 4 reuses it):

```bash
name="<the answer>"
manifest_final="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-config.js" "$name")"
```

On non-zero: explain the constraint and re-ask.

**Catalog questions (Tier-0)**

| Point | Question (default from probe) | Emits |
|---|---|---|
| skip | "Drop any phases from the default walk? List phase ids (comma-separated), or leave empty." | `pipeline.skip: […]` |
| model | "Route any agent to a different model tier? (e.g. `reviewer=opus`, `fallback=haiku`; leave empty to use defaults)" | `models.<agent>` (+ `models.fallback`) |
| gate | "Test/gate command?" (default = `testCmd` from probe, or ask explicitly if `testCmd: null` — see note below) | `gates.part` and/or `gates.phase` |
| execution | "Run any phase inline (in-session) rather than as a spawned agent? List `<phase>=inline` or `<phase>=agent`, or leave empty." | `phases.<id>.execution` |
| profile | "Whole-flow execution mode? (`full` / `lean` / `solo`, or leave empty for default)" | `pipeline.profile` |
| harness | "Tune review or validation rigor? (e.g. dimensions, passes, max_cycles for a phase)" — skip if both `mutationTool` and `archTool` are null (note: "no harness tooling detected; this will no-op") | `phases.<phase>.harness.*` |
| backlog | "Use a tracker? (`file` with a path, `custom` with a label, or leave empty)" | `backlog: { source, ref }` |
| memory | "Enable per-repo advisory memory? (`file` for default location, `custom` with a path, or leave empty)" | `memory: { source, ref }` |
| policy | "Permission posture for outward actions? (e.g. `always: [commit, push]`, `ask: [propose]`, `never: [external-send]`)" — skip or note "no remote found; propose/integrate will no-op" if `hasRemote: false` | `policy: { always?, ask?, never? }` |

**Catalog questions (Tier-1)**

| Point | Question (default from probe) | Emits |
|---|---|---|
| context | "House-rules file to inject globally or per-phase? (e.g. `docs/rules.md` globally, or `implementation=docs/impl-rules.md`)" | `context: <path>` / `phases.<id>.context` |
| override | "Replace any phase's procedure body with your own file? (e.g. `implementation=.claude/my-impl.md`)" | `phases.<id>.override` |
| role / procedure | "Swap any phase's agent role or orchestrating skill? (e.g. `implementation.role=my-coder`)" | `phases.<id>.role` / `phases.<id>.procedure` |
| insert | "Insert a new phase? (provide a descriptor object or leave empty)" | `pipeline.insert: [...]` |
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

Invoke the emitter, writing to an UNPREDICTABLE temp file created with `mktemp` inside `.claude/` (never a guessable PID-based name):

```bash
manifest_tmp="$(mktemp ".claude/.craft-${name}.tmp.XXXXXX")"
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-emit.js" "$answers_tmp" "$manifest_tmp"
```

`$name` here is the kebab name already validated in the Preamble, so the `mktemp` template is safe; `mktemp` then makes the suffix unpredictable and creates the file with `O_EXCL`, closing the TOCTOU window between lint (Step 3) and move (Step 4) — nothing can swap the linted bytes before the move.

The temp manifest is written inside `.claude/` — this is load-bearing: `manifest-lint`'s `fileExists` ROOT resolves to `dirname(dirname(manifestAbsPath))` = the repo root, so ref-existence checks (context files, DoD path, etc.) resolve correctly from the temp sibling just as they would from the final `.claude/craft-<name>.md`.

On non-zero exit from the emitter: STOP — surface stderr; remove `$answers_tmp` and `$manifest_tmp`; nothing lands.

Remove `$answers_tmp` after the emitter exits (whether success or failure). On any non-landing exit from here on, also remove `$manifest_tmp` so no stray temp is left behind.

**`.claude/` unwritable:** if the write fails at any point, STOP — report the path and reason; no partial file is left.

---

### Step 3 — Temp-lint

Run manifest-lint against the temp file:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/manifest-lint.sh" "$manifest_tmp"
```

**Non-zero exit:** STOP — surface the full `manifest-lint` diagnostic block; remove `$manifest_tmp`; nothing lands; any prior `.claude/craft-<name>.md` is untouched byte-for-byte.

**Exit 0:** proceed to Step 4.

Never swallow a lint failure.

---

### Step 4 — Land (atomic move)

Move the temp file into place, reusing the validated `$manifest_final` from the Preamble — never reconstruct the path from the raw name:

```bash
mv "$manifest_tmp" "$manifest_final"
```

`mv` within `.claude/` on the same filesystem is atomic (a POSIX `rename`), and `$manifest_final` is the exact path `init-config.js` resolved — the bytes that passed lint are the bytes that land. The live `.claude/workflow.md` is never touched.

---

### Done

Report:

- Landed path: `.claude/craft-<name>.md`
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
