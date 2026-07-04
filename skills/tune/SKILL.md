---
name: tune
description: Propose a manifest patch to a named craft config from machine-derived usage signals, landed by you through the same lint-then-move path craft:init uses. Triggers — "craft:tune", "tune a craft config", "propose config improvements from metrics", "close the metrics improvement loop".
argument-hint: <name> [--report <path>]
---

# craft:tune — feedback-driven config tuner (propose-diff)

Standalone session-owned skill. You (the session) read the usage signals the miner
already produced, ask the plan computer for a proposed patch to a NAMED config, present
the diff, and land it through the existing lint-then-move bin only after you confirm with
the user. No worker agent is spawned. This is the ACTING half of the observe→improve loop:
`craft:metrics` mines (read-only); `craft:tune` acts. It NEVER touches `.claude/workflow.md`
and NEVER auto-applies — the human confirm is the gate.

Input: `$ARGUMENTS` — `<name>` (required), plus optional `--report <path>`.

---

## Preamble — probe + resolve (read-only)

### 1. Plugin root

Confirm both entrypoints this skill composes exist:

```bash
test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/tune-plan.js"
test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js"
```

If either test fails, surface a diagnostic and stop — the plugin installation is incomplete.

Parse `$ARGUMENTS`:

- `<name>` — required. Absent ⇒ STOP: "a config name is required".
- `--report <path>` — optional. Default `report.json` at the repo root.

### 2. Report presence (the acting precondition)

The tuner acts on the miner's output; it does not mine transcripts itself.

```bash
report="${report_arg:-report.json}"
test -f "$report"
```

If the report is absent, STOP: "no `report.json` found — run `/craft:metrics` first to mine
the usage signals this tuner acts on." This is the CQS boundary: observe (metrics) before act
(tune).

### 3. Base config resolution (two-scope)

Locate the named config to patch across local then user scope — the same resolver
`/craft:run --config` uses:

```bash
base="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/config-resolve.js" "$name")"
```

Non-zero exit ⇒ STOP — surface the stderr diagnostic verbatim (the resolver names both scopes
it looked in). The tuner patches an EXISTING named config; it never seeds a fresh one and never
falls back to `.claude/workflow.md`.

On exit 0, `$base` holds the absolute path of the resolved config. Derive its scope for the
land step: a path under `./.claude/` is `local`; a path under `~/.claude/` is `user`.

### 4. Memory (optional, advisory)

If `.claude/craft-memory.md` exists, pass it so recurring high-confidence findings surface as
advisory rationale. Absent memory is not an error.

```bash
memory_flag=""
[ -f .claude/craft-memory.md ] && memory_flag="--memory .claude/craft-memory.md"
```

---

## Procedure

### Step 1 — Plan

Ask the plan computer for the proposed patch. Every decision — which signals map to which knob,
role recovery for routing, the repeated-auto-skip threshold, advisory-vs-patch — is made by
`tune-plan.js`, never re-derived here:

```bash
plan_out="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/tune-plan.js" "$base" "$report" $memory_flag)"
```

Non-zero exit ⇒ STOP — surface stderr verbatim. On exit 0, `$plan_out` is a JSON object with:

- `proposals` — the itemized diff: each `{ source, path, from, to, rationale, evidence }`. A
  `path` of `null` is an ADVISORY item (no knob) — surfaced, never landed.
- `patchedManifest` — the full manifest string to land (base frontmatter deep-merged with the
  auto-patch proposals, base prose preserved plus a tuned note).
- `hasPatch` — `true` when at least one auto-patch proposal exists.

### Step 2 — Present the diff

Present the proposals grouped as **auto-patch** (`path` non-null: `models.<role>` routing,
`pipeline.skip` drops) and **advisory** (`path` null: cache, review-cadence, drift, memory).
For each, show the `rationale` and the `from → to`. This is propose-diff: the config is not
changed yet.

If `hasPatch` is `false`, there is nothing to land. Record the greppable no-op token and stop —
exit 0, advisory (the `TUNE(<name>):` prefix is defined only here and stays out of the
phase-scoped `NO-OP(<phase>):` run-token family):

```
TUNE(<name>): no-op — no machine-derived signal crossed a knob threshold
```

Surface any advisory items anyway (they are worth a human read), then stop.

### Step 3 — Confirm (the gate)

Ask the user, via `AskUserQuestion`, whether to land the auto-patch proposals into the resolved
config. This confirm IS the gate — the tuner never auto-applies.

> "Land these <n> auto-patch proposals into `<base>`? (land / decline)"

On "decline": leave the repo unchanged; stop. On "land": proceed to Step 4.

### Step 4 — Land (lint-then-move)

Stage `patchedManifest` into a `mktemp` temp file created INSIDE the destination `.claude/` —
trailing-`X` template built only from the already-validated `$name` — then delegate the atomic
lint-then-move to the same bin `craft:init` uses:

```bash
dest_dir="$(dirname "$base")"
mkdir -p "$dest_dir"
manifest_tmp="$(mktemp "$dest_dir/.craft-${name}.tmp.XXXXXX")"
# write $plan_out's patchedManifest field to $manifest_tmp
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js" "$manifest_tmp" "$name" --scope "$scope"
```

`init-land.js` lints `$manifest_tmp` at the destination root before it moves anything, so a
patch that (for example) references a repo-relative path when landed at `~/.claude` is REFUSED —
a user-scope config must be self-contained. Reuse `$manifest_tmp` verbatim; `mktemp`'s
unpredictable suffix plus its `O_EXCL` creation closes the TOCTOU window between lint and move.

Non-zero exit ⇒ STOP — surface the `manifest-lint` diagnostic; remove `$manifest_tmp`; the prior
config is untouched byte-for-byte; nothing landed. The live `.claude/workflow.md` is never a
target.

---

### Done

On exit 0 from Step 4, report the greppable token (the same `TUNE(<name>):` prefix as the no-op
line — defined only here, it does not join the `skills/run/SKILL.md` run-token family):

```
TUNE(<name>): <n> proposals landed
```

Report the landed path (`$base`), its scope, that it lints clean, and the next step:
re-run `/craft:metrics` after a few runs and `/craft:tune <name>` again to confirm the patched
config moved the flagged economics.

---

## Error semantics

| Condition | Behaviour |
|---|---|
| Missing `<name>` | STOP: "a config name is required" |
| Absent `report.json` | STOP: direct the user to run `/craft:metrics` first — the tuner acts on the miner's output |
| No named config at either scope | STOP; `config-resolve.js` names both scopes it looked in; nothing touched |
| `tune-plan.js` non-zero | STOP; surface stderr; nothing staged |
| No auto-patch proposal (`hasPatch` false) | Record `NO-OP(tune)`; surface any advisory items; exit 0 |
| User declines at the confirm gate | Leave repo unchanged; nothing landed |
| Patched manifest fails lint | STOP; surface the `manifest-lint` diagnostic; remove `$manifest_tmp`; prior config untouched |
| Plugin root missing (`tune-plan.js` or `init-land.js` absent) | STOP; surface which entrypoint is missing; do not invoke either bin |
