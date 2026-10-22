# Design — codex 0.163.0 re-probe: skills by reference still fail, binding re-pinned 0.162.1 → 0.163.0

> Brief: re-probe the codex binding on codex-cli 0.163.0. The BACKLOG group B entry "Prove craft's
> shared skills load by reference on codex" says to re-check on the next minor version. Find out
> whether 0.163.0 loads the shared skills by reference, and re-pin the binding from 0.162.1 to
> 0.163.0 whichever way it comes out. Where it is cheap and offline, also re-check that
> `unified_exec_tty = false` still closes `write_stdin` and that a malformed `craft.rules` makes
> `codex exec` fail closed. If either has changed, surface the evidence; do not fold it in
> silently. Decision point the user reserved: if by-reference loading still fails, the entry
> stays OPEN, the docs re-pin to 0.163.0, and the symlink fallback stays documented as required.
> Status: draft → self-reviewed ×3

---

## Context

The orchestrator ran the probe live on 2026-10-22 (Paris 11:49–12:05; UTC 09:49–10:05). **This
design records that evidence and does not re-derive it. No part of it is designed from memory of
codex, and the designer ran no codex command.** The designer added read-only repo facts only: git
history, file contents, and greps.

**Outcome: codex behaviour did not change on any row that was re-observed.** This is a docs,
comment and test-title change. No behaviour in `src` changes and no decision changes, so no ADR
is needed.

### Pinned matrix — codex-cli 0.163.0, 2026-10-22

**Method.** Throwaway `HOME`/`CODEX_HOME` homes made with `mktemp`: one for probe A, and one per
case for probes C. No `auth.json` was copied into any of them, and no step needed auth. Probes B
and D reuse the 2026-10-16 *load detector*: with no credentials, codex either prints
`Error loading rules:` and exits, or reaches the session header and enters a reconnect loop. C
and E use the offline fake Responses provider. C ran with `--dangerously-bypass-hook-trust`
**inside its throwaway only**, so that its dumping hook would fire. E never used that flag.

**Isolation: one breach, disclosed.** `find ~/.codex -newer <marker>` returned **5 entries**, all
under `~/.codex/tmp/arg0-macos/codex-arg0<random>/`: the directory, a `.lock`, and the
`apply_patch` and `applypatch` symlinks. The cause was reproduced: one `codex exec --help` call,
used to read the flag list, ran **without** the throwaway env. Run against an existing
`CODEX_HOME`, `codex exec --help` creates exactly that 5-entry shape. No config, auth, sqlite,
session or log file under `~/.codex` changed. Every other probe invocation was wrapped, and each
throwaway grew its own `tmp/arg0-macos` (8004 entries in probe A's throwaway). This is the failure
that the record's open-rows method note (L324–328) already warns about: wrap every invocation,
bare `--help` included.

| # | Probe | Observation (0.163.0) | Verdict |
|---|---|---|---|
| 1 | Identity | `codex --version` = `codex-cli 0.163.0`. npm `@openai/codex` 0.163.0, platform package `0.163.0-darwin-arm64`. Vendored binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`, the same layout as before | CONFIRMED |
| 2a | `craft` entry, committed marketplace | `codex plugin add craft@craft-codex-marketplace` → `Error: plugin \`craft\` was not found in marketplace \`craft-codex-marketplace\``. This is expected: the `craft` entry was retired on 2026-10-18 | n/a (repo change, not codex) |
| 2b | Throwaway `craft` entry | The throwaway got a copy of `adapters/codex` + `skills/`, with the pre-retirement `marketplace.json` and `plugins/craft/plugin.json` (`"skills": "../../../../skills"`) restored from `eab55ee^`. This is the re-measure route the retirement decision names. `marketplace add ./adapters/codex`, then `plugin add` for `craft-codex@…` and `craft@…`: both succeed | CONFIRMED |
| 2c | Cached manifests | The cached `.codex-plugin/plugin.json` for **both** entries is `{description, name}`: `skills` and `hooks` dropped | UNCHANGED vs 0.162.1 |
| 2d | Skills by reference | App-server `skills/list` with `{cwds:[<repo copy>], forceReload:true}`, 3/3: 6 in total, **0 of 20** shared (`craft-codex:craft-run` at scope user, plus 5 system skills) | DISPROVEN |
| 2e | Symlink fallback | `ln -s <worktree>/skills/<name> $CODEX_HOME/skills/<name>` ×20, `skills/list` 3/3: 26 in total, **20 of 20** shared, registered `craft:<name>` at scope user, paths resolving into the repo (e.g. `…/skills/lessons/SKILL.md`) | CONFIRMED |
| 2f | `forceReload` | Present in the generated schema (`codex app-server generate-json-schema`) | CONFIRMED (schema) |
| 3 | Malformed rules, `codex exec` | `craft.rules` minus its last line `)` placed in `$CODEX_HOME/rules/`. `codex exec --skip-git-repo-check -s read-only -C <work> "say hi" < /dev/null`, 3/3: exit 1 at startup, `Error loading rules:` / `<path>:17: starlark error: … Parse error: unexpected new line, expected expression`, no session header. Control (committed copy): no rules error, session header reached | **FAILS CLOSED**, unchanged |
| 4 | Symlinked rules file | `$CODEX_HOME/rules/craft.rules` is a symlink to the malformed copy, 3/3: no rules error, session header reached | **NOT LOADED**, unchanged |
| 5a | Tool list, default config | Identical to the 0.162.1 row: `exec_command(cmd\|justification\|login\|max_output_tokens\|prefix_rule\|sandbox_permissions\|shell\|tty\|workdir\|yield_time_ms)`, `write_stdin(chars\|max_output_tokens\|session_id\|yield_time_ms)`, `request_user_input`, `apply_patch`, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search` | UNCHANGED |
| 5b | `write_stdin`, default config | `exec_command {cmd:"sh", tty:true}`, then `write_stdin` sends `echo WS_MARKER > ws_marker.txt\nexit\n`: the marker is **present**. The hook fired once (`Bash {"command":"sh"}`) and not at all for `write_stdin` | unguarded, unchanged |
| 5c | `[features] unified_exec_tty = false` | 3/3: `tty` is absent from the `exec_command` schema. A forced `tty:true` → `TTY execution is disabled by config; omit \`tty\` or set it to false.`; marker absent; hook fired first | **CLOSED**, unchanged |
| 5d | Non-tty session | `exec_command {cmd:"sleep 2; sh", yield_time_ms:500}`, then `write_stdin` → `stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`, marker absent. Same result with tty off and with the default config | CONFIRMED |
| 5e | Hook payload keys | `cwd, hook_event_name, model, permission_mode, session_id, tool_input, tool_name, tool_use_id, transcript_path, turn_id`, the same set as `adapters/codex/test/fixtures/pre-tool-use-bash.json`. `tool_name` is `Bash` and `tool_input` is `{command}`. Values were not compared | key set UNCHANGED |
| 6a | Untrusted hook | Template `[[hooks.PreToolUse]]` block verbatim, `CRAFT_ROOT=<worktree>`, no bypass flag. `trust-hook.js --check` → exit 1, `from=untrusted`. The fake model asks for `git diff > OUT.txt`. 3/3: `OUT.txt` **present** (83 B), zero hook items, 2 `command_execution` items | fail-open REPRODUCED |
| 6b | Trusted control | `trust-hook.js` → exit 0, `from=untrusted hash=sha256:38713365…` (the 0.161.0 and 0.162.1 hash). The same turn → `OUT.txt` absent, zero `command_execution` items, `blocked by PreToolUse hook: craft-guard: git diff/show must carry --no-ext-diff …` | denied |

**Not re-probed** (they need auth or an attended session), so they keep their 0.162.1 pins: the
app-server and TUI malformed-rules fail-open, the hook timeout and default-timeout rows, the
`-c features.unified_exec_tty=false` launch flag, the project-config override, trust `--check`
idempotence and ALLOW, the `execpolicy check` and `cmp` rows, the `unified_exec` and `shell_tool`
switches, the tool shell, and the heredoc idiom.

### Facts found while mapping the change (each with its proof)

- **The shared skill set is now 20, not 19.** `ls skills | wc -l` = 20. `skills/lessons` arrived
  in `c92c81d` (2026-10-20), after the 0.162.1 probe. The 0.145.0 and 0.162.1 measurements were
  taken against 19 and stay 19. The current-state surfaces still read 19, so they went stale when
  `skills/lessons` landed: `adapters/codex/README.md` L48 and L53–54, and `adapters/README.md` L34.
- **The throwaway `craft` entry is the route already decided, not an improvisation.** ADR-635
  (*Consequences*): "Re-measuring by-reference loading on a later codex … builds a throwaway entry
  with an out-of-tree `skills` reference in the probe's throwaway environment. None ships." The
  restored `eab55ee^` files carry exactly `"skills": "../../../../skills"` (checked with
  `git show eab55ee^:adapters/codex/plugins/craft/plugin.json`). The README already describes the
  measurement as "with such an entry installed" (L52–53) and names no `craft` entry anywhere
  (L23–29). The `PLUGIN_ADD_SELECTOR` pin (`native-surface.test.js` L59, L188–195) forbids
  documenting `codex plugin add craft@…` in the README.
- **The brief's "keep 0.162.1" list for README L217 is half false.** L217 says: "On codex 0.162.1
  the outcome depends on how codex is driven: `codex exec` … refuses to start …; the app-server …
  runs the command anyway". Probe 3 re-observed the `codex exec` half on 0.163.0. The app-server
  and TUI halves were not re-probed (candidate 6).
- **README L200 mixes one re-observed claim and one claim that was not re-observed.** It says
  "closed on 0.162.1 by the template's `unified_exec_tty = false` **and** the launch flag".
  Probe 5c re-observed the template key; the launch flag was not re-probed.
- **Two more living surfaces pin 0.162.1 for rows 0.163.0 re-observed, and the brief does not list
  them.** One is `docs/contributing/specs/gate.md` L275–281: `write_stdin` closed by the template
  key and the flag, "(offline probe 2026-10-18, 0.162.1)". The other is two open BACKLOG entries:
  the malformed-rules entry (L202–225; its `codex exec` half re-observed, probe 3) and the hook-trust
  entry under `### Open (scoped 2026-07-20 …)` (L1392; its last bullet, L1429, re-confirms on 0.162.1,
  and probe 6 re-observed fail-open plus trust-write and BLOCK). See candidate 4.
- **The payload pins describe a byte capture; 0.163.0 compared keys only.** The fixture
  `pre-tool-use-bash.json` holds 0.162.1 values (`"model":"gpt-5.4"`,
  `"permission_mode":"bypassPermissions"`). Probe 5e compared the key set, not the values. See
  candidate 5.
- **No test pins a codex version or the number 19.** `grep` over `adapters/codex/test/*.test.js`
  and `test/*.test.js` finds one version string, the describe title at
  `git-guard-adapter.test.js:337`, and no skill count. The README honesty pins
  (`native-surface.test.js` L356–) match `fail open`, `refuses? to start`, `$CODEX_HOME/skills`,
  `SKILLS_SYMLINK_LINE`, `silently no-ops`, and the Guard-section sentence predicates (L558–582:
  a sentence with `write_stdin` + `reopens`; a sentence with `.codex/config.toml` +
  `unified_exec_tty = true`). None of them reads a version or a count.

### Constraints already decided

- **ADR-320**: the record appends a dated `## Re-probe — codex-cli 0.163.0` section. Only rows
  re-observed on 0.163.0 are re-labelled elsewhere, and the older pin stays beside the new one.
  Rows that were not re-probed keep their pins.
- **ADR-635**: the marketplace declares `craft-codex` only. A by-reference re-measure uses a
  throwaway entry that never ships. The README must not gain a `craft@` install line (pinned by
  `PLUGIN_ADD_SELECTOR`).
- **ADR-614 carried forward by ADR-635**: the shared skills load through the `$CODEX_HOME/skills`
  symlinks on every install, and `adapters/codex/skills/` must not exist. By-reference loading
  still fails (2d), so nothing reopens this.
- **ADR-574**: a malformed rules file is treated as fail open, and its status is split by surface.
  Probe 3 re-confirms the `codex exec` half only. The posture wording and the `/fail open/i` and
  `/refuses?\s+to\s+start/i` pins stay.
- **ADR-601 / ADR-604**: copy, never symlink, `craft.rules`. Rules-deploy observations go in the
  record. Probe 4 re-confirms "not loaded" and lands in the record.
- **ADR-642**: the binding disables tty sessions (template key + launch flag). Unchanged.
- **Identity rows re-pin when observed** (the 0.145.0 and 0.162.1 precedent). Record L17, L18, L19
  and L21 re-pin to 0.163.0.
- **History is not edited.** ADRs, designs and plans keep their 0.162.1 and "19" text (ADR-635
  itself says "The 19 shared skills"). So do BACKLOG *delivered* entries (L346, L406, L494–521).
- **README corpus counts are gated.** This design's commit bumps `README.md` L226 design docs
  92 → 93. The plan commit bumps its own count.

## Requirements

1. `docs/contributing/specs/codex-poc-record.md` gains `## Re-probe — codex-cli 0.163.0` after the
   0.162.1 section's closing paragraph (end of file, after L601). It holds the method (breach
   included, bypass-flag use stated per probe) and rows 1–6b, each marked `(0.163.0)`. Elsewhere,
   only re-observed rows gain a 0.163.0 label, and the old pin stays.
2. The method paragraph states the isolation breach as observed: 5 entries under
   `~/.codex/tmp/arg0-macos`, the reproduced cause, and nothing else changed. It must not claim
   `find -newer` = 0.
3. The record and the new BACKLOG paragraph say that the `craft` entry was rebuilt as a throwaway
   from `eab55ee^`, on the route the retirement decision names, and that `plugin add craft@…`
   fails on the committed marketplace. Exact wording per candidate 3.
4. `adapters/codex/README.md` re-pins L32, L48–54, L119, L129 and L200. Each line names 0.163.0
   only for the half it re-observed. The "symlink route required" sentence stays word for word
   (subject to candidate 1). L41, L136, L140, L178, L208, L213 and L234 keep their pins. L217
   follows candidate 6. The 19 → 20 reading follows candidate 2.
5. `BACKLOG.md` by-reference entry (L227–253): the title re-pins to `re-probed 2026-10-22 …
   (codex-0.163.0 limitation)`, a `**Re-probe on 0.163.0 (2026-10-22): …**` paragraph is
   appended, and the 0.144.6, 0.145.0 and 0.162.1 paragraphs stay verbatim. The entry status
   follows candidate 1. Other entries follow candidate 4.
6. The code pins follow candidate 5. No assertion and no behaviour changes.
7. Every committed artifact uses repo-relative paths and placeholders (`<throwaway>`,
   `<worktree>`, `<repo copy>`, `<path>`). It never uses a home-rooted path. `~/.codex` stays as
   the generic name of codex's default home, as the record already uses it.
8. `bash scripts/ci.sh` is green at every commit.

## Design

Four parts, one atomic commit each, in this order so that every doc cites a record that already
exists. No part adds a doc, so no part moves the README corpus counts.

### Part 1 — `docs/contributing/specs/codex-poc-record.md`: record the 0.163.0 re-probe

**Context block**: the exact rows in play.

| Location | Current | Change |
|---|---|---|
| L17 | `codex-cli 0.162.1` (was `codex-cli 0.145.0`) / CONFIRMED (0.162.1; first pinned 0.145.0) | `codex-cli 0.163.0` (was `0.162.1`, `0.145.0`) / CONFIRMED (0.163.0; first pinned 0.145.0) |
| L18 | `@openai/codex@0.162.1`, platform `0.162.1-darwin-arm64` | `0.163.0` / `0.163.0-darwin-arm64`, same pin form |
| L19 | CONFIRMED (re-confirmed 0.162.1) | add `; re-confirmed 0.163.0` |
| L21 | "Observed on 0.145.0; unchanged on 0.162.1." | "…; unchanged on 0.162.1 and 0.163.0." |
| L51–53 | scope sentence lists `(0.145.0)`, `(0.161.0)` or `(0.162.1)` | add `(0.163.0)` |
| L115 | DISPROVEN (0.145.0; re-confirmed 0.162.1) | append the sentence "Re-confirmed on 0.163.0 against the then 20 shared skills: 0 of 20 versus 20 of 20." Status `(0.145.0; re-confirmed 0.162.1, 0.163.0)` |
| L117 | "re-exercised 0.162.1 with `./adapters/codex`" | add "; re-exercised 0.163.0 with the `craft` entry rebuilt as a throwaway (wording per candidate 3)" |
| L140 | `(0.144.6; re-confirmed 0.145.0; re-confirmed 0.162.1)` | add `; re-confirmed 0.163.0` |
| L141 | "re-exercised 0.162.1 via `bin/trust-hook.js`, byte-identical re-run" | add "; trust write re-exercised 0.163.0 (same hash). Idempotence not re-run" |
| L191 | the malformed-rules paragraph resolved on 0.162.1 | append: "`codex exec` refusal re-confirmed on 0.163.0 (3/3); the app-server and TUI paths were not re-probed." |
| L317 heading | "…; rows 0, 1, 3: revisited 2026-10-15 on 0.162.1)" | add "; rows 0, 1, 3: revisited 2026-10-22 on 0.163.0" |
| L321–328 | paragraph and method note | add one sentence naming `Re-probe — codex-cli 0.163.0`. After the method note, add: "On 2026-10-22 one unwrapped `codex exec --help` did exactly this, creating 5 entries under `~/.codex/tmp/arg0-macos`; see that section." |
| L332 row 0 | OPEN … | append "Silent no-op and the trusted BLOCK re-confirmed on 0.163.0." Status unchanged |
| L333 row 1 | `DISPROVEN (re-pinned 0.145.0 → 0.162.1)` | `DISPROVEN (re-pinned 0.162.1 → 0.163.0)`. Append "Re-probed on 0.163.0: 0/20 versus 20/20 (the shared set grew to 20)", keeping every older sentence |
| L335 row 3 | status pinned `(0.162.1)` | keep the status. Append to evidence: "0.163.0: the `codex exec` refusal re-confirmed (3/3); the app-server path was not re-probed" |
| after L601 | — | new `## Re-probe — codex-cli 0.163.0` |

**New section shape.** It mirrors `## Re-probe — codex-cli 0.162.1` (L542–601): a method
paragraph, then a `| Probe | Result |` table with each result prefixed `**CONFIRMED (0.163.0).**`
or `**DISPROVEN (0.163.0).**`, then a closing **Not re-probed** sentence. The rows map 1:1 to the
matrix in *Context*. The probe 2a row names the retirement as the cause, not codex. The method
paragraph carries:

- the throwaway layout (A: one home; C: one per case)
- no credentials anywhere, and why none were needed
- the load detector for B and D
- the fake provider for C and E
- the bypass flag used in C only and never in E
- the breach paragraph (Requirement 2)

Do not add frontmatter: `intention-lint` skips the record because it has no `subjects:`.

**Not re-labelled** (not re-probed on 0.163.0): every row in the *Not re-probed* list in
*Context*, the matcher table (L165–183), the payload section (L413–439), and the *Isolation-method
caveat*. The caveat is about copied credentials, and none were copied this time.

### Part 2 — `adapters/codex/README.md` and `adapters/README.md`

**Context block.** Every pin re-labels only the half that 0.163.0 re-observed.

- L32: "observed on 0.145.0 and again on 0.162.1" → "observed on 0.145.0, 0.162.1 and 0.163.0".
- L48–49: `**The 19 shared skills do NOT load by reference on Codex 0.162.1 (pinned live; first
  pinned on 0.145.0).**` → the version becomes `0.163.0`, and the count reads per candidate 2.
- L53–54: "**0 of 19** load without the symlinks below, **19 of 19** load with them" → per
  candidate 2. L54–56 ("this IS the working path … required on every install, not a contingency")
  stays verbatim.
- L119–121: "on codex 0.162.1 a symlinked file in `$CODEX_HOME/rules/` is not loaded, yet it
  passes `cmp` and `codex execpolicy check`, both of which follow the link" → "a symlinked file
  in `$CODEX_HOME/rules/` is not loaded (codex 0.162.1, re-confirmed on 0.163.0), yet it passes
  `cmp` and `codex execpolicy check` (0.162.1), both of which follow the link". The pins
  `/do\s+not\s+symlink/i` (Configure scope) and the no-symlink-into-rules shell-line check are
  untouched, because no shell line changes.
- L129: "re-confirmed on 0.162.1" → "re-confirmed on 0.162.1 and 0.163.0".
- L200–201: "`write_stdin` is closed on 0.162.1 by the template's `unified_exec_tty = false` and
  the launch flag `-c features.unified_exec_tty=false`" → "`write_stdin` is closed by the
  template's `unified_exec_tty = false` (pinned on 0.163.0) and by the launch flag
  `-c features.unified_exec_tty=false` (pinned on 0.162.1)". The following sentences stay. They
  satisfy the Guard predicates (`write_stdin` + `reopens`, `.codex/config.toml` +
  `unified_exec_tty = true`), and those sentences are not edited.
- L208 ("as 0.162.1 already ignores `unified_exec = false`") and L213 (default timeout) keep
  their pins: not re-probed.
- L217: per candidate 6. Either way it keeps the literal `fail open` and `refuses to start`.
- `adapters/README.md` L34: "(0 of 19 load without the symlinks, 19 of 19 with them)" → per
  candidate 2.
- Hygiene: `native-surface.test.js` L278–305 runs the provenance loops over the README. Version
  strings pass `PROVENANCE_REF_RE`, so do not write ADR or part numbers into either README. Keep
  the edits declarative for the advisory prose gate.

### Part 3 — `BACKLOG.md` (and `gate.md` under candidate 4 = b)

**Context block.** The house convention is an in-place dated `**Re-probe on <v> (<date>): …**`
paragraph that keeps every older paragraph; L247–253 is the model to copy. `scripts/backlog-lint.sh`
checks only the structural headings, none of which move.

- **L227–228 title**: `re-probed 2026-10-15; STILL DISPROVEN, stays OPEN (codex-0.162.1
  limitation)` → `re-probed 2026-10-22; STILL DISPROVEN, stays OPEN (codex-0.163.0 limitation)`
  (under candidate 1 = a).
- **New paragraph after L253**: `**Re-probe on 0.163.0 (2026-10-22): unchanged — re-pinned 0.162.1
  → 0.163.0.**`. It covers:
  - the committed marketplace no longer declares `craft`, so `plugin add craft@…` fails, and the
    probe rebuilt the entry as a throwaway from `eab55ee^` (wording per candidate 3)
  - both cached manifests are `{description, name}`
  - `skills/list` (`forceReload: true`), 3/3: **0 of 20** by reference and **20 of 20** via the
    symlinks; the shared set grew from 19 to 20 with `skills/lessons`
  - symlink fallback required
  - "re-check on the next minor version"
  - the evidence pointer `docs/contributing/specs/codex-poc-record.md`, *Re-probe — codex-cli
    0.163.0*
- **L229–238** (the 0.144.6 finding paragraph, "DROPS the `craft` entry's …", "19 shared skills")
  stays verbatim: it is that version's finding.
- **Candidate 4 = b only**:
  - malformed-rules entry (L202–225): append one sentence to the 0.162.1 re-probe paragraph,
    "On 0.163.0 (2026-10-22) the `codex exec` refusal re-confirmed (3/3); the app-server and TUI
    paths were not re-probed."
  - hook-trust entry (L1392–): a bullet `**Re-confirmed 2026-10-22 on codex 0.163.0
    (codex-0163-reprobe).**` covering untrusted fail-open (3/3, `OUT.txt` 83 B, zero hook items)
    and the trusted BLOCK (same hash). It must not claim idempotence or ALLOW.
  - `docs/contributing/specs/gate.md` L278: "(offline probe 2026-10-18, 0.162.1)" → "(offline
    probe 2026-10-18, 0.162.1; the template key re-confirmed 2026-10-22 on 0.163.0)".
    `intention-lint` reads `gate.md` (it has `subjects:` frontmatter), and the frontmatter is not
    touched.

### Part 4 — code and test pins (per candidate 5)

**Context block**

- `adapters/codex/src/git-guard-adapter.js` L66–67, comment above `bridgeExecutedCommand`:
  "The payload was re-pinned on codex 0.162.1 and is still Claude-shaped; …".
- `adapters/codex/test/fixtures/pre-tool-use-payload.js` L5, comment on `preToolUseBash(command)`:
  "The live codex 0.162.1 PreToolUse Bash payload, with its command replaced."
- `adapters/codex/test/git-guard-adapter.test.js` L337:
  `describe('decideGuard() - default guard composes the git verdict on the live 0.162.1 payload', …)`.
- `adapters/codex/test/fixtures/pre-tool-use-bash.json` is **not** edited. Its bytes are the
  0.162.1 capture, and 0.163.0 compared keys only.
- No other non-history `0.162.1` pin exists in `src` or `test`. A `git grep '0\.162\.1'` excluding
  `docs/contributing/{design,plan,adr}` returns only the README, BACKLOG, record and `gate.md`
  lines covered above, plus these three.
- No signature, export or assertion changes. The comment lines are not mutable code, so Stryker
  does not apply.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Status of the BACKLOG by-reference entry** (user-reserved) | (a) stays OPEN, re-pinned to 0.163.0, symlink fallback documented as required, "re-check on the next minor version"; (b) close it as a standing codex limitation and stop re-probing every minor; (c) stays OPEN, but the trigger narrows to "a codex release whose notes touch plugin `skills` or out-of-tree paths" | **(a)** | The branch the user prescribed, and the evidence matches it: 0/20 by reference, 20/20 symlinked, cached manifest unchanged. (b) and (c) cut probe cost, which four unchanged versions (0.144.6, 0.145.0, 0.162.1, 0.163.0) may justify, but they change a standing re-check rule the user owns. Needs the user's confirmation. |
| 2 | **How the 19 → 20 count reads in current-state lines** (`adapters/codex/README.md` L48, L53–54; `adapters/README.md` L34) | (a) write `20` everywhere, matching the 0.163.0 measurement; (b) count-free claims ("The shared skills…", "none load without the symlinks, all load with them"), with the measured count pinned once: "(0 of 20 versus 20 of 20 on 0.163.0)"; (c) keep `19` and add a 20 note | **(b)** | (a) goes stale the next time a skill is added, as `skills/lessons` just made `19` stale with no gate noticing. (b) keeps the measured number dated to its version, where staleness is honest. (c) leaves a false current-state count. Dated measurements (record and BACKLOG 0.145.0/0.162.1 paragraphs) keep 19 under every option. |
| 3 | **How the record and BACKLOG describe the rebuilt `craft` entry** | (a) the new rows/paragraph say the committed marketplace declares `craft-codex` only (so `plugin add craft@…` fails), and the probe rebuilt the `craft` entry byte-for-byte from `eab55ee^` in the throwaway, as the retirement decision prescribes for re-measures. The older paragraphs that name the `craft` entry stay as their versions' findings; (b) (a) plus rewording the 0.144.6 BACKLOG paragraph (L234) to "a `craft` entry (since retired)"; (c) describe it only as "an entry with an out-of-tree `skills` reference", without naming `craft` or `eab55ee^` | **(a)** | The re-measure route is already decided (ADR-635 *Consequences*), so the record only has to say it was followed and how. (b) edits a dated finding, against the in-place convention. (c) drops the provenance a later re-prober needs to rebuild the same entry. |
| 4 | **Re-observed 0.162.1 pins outside the brief's list** (BACKLOG malformed-rules entry L202–225, BACKLOG hook-trust entry L1392–, `gate.md` L278) | (a) leave them, since the record is the source of truth; (b) a one-clause dated re-confirmation on each, naming only what 0.163.0 re-observed; (c) re-pin them outright to 0.163.0 | **(b)** | Probes 3, 5c and 6 re-observed exactly these rows, and the brief's own rule is "same per-row rule for BACKLOG". (a) leaves three surfaces silent about a confirmation that exists. (c) overclaims, because the app-server path, the launch flag, idempotence and ALLOW were not re-probed. Each edit is one clause. |
| 5 | **Code and test version pins** (`git-guard-adapter.js` L66, `pre-tool-use-payload.js` L5, `git-guard-adapter.test.js` L337) | (a) re-pin all three to 0.163.0; (b) the comments say "captured on codex 0.162.1; key set re-confirmed on 0.163.0", and the describe title becomes version-free ("…on the live codex payload"); (c) leave all three untouched | **(b)** | The fixture bytes (`model`, `permission_mode` values) are the 0.162.1 capture. 0.163.0 compared keys only, so (a) mislabels the fixture. (c) hides a confirmation that was made. A version-free title stops a test-title edit at every re-probe, and the comments carry the version history. |
| 6 | **README L217 (the malformed-rules surface split)** | (a) keep "On codex 0.162.1" unchanged, as the brief lists it; (b) keep the 0.162.1 pin and add that the `codex exec` refusal was re-confirmed on 0.163.0; (c) re-pin the whole sentence to 0.163.0 | **(b)** | Probe 3 re-observed the `codex exec` half, so the brief's "not re-probed" holds only for the app-server and TUI halves. (c) would claim the app-server fail-open on 0.163.0 without evidence. (b) keeps both pins true and still matches `/fail open/i` and `/refuses?\s+to\s+start/i`. |

## Test strategy

No behaviour changes, so there is no RED test to write. Every gate below must stay green, and a
pin that turns red means an edit dropped a mandated disclosure.

- **`adapters/codex/test/native-surface.test.js`**, unchanged. It is the guard for Part 2:
  - the honesty pins (L356–): `SKILLS_SYMLINK_LINE`, `git -C`, `fail open`, `refuses? to start`,
    `not measured`, `--dangerously-bypass-hook-trust`, `$CODEX_HOME/skills`,
    `trust` + `silently no-ops`
  - `PLUGIN_ADD_SELECTOR` against the single declared entry (L188–195): no `craft@` line may
    appear
  - the Configure-scoped rules pins and the README-wide no-symlink-into-rules check
  - the Guard-section sentence predicates (L558–582)
  - the provenance hygiene loops (L278–305)
- **`adapters/codex/test/git-guard-adapter.test.js`**: the title rename (candidate 5) must leave
  the row count and every assertion untouched. `node --test` reports the same number of passing
  tests before and after.
- **Doc and ledger gates in `scripts/ci.sh`**:
  - `design-lint` (this file's six headings)
  - `backlog-lint`
  - `intention-lint` (the record has no frontmatter and stays skipped; `gate.md` and BACKLOG are
    read)
  - `docs-structure-lint`
  - `readme-drift` (this commit bumps design docs 92 → 93; no later part adds a doc)
- **Path hygiene.** Before each commit, grep the changed files for `/Users/` and `/home/`.
- **No live re-run.** The matrix in *Context* is the evidence. No test spawns real `codex`.

## Out of scope

- **Re-probing the rows that need auth or an attended session**: the app-server and TUI
  malformed-rules fail-open, hook timeouts, the `-c` launch flag, the project-config override,
  trust idempotence and ALLOW. They keep their 0.162.1 pins.
- **Regenerating `pre-tool-use-bash.json`** from a 0.163.0 capture. Values were not recorded.
- **Fixing either upstream fail-open** (untrusted hook, app-server rules skip). Both are codex
  behaviour, re-checked here, unchanged.
- **Editing history**: ADRs (ADR-635's "19 shared skills" included), designs, plans, and BACKLOG
  delivered entries.
- **An ADR.** No decision changes: by-reference loading still fails, and the symlink route stands.
- **A gate on the shared-skill count in docs.** Candidate 2 = (b) removes the need. Under (a),
  the next skill added makes the count stale again; one line, not acted on.
