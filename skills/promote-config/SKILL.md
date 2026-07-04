---
name: promote-config
description: Relocate a named craft config between scopes — promote local-scope to user-scope by default, or demote user-scope to local-scope with --demote. Triggers — "craft:promote-config", "promote a named config", "promote a craft config to user scope", "move a craft config to user scope", "demote a craft config to local scope".
argument-hint: <name> [--demote] [--force]
---

# craft:promote-config — relocate a named config between scopes

Standalone, session-owned skill. You (the session) ask the plan computer where the
config should go, stage the source bytes at that destination, land through the
existing lint-then-move bin, and finalize by removing the source. No worker agent is
spawned.

Input: `$ARGUMENTS` — `<name>` (required), plus optional `--demote` and `--force`.

This is a MOVE by default: the source is removed once the destination copy lands
clean, so the config lives at exactly one scope afterward, never both.

---

## Preamble — plugin-root probe (read-only)

Confirm both entrypoints this skill composes exist:

```bash
test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/promote-plan.js"
test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js"
```

If either test fails, surface a diagnostic and stop — the plugin installation is
incomplete.

Parse `$ARGUMENTS`:

- `<name>` — required. Absent ⇒ STOP: "a config name is required".
- `--demote` — direction flag. Absent ⇒ promote (local→user, the default). Present
  ⇒ demote (user→local).
- `--force` — overwrite flag, forwarded verbatim when the caller supplied it.

---

## Procedure

### Step 1 — Plan

Every decision — direction, source-existence, destination-exists refuse-vs-force,
and `$HOME`-containment — is made by `promote-plan.js`, never re-derived here:

```bash
plan_out="$(node "${CLAUDE_PLUGIN_ROOT}/engine/bin/promote-plan.js" "$name" [--demote] [--force])"
```

(append `--demote` and/or `--force` only when the caller passed them).

Non-zero exit ⇒ STOP — surface the stderr diagnostic verbatim (no source config to
relocate, a destination that already exists without `--force`, a `$HOME`
containment escape, or an invalid name). Nothing is touched.

On exit 0, parse the three `key=value` lines from `$plan_out`:

```
source=<absolute source path>
dest=<absolute destination path>
scope=<user|local — the destination scope>
```

Bind `source`, `dest`, `scope` from these lines.

### Step 2 — Stage

Ensure the destination directory exists, then copy the source bytes into a
`mktemp` file created INSIDE that same directory — trailing-`X` template built
only from the already-validated `$name`:

```bash
dest_dir="$(dirname "$dest")"
mkdir -p "$dest_dir"
manifest_tmp="$(mktemp "$dest_dir/.craft-${name}.tmp.XXXXXX")"
cp "$source" "$manifest_tmp"
```

Reuse `$manifest_tmp` verbatim from here on — never re-splice `$name` into a fresh
path. `mktemp`'s unpredictable suffix plus its `O_EXCL` creation is what closes the
TOCTOU window between lint and move.

### Step 3 — Land

Delegate the atomic lint-then-move to the existing land bin — the same one
`craft:init` uses:

```bash
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/init-land.js" "$manifest_tmp" "$name" --scope "$scope"
```

`init-land.js` lints `$manifest_tmp` at the destination root before it moves
anything, so a config referencing a repo-relative path (e.g. `context: docs/x.md`)
is REFUSED when promoted to `~/.claude` — a user-scope config must be
self-contained.

Non-zero exit ⇒ STOP — surface the stderr diagnostic; remove `$manifest_tmp`; the
source is untouched (the relocation never reaches Step 4).

### Step 4 — Finalize (move)

On exit 0 from Step 3, the destination copy already lints clean and is in place.
Remove the source so the config lives at exactly one scope:

```bash
rm "$source"
```

Report the relocation with the greppable token (defined ONLY here — it does not
join the `skills/run/SKILL.md` token family):

```
PROMOTE-CONFIG(<name>): local→user
```

or, for a `--demote` run:

```
PROMOTE-CONFIG(<name>): user→local
```

---

## Error semantics

| Condition | Behaviour |
|---|---|
| Missing `<name>` | STOP: "a config name is required" |
| No source config at the from-scope | STOP; `promote-plan.js` names the missing scope and name on stderr; nothing touched |
| Destination already exists, no `--force` | STOP; `promote-plan.js` refuses with a destination-exists diagnostic naming the `--force` escape hatch |
| Destination already exists, `--force` passed | Land proceeds; `init-land.js`'s atomic rename overwrites the prior destination file |
| Source or destination user-scope path escapes `$HOME` containment | STOP; `promote-plan.js` reports a containment failure; nothing touched |
| Ref-bearing / non-portable source config | `init-land.js` REFUSES at the destination lint before any move; `$manifest_tmp` is removed; source is untouched |
| Plugin root missing (`promote-plan.js` or `init-land.js` absent) | STOP; surface which entrypoint is missing; do not invoke either bin |
