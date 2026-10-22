# Plan — codex 0.163.0 re-probe: record the result, re-pin the docs, close by-reference skills as a standing limitation

> Source: design doc `docs/contributing/design/codex-0163-reprobe.md` · ADRs `674-678`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Overview — four parts, the design's Parts 1–4

| Part | Ships | Files edited | Commit type |
|---|---|---|---|
| 1 | POC record: in-place 0.163.0 labels on re-observed rows + new `## Re-probe — codex-cli 0.163.0` section | the record | `docs(codex)` |
| 2 | adapter READMEs: re-pin only the re-observed halves; count-free skill claims | codex README, adapters README | `docs(codex)` |
| 3 | BACKLOG: two in-place 0.163.0 clauses, the by-reference entry closed and moved to won't-do, group B closed lead; `gate.md` clause | BACKLOG, gate spec | `docs(backlog)` |
| 4 | code/test pins: two comments name capture vs key-set re-confirmation; describe title loses its version | one src file, two test files | `chore(codex)` |

Order matters: Parts 2 and 3 cite the record section Part 1 creates. Parts share one working
tree and build on each other; each part is one atomic commit. No part adds a doc, so no part
touches the README corpus counts (the plan commit already bumped the plan count).

Part 3 quotes the record path inside the BACKLOG text it writes, and Part 1 quotes the payload
fixture path inside a record row. plan-lint may print an advisory cognitive-locality warning for
those quoted paths: they are quoted text, not edited files, so the parts stay separate.

## Facts every part needs (verified against this tree at 5f529c7 — do not re-verify)

- **No live codex, ever.** The evidence is the design's *Pinned matrix — codex-cli 0.163.0*
  table (design L48–65, rows 1–6b) plus its method/breach paragraphs (design L31–46) and the
  *Not re-probed* list (design L67–71). Copy from there; this plan already spells every
  replacement out. Never cite any out-of-repo scratch path.
- **Outcome: no codex behaviour changed on any re-observed row.** Docs, comments and one test
  title only. No assertion, export, signature or behaviour changes anywhere.
- **Decided wording** (ADRs 674–678, all settled):
  - ADR-674: the BACKLOG by-reference entry CLOSES as a standing codex limitation, moves to
    `### Closed — won't-do (rationale recorded)`, gains a dated 0.163.0 paragraph retiring the
    per-minor re-check; the 0.144.6/0.145.0/0.162.1 paragraphs stay verbatim (their "re-check
    on the next minor version" clauses included). Symlink route stays required; install
    instructions unchanged; READMEs carry no re-check wording and gain none.
  - ADR-675: current-state skill-loading claims carry no bare count; the measured count is
    pinned once, dated ("0 of 20 versus 20 of 20 on 0.163.0"). Dated measurements keep 19.
  - ADR-676: payload comments say "captured on 0.162.1; key set re-confirmed on 0.163.0"; the
    describe title drops the version; the fixture JSON is not edited.
  - ADR-677: new rows say the committed marketplace declares `craft-codex` only and the probe
    rebuilt the `craft` entry byte-for-byte from `eab55ee^` in its throwaway.
  - ADR-678: a re-observed 0.162.1 pin gains a dated 0.163.0 clause; the unobserved half of a
    sentence keeps its 0.162.1 pin.
- **ADR-320 (history rule):** only rows re-observed on 0.163.0 gain a 0.163.0 label, and the
  older pin stays beside the new one. Never edit ADRs, designs, plans, or BACKLOG *delivered*
  entries.
- **Not re-probed on 0.163.0 — keep their 0.162.1 pins everywhere:** the app-server and TUI
  malformed-rules fail-open, the hook timeout and default-timeout rows, the
  `-c features.unified_exec_tty=false` launch flag, the project-config override, trust
  `--check` idempotence and ALLOW, the `execpolicy check` and `cmp` rows, the `unified_exec` and
  `shell_tool` switches, the tool shell, the heredoc idiom.
- **Path hygiene:** committed text uses placeholders (`<throwaway>`, `<worktree>`,
  `<repo copy>`, `<path>`, `<marker>`, `<work>`), never a home-rooted path. `~/.codex` stays as
  the generic name of codex's default home (the record already uses it).
- **No provenance refs in source or test** (Part 4): no ADR, phase or backlog numbers in the
  comments or title. Version strings are fine.
- **Line numbers are pre-edit anchors at 5f529c7.** Each edit also names a unique text anchor;
  if a line has shifted, locate by the text.
- **Git etiquette:** plain `/usr/bin/git <verb>`; `git diff`/`git show` need `--no-ext-diff`;
  stage explicit paths only (never `commit -a`, never `add -A`); never checkout/reset/stash.
- **Gates:** `nice -n 19 bash scripts/ci.sh` (≈10 s; node --test suites, adr/design/backlog/
  docs-structure/intention/readme-drift lints; prose-lint is advisory). Pipe its output to a
  file and grep it; do not read it whole.

## Part 1 — record the codex-cli 0.163.0 re-probe in the POC record

### Context

File edited: `docs/contributing/specs/codex-poc-record.md` (601 lines at 5f529c7). No
frontmatter, so `intention-lint` skips it — do not add frontmatter. test/source-hygiene.test.js
scans it for `stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b`: the new text must contain none.
The existing model to mirror is `## Re-probe — codex-cli 0.162.1` (L542–601).

**In-place edits** (each keeps the older pin):

| Line | Anchor text | Exact change |
|---|---|---|
| L17 | `` `codex-cli 0.162.1` (was `codex-cli 0.145.0`) `` | cell 2 → `` `codex-cli 0.163.0` (was `codex-cli 0.162.1`, `codex-cli 0.145.0`) ``; status → `CONFIRMED (0.163.0; first pinned 0.145.0)` |
| L18 | `` `@openai/codex@0.162.1`, platform package `0.162.1-darwin-arm64` `` | cell 2 → `` `@openai/codex@0.163.0`, platform package `0.163.0-darwin-arm64`, read from the installed package (was `@openai/codex@0.162.1`, `@openai/codex@0.145.0`) ``; status → `CONFIRMED (0.163.0; first pinned 0.145.0)` |
| L19 | status `CONFIRMED (re-confirmed 0.162.1)` | → `CONFIRMED (re-confirmed 0.162.1; re-confirmed 0.163.0)` |
| L21 | `Observed on 0.145.0; unchanged on 0.162.1.` | → `Observed on 0.145.0; unchanged on 0.162.1 and 0.163.0.`; status `CONFIRMED (0.145.0; re-confirmed 0.162.1)` → `CONFIRMED (0.145.0; re-confirmed 0.162.1, 0.163.0)` |
| L52 | `` rows marked `(0.145.0)`, `(0.161.0)` or `(0.162.1)`, and the matching `` | → `` rows marked `(0.145.0)`, `(0.161.0)`, `(0.162.1)` or `(0.163.0)`, and the matching `` (re-wrap L51–54 only if needed) |
| L115 | cell ends `Re-confirmed on 0.162.1: same 0 of 19 versus 19 of 19.`; status `**DISPROVEN (0.145.0; re-confirmed 0.162.1)**` | append to the cell ` Re-confirmed on 0.163.0 against the then 20 shared skills: 0 of 20 versus 20 of 20.`; status → `**DISPROVEN (0.145.0; re-confirmed 0.162.1, 0.163.0)**` |
| L117 | `` re-exercised 0.162.1 with `./adapters/codex`):** `` | → `` re-exercised 0.162.1 with `./adapters/codex`; re-exercised 0.163.0 with the `craft` entry rebuilt byte-for-byte from `eab55ee^` in the throwaway, the committed marketplace declaring `craft-codex` only):** `` — rest of the cell unchanged |
| L140 | status `**CONFIRMED (0.144.6; re-confirmed 0.145.0; re-confirmed 0.162.1) — and this` | → `**CONFIRMED (0.144.6; re-confirmed 0.145.0; re-confirmed 0.162.1; re-confirmed 0.163.0) — and this` (rest unchanged) |
| L141 | status `` re-exercised 0.162.1 via `bin/trust-hook.js`, byte-identical re-run) `` | → `` re-exercised 0.162.1 via `bin/trust-hook.js`, byte-identical re-run; trust write re-exercised 0.163.0 with the same hash, idempotence not re-run) `` |
| L191–195 | paragraph ending `Still treat a malformed `.rules` file as fail open.` (L195) | insert before `Still treat`: `` On 0.163.0 the `codex exec` refusal re-confirmed (3/3); the app-server and TUI paths were not re-probed. `` |
| L317 | heading `…; rows 0, 1, 3: revisited 2026-10-15 on 0.162.1)` | → `…; rows 0, 1, 3: revisited 2026-10-15 on 0.162.1; rows 0, 1, 3: revisited 2026-10-22 on 0.163.0)` (no anchor links target this heading — verified) |
| L323–324 | `` revisited again on `codex-cli 0.162.1` under the same protocol; see `Re-probe — codex-cli 0.162.1`. `` | append right after that sentence: `` Rows 0, 1 and 3 were revisited on `codex-cli 0.163.0` too; see `Re-probe — codex-cli 0.163.0`. `` |
| L328 | method note ends `15-minute window.` | append: `` On 2026-10-22 one unwrapped `codex exec --help` did exactly this, creating 5 entries under `~/.codex/tmp/arg0-macos`; see `Re-probe — codex-cli 0.163.0`. `` |
| L332 row 0 | evidence cell ends `Still no launch path calls `--check`.` | append ` Silent no-op and the trusted BLOCK re-confirmed on 0.163.0.` Status unchanged |
| L333 row 1 | status `**DISPROVEN (re-pinned 0.145.0 → 0.162.1)**`; evidence ends `` `{description, name}`. Still a codex limitation; stays OPEN. `` | status → `**DISPROVEN — closed 2026-10-22 as a standing codex limitation (re-pinned 0.162.1 → 0.163.0)**`. Evidence: keep every sentence up to `` `{description, name}`. ``, then replace `Still a codex limitation; stays OPEN.` with `Re-probed on 0.163.0: 0/20 versus 20/20 (the shared set grew to 20). A standing codex limitation: closed 2026-10-22, no re-probe scheduled, the symlink route stays required.` |
| L335 row 3 | status `…(0.162.1) — treat as fail open**` kept; evidence cell ends `…so it protects only when something invokes it.` | append to evidence: `` 0.163.0: the `codex exec` refusal re-confirmed (3/3); the app-server path was not re-probed. `` |

**Not re-labelled:** every *Not re-probed* row (see Facts), the matcher table (L165–183), the
payload section (L413–439), the *Isolation-method caveat* (it is about copied credentials; none
were copied this time), and every row of the 0.145.0/0.161.0/0.162.1 sections.

**New section — append after L601 (end of file), preceded by one blank line, verbatim:**

```markdown
## Re-probe — codex-cli 0.163.0

Method: 2026-10-22. Throwaway `HOME`/`CODEX_HOME` homes made with `mktemp` (`<throwaway>`): one
for the skills probe, and one per case for the tool-list, `write_stdin` and payload probes. No
`auth.json` was copied into any of them, and no step needed auth. The rules-load probes reuse the
2026-10-16 load detector: with no credentials, codex either prints `Error loading rules:` and
exits, or reaches the session header and enters a reconnect loop. The tool-list, `write_stdin`,
payload and hook-trust probes drive the offline fake Responses provider.
`--dangerously-bypass-hook-trust` was used only for the tool-list, `write_stdin` and payload
probes, inside their throwaways, so that their dumping hook would fire; the hook-trust probes
never used it. Every block was verified by its ground-truth side effect, never by exit code.
Every row is pinned to 0.163.0; where an older section above records the same probe, both stay,
each pinned to its version.

Isolation: one breach, disclosed. `find ~/.codex -newer <marker>` returned 5 entries, all under
`~/.codex/tmp/arg0-macos/codex-arg0<random>/`: the directory, a `.lock`, and the `apply_patch`
and `applypatch` symlinks. The cause was reproduced: one `codex exec --help` call, used to read
the flag list, ran without the throwaway env, and run against an existing `CODEX_HOME`,
`codex exec --help` creates exactly that 5-entry shape. No config, auth, sqlite, session or log
file under `~/.codex` changed. Every other invocation was wrapped, and each throwaway grew its
own `tmp/arg0-macos` (8004 entries in the skills probe's throwaway). This is the failure the
*Open rows* method note warns about: wrap every invocation, bare `--help` included.

| Probe | Result |
|---|---|
| Identity (0.163.0) | **CONFIRMED (0.163.0).** `codex --version` = `codex-cli 0.163.0`; npm `@openai/codex` 0.163.0, platform package `0.163.0-darwin-arm64`; vendored binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`, the same layout as before. |
| `craft` entry, committed marketplace (0.163.0) | **CONFIRMED (0.163.0): absent by a repo change, not by codex.** `codex plugin add craft@craft-codex-marketplace` → ``Error: plugin `craft` was not found in marketplace `craft-codex-marketplace` ``. The committed marketplace declares `craft-codex` only since the `craft` entry was retired on 2026-10-18. |
| Rebuilt `craft` entry (0.163.0) | **CONFIRMED (0.163.0).** The throwaway holds a copy of `adapters/codex` and `skills/`, with `marketplace.json` and `plugins/craft/plugin.json` (`"skills": "../../../../skills"`) restored byte-for-byte from `eab55ee^`, the re-measure route the retirement decision names; none of it ships. `codex plugin marketplace add ./adapters/codex`, then `plugin add` for `craft-codex@craft-codex-marketplace` and `craft@craft-codex-marketplace`: both succeed. |
| Cached manifests (0.163.0) | **CONFIRMED (0.163.0), unchanged.** The cached `.codex-plugin/plugin.json` of **both** entries is `{description, name}`: `skills` and `hooks` dropped. |
| Skills by reference (0.163.0) | **DISPROVEN (0.163.0).** App-server `skills/list` with `{"cwds":[<repo copy>],"forceReload":true}`, 3/3: 6 in total, **0 of 20** shared (`craft-codex:craft-run` at scope `user`, plus 5 system skills). The shared set is 20 since `skills/lessons` landed; the older sections measured 19. |
| Symlink fallback (0.163.0) | **CONFIRMED (0.163.0).** `ln -s <worktree>/skills/<name> $CODEX_HOME/skills/<name>` ×20, `skills/list` 3/3: 26 in total, **20 of 20** shared, registered `craft:<name>` at scope `user`, paths resolving into the repo (e.g. `…/skills/lessons/SKILL.md`). Four versions (0.144.6, 0.145.0, 0.162.1, 0.163.0) measured the same result; by-reference loading is closed as a standing codex limitation, and a re-measure, if ever wanted, uses the throwaway entry above. |
| `forceReload` (0.163.0) | **CONFIRMED (0.163.0), schema only.** Present in the schema `codex app-server generate-json-schema` emits. |
| Malformed rules, `codex exec` (0.163.0) | **CONFIRMED (0.163.0): fails closed, unchanged.** `craft.rules` minus its last line `)` placed in `$CODEX_HOME/rules/`; `codex exec --skip-git-repo-check -s read-only -C <work> "say hi" < /dev/null`, 3/3: exit 1 at startup, `Error loading rules:` / `<path>:17: starlark error: … Parse error: unexpected new line, expected expression`, no session header. Control (the committed copy): no rules error, session header reached. |
| Symlinked rules file (0.163.0) | **CONFIRMED (0.163.0): not loaded, unchanged.** `$CODEX_HOME/rules/craft.rules` a symlink to the malformed copy, 3/3: no rules error, session header reached. |
| Tool list, default config (0.163.0) | **CONFIRMED (0.163.0), unchanged.** Identical to the 0.162.1 row: `exec_command(cmd\|justification\|login\|max_output_tokens\|prefix_rule\|sandbox_permissions\|shell\|tty\|workdir\|yield_time_ms)`, `write_stdin(chars\|max_output_tokens\|session_id\|yield_time_ms)`, `request_user_input`, `apply_patch`, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search`. |
| `write_stdin`, default config (0.163.0) | **CONFIRMED (0.163.0): unguarded, unchanged.** `exec_command {cmd:"sh", tty:true}`, then `write_stdin` sends `echo WS_MARKER > ws_marker.txt\nexit\n`: the marker is **present**. The hook fired once (`Bash {"command":"sh"}`) and not at all for `write_stdin`. |
| `[features] unified_exec_tty = false` (0.163.0) | **CONFIRMED (0.163.0): closed, unchanged.** 3/3: `tty` is absent from the `exec_command` schema; a forced `tty:true` → ``TTY execution is disabled by config; omit `tty` or set it to false.``; marker absent; the hook fired first. The `-c features.unified_exec_tty=false` launch flag was not re-probed. |
| Non-tty session (0.163.0) | **CONFIRMED (0.163.0).** `exec_command {cmd:"sleep 2; sh", yield_time_ms:500}`, then `write_stdin` → `stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`, marker absent. Same result with tty off and with the default config. |
| Hook payload keys (0.163.0) | **CONFIRMED (0.163.0): key set unchanged.** `cwd, hook_event_name, model, permission_mode, session_id, tool_input, tool_name, tool_use_id, transcript_path, turn_id`, the same set as `adapters/codex/test/fixtures/pre-tool-use-bash.json`; `tool_name` is `Bash` and `tool_input` is `{command}`. Values were not compared, so the fixture stays the 0.162.1 capture. |
| Untrusted hook (0.163.0) | **CONFIRMED (0.163.0), fail-open reproduced.** The template `[[hooks.PreToolUse]]` block verbatim, `CRAFT_ROOT=<worktree>`, no bypass flag; `trust-hook.js --check` → exit 1, `from=untrusted`. The fake model asks for `git diff > OUT.txt`, 3/3: `OUT.txt` **present** (83 B), zero hook items, 2 `command_execution` items. |
| Trusted control (0.163.0) | **CONFIRMED (0.163.0): denied.** `trust-hook.js` → exit 0, `from=untrusted hash=sha256:38713365…` (the 0.161.0 and 0.162.1 hash). The same turn → `OUT.txt` absent, zero `command_execution` items, `blocked by PreToolUse hook: craft-guard: git diff/show must carry --no-ext-diff …`. Idempotence and ALLOW were not re-run. |

**Not re-probed** (they need auth or an attended session), so they keep their 0.162.1 pins: the
app-server and TUI malformed-rules fail-open, the hook timeout and default-timeout rows, the
`-c features.unified_exec_tty=false` launch flag, the project-config override, trust `--check`
idempotence and ALLOW, the `execpolicy check` and `cmp` rows, the `unified_exec` and
`shell_tool` switches, the tool shell, and the heredoc idiom.
```

Read-only references (do not edit): docs/contributing/design/codex-0163-reprobe.md (matrix
L48–65), test/source-hygiene.test.js. The section must carry no "re-check on the next minor
version" wording (Requirement 9).

### TDD steps

No behaviour changes and no test asserts over this evidence record; a text-pin would pin
wording, not behaviour. The executable checks are the repo's gates.

1. **GUARD (gate-first)** — before editing: `node --test test/source-hygiene.test.js 2>&1 | grep -E '^# (pass|fail)'`
   → `# fail 0`; it passes today because the record carries no banned token. It must still pass
   after the edit.
2. **GREEN — in-place edits** — apply the in-place table above, top to bottom (L17 → L335).
3. **GREEN — new section** — append the fenced section verbatim (without the fence lines) after
   L601, one blank line between.
4. **REFACTOR / self-check** —
   - every `grep -n '0\.163\.0' docs/contributing/specs/codex-poc-record.md` hit outside the new
     section is one of the in-place rows above.
   - `grep -n -i 'next minor\|re-check on' docs/contributing/specs/codex-poc-record.md` prints
     nothing.
   - `grep -n 'stays OPEN' docs/contributing/specs/codex-poc-record.md` no longer hits row 1
     (L333).
   - Every new table row has exactly two cells (count unescaped `|`: a row starts and ends with
     `|` and has one separator); the tool-list row's pipes are `\|`-escaped.

### Gate

```
node --test test/source-hygiene.test.js test/living-corpus.test.js 2>&1 | grep -E '^# (pass|fail)'
grep -nE 'stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b' docs/contributing/specs/codex-poc-record.md   # must print nothing
git diff --no-ext-diff docs/contributing/specs/codex-poc-record.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(codex): record the codex-cli 0.163.0 re-probe`

## Part 2 — adapter READMEs: re-pin the re-observed halves to 0.163.0

### Context

Files edited: `adapters/codex/README.md` and `adapters/README.md`. No test reads
adapters/README.md. adapters/codex/test/native-surface.test.js pins the codex README (read-only;
none of its pins reads a version or a count):
- honesty pins (L356–): `SKILLS_SYMLINK_LINE`, `git -C`, `/fail open/i`, `/refuses?\s+to\s+start/i`,
  `not measured`, `--dangerously-bypass-hook-trust`, `$CODEX_HOME/skills`, `trust` + `silently no-ops`;
- `PLUGIN_ADD_SELECTOR` (L59, L188–195): no `codex plugin add craft@…` line may appear — never
  write one;
- the Configure-scoped `/do\s+not\s+symlink/i` pin and the README-wide no-symlink-into-rules
  shell-line check (no shell line changes here);
- Guard-section sentence predicates (L558–582): a sentence with `write_stdin` + `reopens`, and a
  sentence with `.codex/config.toml` + `unified_exec_tty = true` — those sentences are not edited;
- provenance hygiene loops (L278–305): write no ADR, part or backlog numbers in either README.

prose-lint runs advisory over both READMEs: keep edits declarative.

**`adapters/codex/README.md` edits (exact):**

1. L32, anchor `observed on 0.145.0 and again on 0.162.1 is just` → `observed on 0.145.0, 0.162.1
   and 0.163.0 is just`.
2. L48–49, current:
   ```
   **The 19 shared skills do NOT load by reference on Codex 0.162.1 (pinned live;
   first pinned on 0.145.0).**
   ```
   new:
   ```
   **The shared skills do NOT load by reference on Codex 0.163.0 (pinned live;
   first pinned on 0.145.0).**
   ```
3. L53–54, current:
   ```
   absent. Measured, with such an entry installed, through the app-server's own skills-listing method: **0 of 19** load
   without the symlinks below, **19 of 19** load with them. Load them with the symlink
   ```
   new:
   ```
   absent. Measured, with such an entry installed, through the app-server's own skills-listing method: **none** load
   without the symlinks below and **all** load with them (0 of 20 versus 20 of 20 on 0.163.0). Load them with the symlink
   ```
   L55–56 (`route — this IS the working path for the shared skills, required on every install,
   not` / `a contingency to fall back on:`) stay byte-identical.
4. L119–121, current:
   ```
   them. **Copy, do not symlink**: on codex 0.162.1 a symlinked file in
   `$CODEX_HOME/rules/` is not loaded, yet it passes `cmp` and `codex execpolicy check`,
   both of which follow the link. The `rm -f` removes a link left by an earlier deploy
   ```
   new:
   ```
   them. **Copy, do not symlink**: a symlinked file in `$CODEX_HOME/rules/` is not loaded
   (codex 0.162.1, re-confirmed on 0.163.0), yet it passes `cmp` and `codex execpolicy check`
   (0.162.1), both of which follow the link. The `rm -f` removes a link left by an earlier deploy
   ```
5. L129, anchor `live, and re-confirmed on 0.162.1: the identical run` → `live, and re-confirmed on
   0.162.1 and 0.163.0: the identical run` (one line; keep the rest of the line).
6. L200–201, current:
   ```
   - `write_stdin` is closed on 0.162.1 by the template's `unified_exec_tty = false` and the
     launch flag `-c features.unified_exec_tty=false`. Codex refuses `tty: true` with
   ```
   new:
   ```
   - `write_stdin` is closed by the template's `unified_exec_tty = false` (pinned on 0.163.0)
     and by the launch flag `-c features.unified_exec_tty=false` (pinned on 0.162.1). Codex refuses `tty: true` with
   ```
   L202 onward unchanged.
7. L218 (inside the malformed-rules bullet L216–222), current:
   ```
     binding's launch path, refuses to start, so the run stops loudly; the app-server
   ```
   new:
   ```
     binding's launch path, refuses to start, so the run stops loudly (re-confirmed on 0.163.0); the app-server
   ```
   L217 keeps `On codex 0.162.1`; the app-server and TUI halves keep 0.162.1. `fail open` (L216)
   and `refuses to start` stay literal.

**Keep their pins (not re-probed):** L41, L136, L140, L178, L208 (as 0.162.1 already ignores `unified_exec = false`), L213 (default timeout), L234. Do not add "re-check on the next minor
version" anywhere.

**`adapters/README.md` edit (exact):** L34, anchor `(0 of 19 load without the symlinks, 19 of 19
with them)` → `(none load without the symlinks, all with them; 0 of 20 versus 20 of 20 on codex
0.163.0)`. Rest of the table row unchanged.

Read-only references: adapters/codex/test/native-surface.test.js, docs/contributing/design/codex-0163-reprobe.md (Part 2, L244–279).

### TDD steps

1. **GUARD (gate-first)** — `node --test adapters/codex/test/native-surface.test.js 2>&1 | grep -E '^# (tests|pass|fail)'`
   before editing: note the counts, `# fail 0`. It passes today because no pin reads a version
   or a count; after the edits the same counts and `# fail 0` must hold — a red pin here means an
   edit dropped a mandated disclosure (fix the edit, never the test).
2. **GREEN** — apply codex README edits 1–7, then the adapters README edit.
3. **REFACTOR / self-check** —
   - `grep -n '0\.162\.1' adapters/codex/README.md` still hits L119–121 area, L129, L201, L208,
     L213, L217 (the unobserved halves) — each kept deliberately.
   - `grep -n '19' adapters/codex/README.md adapters/README.md` hits no skill count.
   - `grep -n -i 'next minor\|re-check on' adapters/codex/README.md adapters/README.md` prints
     nothing.
   - `grep -n 'craft@' adapters/codex/README.md` prints nothing.

### Gate

```
node --test adapters/codex/test/native-surface.test.js 2>&1 | grep -E '^# (tests|pass|fail)'   # same counts as step 1, fail 0
git diff --no-ext-diff adapters/codex/README.md adapters/README.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(codex): re-pin the adapter READMEs to codex 0.163.0`

## Part 3 — BACKLOG: close by-reference skills as a standing limitation; gate spec clause

### Context

Files edited: `BACKLOG.md` (1740 lines at 5f529c7) and `docs/contributing/specs/gate.md`.
scripts/backlog-lint.sh only checks that `## Status`, `## Candidate phases`, `## Parked`,
`### Condition-gated`, `### Closed` headings exist — none is added or removed. `intention-lint`
reads BACKLOG and gate.md (gate.md has `subjects:` frontmatter — do not touch it). prose-lint is
advisory over BACKLOG. BACKLOG has no checkboxes; "closed" = heading wording + placement in
`### Closed — won't-do (rationale recorded)` (L1717–1740, end of file, bullets shaped
`- **<title>** — …`).

**Order (mandatory):** in-place edits first (steps A, B, C), then the move (D), then the group B
lead (E). Line numbers are pre-edit; after step A the lines below it shift by the inserted
text, so locate each later edit by its text anchor.

**A. Malformed-rules entry (L202–225), 0.162.1 re-probe paragraph L219–225.** It ends:
```
and fails open the same way, with nothing on screen (3/3, 2026-10-21). Treat a malformed rules
file as fail open. Evidence: `docs/contributing/specs/codex-poc-record.md`,
*Re-probe — codex-cli 0.162.1*.
```
Append after `*Re-probe — codex-cli 0.162.1*.` (same paragraph, re-wrapped at ~100 cols):
```
On 0.163.0 (2026-10-22) the `codex exec` refusal re-confirmed (3/3); the app-server and TUI
paths were not re-probed (*Re-probe — codex-cli 0.163.0*).
```
Its heading (L202–203) is not edited.

**B. Hook-trust entry under `### Open (scoped 2026-07-20 — follow-ups surfaced by the codex
binding, not yet scheduled)` (entry starts L1392).** Its last bullet is
`- **Re-confirmed 2026-10-15 on codex 0.162.1 (codex-0162-reprobe).**` (L1429–1437), ending
`  The fail-open is still unchanged codex behaviour, so the entry stays MITIGATED, not closed.`
Insert directly after L1437 (before the blank line) this bullet, verbatim:
```
- **Re-confirmed 2026-10-22 on codex 0.163.0 (codex-0163-reprobe).** With the template
  `[[hooks.PreToolUse]]` block copied verbatim, no bypass flag, and `trust-hook.js --check`
  reporting `from=untrusted` (exit 1), the untrusted-hook fail-open reproduced: the turn's
  `git diff > OUT.txt` ran (`OUT.txt` 83 B, 3/3) and the stream carried zero hook items.
  `bin/trust-hook.js` then wrote trust (exit 0, the same `sha256:38713365…` hash), and the same
  turn was blocked (`OUT.txt` absent, zero `command_execution` items, the guard's
  `--no-ext-diff` reason). Idempotence and ALLOW were not re-run. The fail-open is still
  unchanged codex behaviour, so the entry stays MITIGATED, not closed.
```

**C. By-reference entry (L227–253): new paragraph after the 0.162.1 paragraph** (which ends
L253 `is not achievable on codex 0.162.1; re-check on the next minor version.`). Insert one
blank line, then verbatim:
```
**Re-probe on 0.163.0 (2026-10-22): unchanged — closed as a standing codex limitation.** The
committed marketplace declares `craft-codex` only, so `codex plugin add craft@craft-codex-marketplace`
fails; the probe rebuilt the `craft` entry byte-for-byte from `eab55ee^` in its throwaway, the
re-measure route the marketplace decision names, and none of it ships. Both cached
`.codex-plugin/plugin.json` are `{description, name}`, `skills` and `hooks` dropped. Through the
app-server `skills/list` method (`forceReload: true`), 3/3: **0 of 20** shared skills load by
reference, **20 of 20** load via the symlink fallback (the shared set grew from 19 to 20 with
`skills/lessons`). Four versions (0.144.6, 0.145.0, 0.162.1, 0.163.0) measured the same result,
so this is a standing codex limitation: the symlink route stays required, not optional, and the
install instructions are unchanged. The per-minor re-check named in the paragraphs above is
retired: no re-probe is scheduled. A re-measure stays possible through the throwaway-entry route.
Evidence: `docs/contributing/specs/codex-poc-record.md`, *Re-probe — codex-cli 0.163.0*.
```
The 0.144.6 (L227–238), 0.145.0 (L240–245) and 0.162.1 (L247–253) paragraphs stay verbatim,
their "re-check on the next minor version" clauses and "19" counts included.

**D. Move the entry.** Cut the whole entry (from `**Prove craft's shared skills load by
reference on codex — re-probed 2026-10-15; STILL DISPROVEN,` through the new 0.163.0
paragraph) plus its one trailing blank line out of `### Open — B. Agent-CLI re-probes`, so the
group keeps exactly one blank line before `### Open — C. Waiting on an external trigger`.
Append it as the **last bullet** of `### Closed — won't-do (rationale recorded)`, after the
`macos-latest` bullet that ends the file (its last line `original-awk pass vacuously, and CI
uses neither.`), with no blank line between bullets (house style there). Transform:
- The first two lines
  ```
  **Prove craft's shared skills load by reference on codex — re-probed 2026-10-15; STILL DISPROVEN,
  stays OPEN (codex-0.162.1 limitation).** Two findings: (1) **manifest location bug, FIXED
  ```
  become
  ```
  - **Prove craft's shared skills load by reference on codex — closed 2026-10-22 as a standing
    codex limitation (re-probed 0.144.6, 0.145.0, 0.162.1, 0.163.0; always DISPROVEN).** Two
    findings: (1) **manifest location bug, FIXED
  ```
  (re-wrapping the first paragraph's following lines is optional; keep the words verbatim).
- Every other line of the entry is indented by two spaces (list-continuation paragraphs);
  blank lines between its four paragraphs stay, unindented. Text otherwise verbatim (the 0.144.6
  paragraph's "DROPS the `craft` entry's …" and "19 shared skills" included).
- The file ends with a single trailing newline.

**E. Group B closed lead.** After the `Delivered 2026-10-22 (codex-tui-malformed-rules-probe)`
paragraph (L195–200, ends `is unchanged: ADR-574 already treats a malformed rules file as fail
open.`) and before the malformed-rules entry, insert one blank line, then verbatim:
```
Closed 2026-10-22 (codex-0163-reprobe): craft's shared skills still do not load by reference on
codex 0.163.0 (0 of 20 versus 20 of 20 through the symlinks). Closed as a standing codex
limitation, no re-probe scheduled; the symlink route stays required (ADR-674). Entry and
history: *Closed — won't-do*.
```

**F. `docs/contributing/specs/gate.md` L278**, current:
```
  (offline probe 2026-10-18, 0.162.1). Closed only while that config holds: without the flag, a
```
new (re-wrap the paragraph's following lines only if needed; keep the two-space indent):
```
  (offline probe 2026-10-18, 0.162.1; the template key re-confirmed 2026-10-22 on 0.163.0).
  Closed only while that config holds: without the flag, a
```
The launch-flag half keeps its 0.162.1 pin.

Read-only references: scripts/backlog-lint.sh, docs/contributing/design/codex-0163-reprobe.md
(Part 3, L281–332), docs/contributing/specs/codex-poc-record.md (cited, already updated by Part 1).

### TDD steps

1. **GUARD (gate-first)** — `bash scripts/backlog-lint.sh BACKLOG.md` → `structure OK`; passes
   today because all five required headings exist. It must still pass after the edits.
2. **GREEN — A, B, C** (in-place), in that order.
3. **GREEN — D** (move), then **E** (lead), then **F** (gate.md).
4. **REFACTOR / self-check** —
   - `grep -n -i 'next minor\|re-check on' adapters/codex/README.md adapters/README.md docs/contributing/specs/codex-poc-record.md BACKLOG.md`
     prints exactly 2 lines, both in BACKLOG at line numbers greater than
     `grep -n '^### Closed — won' BACKLOG.md` (Requirement 9).
   - `grep -n "Prove craft's shared skills load by reference" BACKLOG.md` prints exactly one
     line, after the `### Closed — won't-do` heading.
   - `awk '/^### Open — B\./,/^### Open — C\./' BACKLOG.md | grep -c '^\*\*Prove'` → 0.
   - `grep -n 'STILL DISPROVEN\|stays OPEN (codex-0.162.1' BACKLOG.md` prints nothing.
   - `wc -l BACKLOG.md` grew by roughly the inserted lines (≈ 28); `tail -c1 BACKLOG.md | od -c`
     shows a single `\n`.

### Gate

```
bash scripts/backlog-lint.sh BACKLOG.md
git diff --no-ext-diff BACKLOG.md docs/contributing/specs/gate.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok|intention-lint|backlog-lint' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(backlog): close codex by-reference skills as a standing limitation`

## Part 4 — code and test pins name the payload capture and its 0.163.0 re-confirmation

### Context

Files edited: `adapters/codex/src/git-guard-adapter.js`,
`adapters/codex/test/fixtures/pre-tool-use-payload.js`,
`adapters/codex/test/git-guard-adapter.test.js`. Comments and one describe title only — no
signature, export, assertion or row changes. Not edited: the fixture JSON
adapters/codex/test/fixtures/pre-tool-use-bash.json (its bytes are the 0.162.1 capture; 0.163.0
compared keys only). Not test-only: the src comment changes too.

1. `adapters/codex/src/git-guard-adapter.js` L66–67, comment block above `bridgeExecutedCommand`.
   Current:
   ```
   // fail-closed verdict. The payload was re-pinned on codex 0.162.1 and is still
   // Claude-shaped; it additionally carries `model`, `permission_mode`,
   ```
   New (replaces exactly those two lines; L68 `// `tool_use_id`, `turn_id`, …` onward unchanged):
   ```
   // fail-closed verdict. The payload was captured on codex 0.162.1, its key set
   // re-confirmed on 0.163.0, and is still Claude-shaped; it additionally carries
   // `model`, `permission_mode`,
   ```
2. `adapters/codex/test/fixtures/pre-tool-use-payload.js` L5, comment on `preToolUseBash(command)`.
   Current: `// The live codex 0.162.1 PreToolUse Bash payload, with its command replaced.`
   New:
   ```
   // The live codex PreToolUse Bash payload captured on 0.162.1 (key set re-confirmed on
   // 0.163.0), with its command replaced.
   ```
3. `adapters/codex/test/git-guard-adapter.test.js` L337. Current:
   `describe('decideGuard() - default guard composes the git verdict on the live 0.162.1 payload', () => {`
   New:
   `describe('decideGuard() - default guard composes the git verdict on the live codex payload', () => {`

Baseline at 5f529c7: `node --test adapters/codex/test/git-guard-adapter.test.js` reports
`# tests 86`, `# suites 18`, `# pass 86`, `# fail 0`.

After this part, `git grep -n '0\.162\.1' -- adapters/codex/src adapters/codex/test` hits only
the two new comments (each now also names 0.163.0) — the describe title carries no version.
Stryker does not apply (comment and title strings are not mutated behaviour).

Read-only reference: docs/contributing/design/codex-0163-reprobe.md (Part 4, L334–356).

### TDD steps

No RED: no behaviour changes, and a test pinning comment wording would pin prose.

1. **GUARD (baseline)** — `node --test adapters/codex/test/git-guard-adapter.test.js 2>&1 | grep -E '^# (tests|suites|pass|fail)'`
   → `# tests 86`, `# suites 18`, `# pass 86`, `# fail 0`. It passes because the suite is green
   at HEAD; record the four numbers.
2. **GREEN** — apply edits 1, 2, 3.
3. **GUARD (nothing else moved)** — re-run the step-1 command: the four numbers are identical.
   Then `node --test adapters/codex/test/git-guard-adapter.test.js 2>&1 | grep -c 'on the live codex payload'`
   ≥ 1 and `... | grep -c 'live 0.162.1 payload'` = 0 (the title renamed, not duplicated).
4. **REFACTOR / self-check** —
   - `git diff --no-ext-diff --stat` lists exactly the three files;
     `git diff --no-ext-diff --quiet adapters/codex/test/fixtures/pre-tool-use-bash.json` exits 0.
   - `git diff --no-ext-diff -U0 adapters/codex | grep -E '^[-+][^-+]'` shows only comment lines
     (`// …`) and the one `describe(` line.
   - `git diff --no-ext-diff -U0 adapters/codex | grep -nE 'ADR|adr-|BACKLOG'` prints nothing (no
     provenance refs).

### Gate

```
node --test adapters/codex/test/git-guard-adapter.test.js 2>&1 | grep -E '^# (tests|suites|pass|fail)'   # 86 / 18 / 86 / 0
git diff --no-ext-diff --quiet adapters/codex/test/fixtures/pre-tool-use-bash.json && echo fixture-untouched
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`chore(codex): name the payload capture and its 0.163.0 key-set re-confirmation`

## Decision candidates

ADRs 674–678 settle every load-bearing choice of the design (decision candidates 1–6, all
closed). Three plan-level choices remain; the plan is written to each recommendation.

| # | Choice | Options | Recommendation |
|---|---|---|---|
| PD-1 | Where the BACKLOG malformed-rules 0.163.0 sentence sits (Part 3 A) | (a) append after the 0.162.1 evidence pointer, with its own `*Re-probe — codex-cli 0.163.0*` pointer; (b) insert before "Treat a malformed rules file as fail open." without a pointer | **(a)** — ADR-678's consequence: every 0.163.0 pin points at a record row |
| PD-2 | Record L21 (install path) status cell | (a) also append `0.163.0` to the status, as the evidence text gains "and 0.163.0"; (b) evidence text only, as the design's table lists | **(a)** — row 1 re-observed the vendored layout, so ADR-320 allows the status re-label and the row stays self-consistent |
| PD-3 | Commit type for Part 4 (src comment + test title, no behaviour) | (a) `chore(codex)`; (b) `test(codex)`; (c) `docs(codex)` | **(a)** — it touches src and test without behaviour; neither `test` nor `docs` describes both |
