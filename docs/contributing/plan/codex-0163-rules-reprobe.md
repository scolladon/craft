# Plan — codex 0.163.0 rules-path and launch-flag re-probe: still fails open, the TUI warns on screen

> Source: design doc `docs/contributing/design/codex-0163-rules-reprobe.md` · ADRs `679-683`
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

## Overview — three parts, the design's Parts 1–3

| Part | Ships | Files edited | Commit type |
|---|---|---|---|
| 1 | POC record: new `### Rules paths and launch flag (0.163.0, signed in)` subsection, trimmed *Not re-probed* paragraph, five in-place re-labels | the record | `docs(codex)` |
| 2 | codex README: launch flag re-pinned to 0.163.0; malformed-rules bullet re-pinned to 0.162.1 and 0.163.0 with the on-screen badge | codex README | `docs(codex)` |
| 3 | BACKLOG: group B lead, entry heading, dated 0.163.0 paragraph replacing the "not re-probed" sentence; `gate.md` launch-flag clause | BACKLOG, gate spec | `docs(backlog)` |

Order matters: Parts 2 and 3 cite the record subsection Part 1 creates. Parts share one working
tree and build on each other; each part is one atomic commit. No part adds a doc, so no part
touches the README corpus counts (the design commit bumped design docs to 94; this plan commit
bumps plans to 92). No `src`, test or template line changes anywhere.

Part 3 quotes the record path inside the BACKLOG text it writes. plan-lint may print an advisory
cognitive-locality warning for that quoted path: it is quoted text, not an edited file, so the
parts stay separate.

## Facts every part needs (verified against this tree at db9f551 — do not re-verify)

- **No live codex, ever.** The evidence is the design's *Pinned matrix — codex-cli 0.163.0,
  2026-10-22 (second batch)* (design L26–57, rows 1–5c, plus its *Method* bullets L28–41). This
  plan already spells every replacement out; copy it verbatim. Never cite an out-of-repo scratch
  path.
- **Outcome: neither rules path fails closed on 0.163.0; the posture stays "treat as fail open"
  (ADR-574).** The only new observation: the interactive TUI's status line shows
  `⚠ 1 warning · f2 to view` before the prompt is sent, and the command still runs.
- **Decided wording** (ADRs 679–683, all adopted as the design recommended):
  - ADR-679: the signed-in rows go in a `### Rules paths and launch flag (0.163.0, signed in)`
    subsection inside `## Re-probe — codex-cli 0.163.0`, with its own method paragraph; the
    section name stays valid for every citer.
  - ADR-680: the on-screen warning sits beside the 0.162.1 "nothing on screen" pin, each pinned
    to its version; the record row alone adds the driver caveat (operator in a real terminal on
    0.162.1, scripted pty on 0.163.0, so whether 0.162.1 showed the badge is not established).
    No line claims codex changed.
  - ADR-681: the stub-git bypass (`/bin/zsh -lc` + `path_helper`) lives in the subsection's
    method paragraph only.
  - ADR-682: `thread/start` writing `trust_level = "trusted"` is one clause of the app-server
    control row; no README or BACKLOG claim.
  - ADR-683: group B gains one new `Delivered 2026-10-22 (codex-0163-rules-reprobe): …` lead
    paragraph; existing lead paragraphs are not edited.
- **ADR-320 / ADR-678 (history rule):** only re-observed rows gain a 0.163.0 label, and the older
  pin stays beside the new one. Never edit ADRs, designs, plans, the BACKLOG delivered/closed lead
  paragraphs (L189–205), the BACKLOG 0.162.1 paragraph body (L220–230 up to
  `*Re-probe — codex-cli 0.162.1*.`), or the record's 0.162.1 rows (L576 launch flag, L586 TUI)
  and that section's closing paragraph (L598–601). Row 3's 0.162.1 evidence clause "fails open
  with nothing on screen (3/3)" stays.
- **"Not re-probed" status sentences are replaced, not kept** (the #93 precedent): record L195,
  L335, L639, L645–649 and BACKLOG L230–231.
- **Path hygiene:** committed text uses placeholders (`<throwaway>`, `<target>`, `<work>`,
  `<path>`, `<stub>`, `<cwd>`, `<marker>`), never a home-rooted path. `~/.codex` stays as the
  generic name of codex's default home.
- **No provenance refs in the README** (Part 2): the codex README is scanned by the provenance
  loop in adapters/codex/test/native-surface.test.js. Version strings are fine; ADR, part and
  run-slug references are not.
- **Line numbers are pre-edit anchors at db9f551.** Inside a file, edit bottom-up so no cited
  line moves under a later step. Each edit also names a unique text anchor; if a line has
  shifted, locate by the text.
- **Git etiquette:** plain `/usr/bin/git <verb>`; `git diff`/`git show` need `--no-ext-diff`;
  stage explicit paths only (never `commit -a`, never `add -A`); never checkout/reset/stash.
- **Gates:** `nice -n 19 bash scripts/ci.sh` (≈10 s; node --test suites, adr/design/backlog/
  docs-structure/intention/readme-drift lints; prose-lint is advisory). Pipe its output to a
  file and grep it; do not read it whole.

## Part 1 — record the 0.163.0 app-server, TUI and launch-flag re-probe in the POC record

### Context

File edited: `docs/contributing/specs/codex-poc-record.md` (649 lines at db9f551, single
trailing newline). No frontmatter, so `intention-lint` skips it — do not add frontmatter.
test/source-hygiene.test.js scans docs/contributing/specs for technique tokens
(`stryker|mutmut|mutation|mutant|…`) and test/living-corpus.test.js lists the record: the new
text must contain none of those tokens. The model to mirror is the first table of
`## Re-probe — codex-cli 0.163.0` (L603–643).

**In-place edits — apply bottom-up, in this order:**

| Line | Anchor text | Exact change |
|---|---|---|
| L645–649 | `**Not re-probed** (they need auth or an attended session), so they keep their 0.162.1 pins: the app-server and TUI malformed-rules fail-open, …` (ends L649 `` `shell_tool` switches, the tool shell, and the heredoc idiom. ``) | Replace the whole paragraph with: the new subsection below, one blank line, then the trimmed paragraph (re-wrap to ~100 columns): `` **Not re-probed** on 0.163.0, so they keep their 0.162.1 pins: the hook timeout and default-timeout rows, the project-config override, trust `--check` idempotence and ALLOW, the `execpolicy check` and `cmp` rows, the `unified_exec` and `shell_tool` switches, the tool shell, and the heredoc idiom. `` The file ends with that paragraph and one trailing newline |
| L639 (row `` `[features] unified_exec_tty = false` (0.163.0) ``) | cell ends `` The `-c features.unified_exec_tty=false` launch flag was not re-probed. | `` | that sentence → `` The `-c features.unified_exec_tty=false` launch flag is re-probed under *Rules paths and launch flag (0.163.0, signed in)* below. `` (rest of the row unchanged) |
| L605 | `` Method: 2026-10-22. Throwaway `HOME`/`CODEX_HOME` homes made with `mktemp` (`<throwaway>`): one `` | `Method: 2026-10-22.` → `Method, for the table below: 2026-10-22.` (scopes "no step needed auth", L607, to the first batch; re-wrap L605–606 only if needed) |
| L335 row 3, status cell | `` **fail-open on the app-server path, fail-closed on `codex exec` (0.162.1) — treat as fail open** `` | → `` **fail-open on the app-server path, fail-closed on `codex exec` (0.162.1; re-confirmed 0.163.0) — treat as fail open** `` |
| L335 row 3, last evidence sentence | `` 0.163.0: the `codex exec` refusal re-confirmed (3/3); the app-server path was not re-probed. `` (just before the closing ` |`) | → `` 0.163.0, by side effect (3/3 each): `codex exec` refuses to start; the app-server path warns, skips the rules and runs the command; the TUI fails open through its daemon, and its status line shows `⚠ 1 warning · f2 to view` before the prompt is sent. `` Every earlier sentence of the cell, the 0.162.1 "nothing on screen (3/3)" clause included, stays |
| L324 (design said L324–325; the sentence sits wholly on L324) | `` Rows 0, 1 and 3 were revisited on `codex-cli 0.163.0` too; see `Re-probe — codex-cli 0.163.0`. `` | append right after it, before `Method note:`: `` Row 3's app-server and TUI paths are under its *Rules paths and launch flag (0.163.0, signed in)* subsection. `` |
| L317 heading | already reads `rows 0, 1, 3: revisited 2026-10-22 on 0.163.0` | **unchanged** |
| L195 (*Execpolicy*) | `` On 0.163.0 the `codex exec` refusal re-confirmed (3/3); the app-server and TUI paths were not re-probed. `` | → `` On 0.163.0 all three re-confirmed by side effect (3/3 each); the TUI's status line also shows `⚠ 1 warning · f2 to view` before the prompt is sent, and the command still runs. `` The following `` Still treat a malformed `.rules` file as fail open. `` stays; "with nothing on screen (3/3)" before it stays |

**Not re-labelled:** the 0.162.1 TUI row (L586), the 0.162.1 launch-flag row (L576), the 0.162.1
section's closing paragraph (L598–601), row 3's 0.162.1 evidence sentence, the L317 heading, and
L54 (an unrelated 0.144.6 "was not re-probed").

**New subsection — inserted where the old *Not re-probed* paragraph started (after the first
table, which ends L643, and its blank line L644), verbatim (without the fence lines), followed by
one blank line and the trimmed paragraph:**

```markdown
### Rules paths and launch flag (0.163.0, signed in)

Method: 2026-10-22, a second batch. The app-server and TUI probes share one throwaway
`HOME`/`CODEX_HOME` (`<throwaway>`), signed in by `codex login` run inside it; no `auth.json` was
copied. The launch-flag probes ran offline against the fake Responses provider, with no auth and
one fresh throwaway home and work dir per case. Every `codex` invocation was wrapped,
`--version` and `generate-json-schema` included. Isolation proven by
`find ~/.codex -newer <marker>` = 0 entries after every batch. One false alarm, disclosed: run
from a shell that had exported the throwaway `HOME`, `~/.codex` named the throwaway's own
directory and counted 3 entries; the real home held 0. Rules variants at
`$CODEX_HOME/rules/craft.rules`: the committed file (control) and the committed file minus its
last line `)` (malformed). Ground truth: an untracked `VICTIM.txt` in a `git init` throwaway target
with one tracked file. The TUI was driven by a script under `expect`, not by an operator in a real
terminal as on 0.162.1: a 40x140 pty, `TERM=xterm-256color`, the `ESC[6n` cursor query answered,
the target pre-trusted in `config.toml`, the prompt submitted with the kitty-protocol Enter
`ESC[13u` (a plain CR does not submit), F2 sent as `ESC[Q`. The detached daemon was killed between
runs and its `daemon.stderr.log` removed before each. A stub `git` first on `PATH` is not a
reliable signal under the tool shell: `PATH=<stub>:$PATH /bin/zsh -lc 'command -v git'` →
`/usr/bin/git` 3/3, because macOS `/etc/zprofile` (`path_helper`) reorders `PATH` in a login shell,
while `zsh -c` resolves the stub. `VICTIM.txt` is the ground truth; a stub hit only proves that the
command ran.

| Probe | Result |
|---|---|
| Malformed rules, app-server thread/turn (0.163.0) | **CONFIRMED (0.163.0): fails open, unchanged.** `initialize` → `initialized` → `thread/start {cwd, approvalPolicy:"never", sandbox:"workspace-write"}` → `turn/start` asking for `git clean -f`, 3/3: a `configWarning` notification `{"summary":"Error parsing rules; custom rules not applied.","details":"failed to parse rules file <path>: starlark error: … Parse error: unexpected new line, expected expression …"}` and the stderr line `ERROR codex_app_server: Error parsing rules; …`; a `commandExecution` item `/bin/zsh -lc 'git clean -f'`, exit 0, output `Removing VICTIM.txt`; `VICTIM.txt` deleted. |
| App-server control (0.163.0) | **CONFIRMED (0.163.0): blocked.** Committed rules, 3/3: no warning, no `commandExecution` item, `VICTIM.txt` survived; the agent reported the command rejected by the safety policy. Each `thread/start` wrote `[projects."<cwd>"] trust_level = "trusted"` into the throwaway's `config.toml` for its cwd. |
| Interactive TUI rules path (0.163.0) | **CONFIRMED (0.163.0): fails open, through the app-server, unchanged.** `codex -a never -s workspace-write -C <target>`, 3/3: the daemon (binary under `$CODEX_HOME/packages/app-server-daemon/releases/0.163.0-…`) logs `Error parsing rules` once in `app-server-daemon/daemon.stderr.log`, and `git clean -f` ran. Run 1 reached the stub (`clean -f` logged; screen `Ran git clean -f └ STUB: clean intercepted`); runs 2 and 3 ran the real git (`Removing VICTIM.txt`, `VICTIM.txt` deleted). Why run 1 resolved the stub was not established. |
| TUI screen, malformed rules (0.163.0) | **CONFIRMED (0.163.0): a warning shows on screen; the command still runs.** Before the prompt is sent, the status line shows `⚠ 1 warning · f2 to view` (3/3). F2 opens `Warnings · 1 of 1 · Startup  Error parsing rules; custom rules not applied.: failed to parse rules file <path>: starlark error … These warnings may reflect settings from when the background server started. If you’ve already fixed them, use /daemon to restart it.` (runs 2 and 3; run 1 sent `ESC OQ`, which did not open the panel). The 0.162.1 row above records nothing on screen, observed by an operator in a real terminal; this batch used a scripted pty, so whether 0.162.1 also showed the badge is not established. |
| TUI control (0.163.0) | **CONFIRMED (0.163.0): blocked.** Committed rules, 3/3: `VICTIM.txt` survived, the stub never logged `clean`, no daemon parse error, no warning badge, F2 → `No warnings`; the agent reported the command blocked by the execution policy. |
| Launch flag `-c features.unified_exec_tty=false` (0.163.0) | **CONFIRMED (0.163.0): closed, unchanged.** `codex exec --json --skip-git-repo-check -s workspace-write -C <work>`; the fake model forces `exec_command {cmd:"sh", tty:true}`, then `write_stdin {session_id, chars:"echo WS_MARKER > ws_marker.txt\nexit\n"}` if a session id comes back; `tty` read from the request's `exec_command` parameters. With the flag and no config key, 3/3, and with the flag over a config `[features] unified_exec_tty = true`, 3/3: `tty` absent, ``TTY execution is disabled by config; omit `tty` or set it to false.``, marker absent. Controls, no flag and no key (3/3) and config `true` without the flag (1/1): `tty` present, `Process running with session ID …`, marker present. No hook was configured, so the hook's firing order was not observed. |
```

Keep the curly apostrophe in `If you’ve` and the `⚠`/`└` characters exactly as written (they
are the captured screen text). No cell contains an unescaped `|`.

Read-only references: docs/contributing/design/codex-0163-rules-reprobe.md (Part 1, L157–217),
docs/contributing/adr/679-codex-signed-in-reprobe-rows-get-their-own-subsection.md,
docs/contributing/adr/680-codex-tui-screen-observations-stay-pinned-per-driver.md,
docs/contributing/adr/681-codex-stub-git-bypass-lives-in-the-batch-method.md,
docs/contributing/adr/682-codex-thread-start-trust-write-is-recorded-without-a-guard-claim.md.

### TDD steps

No behaviour changes and no test asserts over this evidence record; a text pin would pin
wording, not behaviour. The executable checks are the repo's gates.

1. **GUARD (gate-first)** — before editing:
   `node --test test/source-hygiene.test.js test/living-corpus.test.js 2>&1 | grep -E '^# (pass|fail)'`
   → `# fail 0`; it passes today because the record carries no banned token. It must still pass
   after the edit.
2. **GREEN — tail first** — replace L645–649 with the new subsection + trimmed paragraph.
3. **GREEN — in-place edits** — apply the remaining table rows bottom-up: L639 → L605 → L335
   (both changes) → L324 → L195.
4. **REFACTOR / self-check** —
   - `grep -n -i 'not re-probed' docs/contributing/specs/codex-poc-record.md` prints exactly two
     lines: L54 (unrelated, 0.144.6) and the trimmed `**Not re-probed** on 0.163.0` paragraph;
     neither names the app-server path, the TUI path or the launch flag.
   - `grep -n 'nothing on screen\|nothing sh' docs/contributing/specs/codex-poc-record.md`: every
     hit is pinned to 0.162.1 (L195's "with nothing on screen (3/3)" follows the 0.162.1 split;
     row 3's clause is in its 0.162.1 sentence; the new TUI-screen row names 0.162.1).
   - `grep -c '^### Rules paths and launch flag (0.163.0, signed in)$' docs/contributing/specs/codex-poc-record.md` → 1,
     and it sits after `## Re-probe — codex-cli 0.163.0`.
   - Every new table row has exactly two cells (a row starts and ends with `|` and has one
     separator).
   - `tail -c1 docs/contributing/specs/codex-poc-record.md | od -c` shows a single `\n`.

### Gate

```
node --test test/source-hygiene.test.js test/living-corpus.test.js 2>&1 | grep -E '^# (pass|fail)'
grep -nE 'stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b' docs/contributing/specs/codex-poc-record.md   # must print nothing
git diff --no-ext-diff docs/contributing/specs/codex-poc-record.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(codex): record the 0.163.0 app-server, TUI and launch-flag re-probe`

## Part 2 — codex README: re-pin the rules split and launch flag to 0.163.0

### Context

File edited: `adapters/codex/README.md` (261 lines at db9f551). Both edits are in the Guard
section's bullet list. Its pins live in adapters/codex/test/native-surface.test.js (read-only,
unchanged):

- README-wide `/fail open/i` (L369–373) and `/refuses?\s+to\s+start/i` (L375–379): the new
  malformed-rules bullet keeps both literals.
- Guard-section sentence predicates (L557–563: a sentence with `write_stdin` + `reopens`;
  L574–580: a sentence with `.codex/config.toml` + `unified_exec_tty = true`): both live in the
  `write_stdin` bullet's L204–207 sentences, which this part does not touch.
- Configure and Usage launch-flag pins (L544–548, L565–572): lines this part does not touch.
- Provenance and shell-injection loops over every authored surface (L327–342; the design cited
  L278–305, which drifted): write no ADR, part or run-slug reference into the README.

**Edit A (bottom first) — L216–222, the malformed-rules bullet.** Current:

```
- A malformed `craft.rules` file **may fail open** at runtime, so treat it as fail open.
  On codex 0.162.1 the outcome depends on how codex is driven: `codex exec`, this
  binding's launch path, refuses to start, so the run stops loudly (re-confirmed on 0.163.0); the app-server
  thread/turn path logs a warning, skips the rules, and runs the command anyway. The
  interactive TUI runs its turns through an app-server daemon and fails open the same way;
  nothing shows on screen, and the warning lands only in
  `$CODEX_HOME/app-server-daemon/daemon.stderr.log`.
```

New, verbatim:

```
- A malformed `craft.rules` file **may fail open** at runtime, so treat it as fail open.
  On codex 0.162.1 and 0.163.0 the outcome depends on how codex is driven: `codex exec`, this
  binding's launch path, refuses to start, so the run stops loudly; the app-server
  thread/turn path logs a warning, skips the rules, and runs the command anyway. The
  interactive TUI runs its turns through an app-server daemon and fails open the same way.
  The daemon logs the warning to `$CODEX_HOME/app-server-daemon/daemon.stderr.log`. On
  0.163.0 the TUI status line also shows `⚠ 1 warning · f2 to view` before the first prompt,
  and the command still runs; on 0.162.1 nothing showed on screen.
```

"(re-confirmed on 0.163.0)" after "stops loudly" goes (the leading "On codex 0.162.1 and
0.163.0" covers it); "the warning lands only in" goes (false on 0.163.0). The 0.162.1 "nothing
showed on screen" stays, pinned (ADR-680, README short form; the driver caveat lives only in the
record).

**Edit B — L201, inside the `write_stdin` bullet (L200–209).** Current L201:

```
  and by the launch flag `-c features.unified_exec_tty=false` (pinned on 0.162.1). Codex refuses `tty: true` with
```

Change only `(pinned on 0.162.1)` → `(pinned on 0.163.0)`. Nothing else in the bullet changes;
L207 "Only `codex exec` was probed" stays true (the launch-flag probe drove `codex exec` only).

Read-only references: docs/contributing/design/codex-0163-rules-reprobe.md (Part 2, L219–247),
docs/contributing/specs/codex-poc-record.md (cited, already updated by Part 1).

### TDD steps

1. **GUARD (gate-first)** — before editing:
   `node --test adapters/codex/test/native-surface.test.js 2>&1 | grep -E '^# (pass|fail)'`
   → `# fail 0`; it passes today because the README holds `fail open`, `refuses to start`, the
   two Guard sentences, the launch-flag pins and no provenance ref. It must still pass after the
   edits.
2. **GREEN — Edit A** (L216–222), then **Edit B** (L201).
3. **REFACTOR / self-check** —
   - `grep -n 'pinned on 0.162.1' adapters/codex/README.md` no longer hits L201.
   - `grep -n 'lands only in\|re-confirmed on 0.163.0' adapters/codex/README.md` prints nothing.
   - `grep -n 'nothing sh\|nothing on screen' adapters/codex/README.md` prints one line, and it
     reads "on 0.162.1 nothing showed on screen".
   - `grep -n -i 'not re-probed' adapters/codex/README.md adapters/README.md` prints nothing.

### Gate

```
node --test adapters/codex/test/native-surface.test.js 2>&1 | grep -E '^# (pass|fail)'   # expect "# fail 0"
git diff --no-ext-diff adapters/codex/README.md | grep -nE '/Users/|/home/|ADR-?[0-9]'   # must print nothing
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(codex): re-pin the README rules split and launch flag to 0.163.0`

## Part 3 — BACKLOG and gate spec: record the 0.163.0 rules-path and launch-flag re-probe

### Context

Files edited: `BACKLOG.md` and `docs/contributing/specs/gate.md`. `BACKLOG.md` is checked by
scripts/backlog-lint.sh (no structural heading is added or removed here) and read by
`intention-lint`; `gate.md` carries `subjects:` frontmatter read by `intention-lint` — do not
touch the frontmatter. The malformed-rules entry stays in `### Open — B. Agent-CLI re-probes
(throwaway homes, stub git, attended)` (heading at L187); it is not closed or moved.

**BACKLOG edits — apply bottom-up:**

**A. L230–231, the 0.162.1 paragraph's trailing status sentence.** Current L230–231:

```
*Re-probe — codex-cli 0.162.1*. On 0.163.0 (2026-10-22) the `codex exec` refusal re-confirmed
(3/3); the app-server and TUI paths were not re-probed (*Re-probe — codex-cli 0.163.0*).
```

Delete from ` On 0.163.0 (2026-10-22)` to the end of L231, so the paragraph ends at
`*Re-probe — codex-cli 0.162.1*.`. Then insert one blank line and this new paragraph, verbatim
(it sits before the blank line that precedes `### Open — C. Waiting on an external trigger`,
L233):

```
**Re-probe on 0.163.0 (2026-10-22): unchanged on every surface.** Same ground truth.
`codex exec` refuses to start (3/3); the app-server thread/turn path emits the same
`configWarning` and `git clean -f` deletes `VICTIM.txt` (3/3); the interactive TUI fails open
through its daemon (3/3). Unlike the 0.162.1 observation, the TUI's status line shows
`⚠ 1 warning · f2 to view` before the prompt is sent, and F2 opens the parse error; the
command still runs. With the committed rules every path blocks. Treat a malformed rules file
as fail open. Evidence: `docs/contributing/specs/codex-poc-record.md`,
*Re-probe — codex-cli 0.163.0*.
```

**B. L207–208, the entry heading.** Current:

```
**Malformed `.rules` execpolicy — treat as fail open: on 0.162.1 the app-server path fails open and
`codex exec` refuses to start — recorded 2026-07-21, re-probed 2026-10-15**
```

New (re-wrap to ~100 columns; the bold span stays one span):

```
**Malformed `.rules` execpolicy — treat as fail open: on 0.162.1 and 0.163.0 the app-server path
fails open and `codex exec` refuses to start — recorded 2026-07-21, re-probed 2026-10-15 and
2026-10-22**
```

L209 `(harden-prove-codex-binding, B9). Runtime auto-loads …` stays and still follows the heading
directly.

**C. Group B lead paragraph.** After the `Closed 2026-10-22 (codex-0163-reprobe)` paragraph
(L202–205, ends `history: *Closed — won't-do*.`) and its blank line L206, before the entry
heading, insert verbatim, followed by one blank line:

```
Delivered 2026-10-22 (codex-0163-rules-reprobe): on codex 0.163.0 a malformed `craft.rules`
still fails open on the app-server thread/turn path and in the interactive TUI (3/3 each,
`VICTIM.txt` deleted), and `codex exec` still refuses to start. The TUI's status line
shows `⚠ 1 warning · f2 to view` before the prompt is sent; the command still runs. The
`-c features.unified_exec_tty=false` launch flag still closes `write_stdin`, over a config
`unified_exec_tty = true` too (3/3). Record: `docs/contributing/specs/codex-poc-record.md`,
*Re-probe — codex-cli 0.163.0*. The binding is unchanged: a malformed rules file is still
treated as fail open.
```

Untouched: L189–205 lead paragraphs, L209–218 entry body, L220–230 0.162.1 paragraph up to
`*Re-probe — codex-cli 0.162.1*.` ("with nothing on screen (3/3, 2026-10-21)" included).

**D. `docs/contributing/specs/gate.md` L278.** Current:

```
  (offline probe 2026-10-18, 0.162.1; the template key re-confirmed 2026-10-22 on 0.163.0).
```

New (keep the two-space indent; re-wrap the paragraph's following lines only if needed):

```
  (offline probe 2026-10-18, 0.162.1; the template key and the flag re-confirmed 2026-10-22 on
  0.163.0).
```

L281 "Only `codex exec` was probed (not the TUI or app-server turns)" stays true.

Read-only references: scripts/backlog-lint.sh, docs/contributing/design/codex-0163-rules-reprobe.md
(Part 3, L249–299), docs/contributing/adr/683-codex-rules-reprobe-gets-a-group-b-lead-paragraph.md,
docs/contributing/specs/codex-poc-record.md (cited, already updated by Part 1).

### TDD steps

1. **GUARD (gate-first)** — `bash scripts/backlog-lint.sh BACKLOG.md` → `structure OK`; passes
   today because every required heading exists. It must still pass after the edits.
2. **GREEN — BACKLOG A, B, C** (bottom-up, in that order), then **D** (gate.md).
3. **REFACTOR / self-check** —
   - `grep -n -i 'not re-probed' BACKLOG.md` prints nothing.
   - `grep -c '^\*\*Re-probe on 0.163.0 (2026-10-22): unchanged on every surface.\*\*' BACKLOG.md` → 1,
     located after the `**Re-probe on 0.162.1 (2026-10-15)` paragraph and before
     `### Open — C.`.
   - `grep -n 'Delivered 2026-10-22 (codex-0163-rules-reprobe)' BACKLOG.md` → one line, after
     `Closed 2026-10-22 (codex-0163-reprobe)` and before `**Malformed`.
   - `grep -n 'the template key and the flag re-confirmed' docs/contributing/specs/gate.md` → one line.
   - Design test strategy greps over the whole change:
     `git grep -n -i 'not re-probed' -- docs/contributing/specs/codex-poc-record.md BACKLOG.md adapters/codex/README.md adapters/README.md`
     matches only record L54 and the record's trimmed `**Not re-probed** on 0.163.0` paragraph;
     `git grep -n 'nothing sh\|nothing on screen' -- . ':!docs/contributing/design' ':!docs/contributing/plan' ':!docs/contributing/adr'`
     — every hit carries a 0.162.1 pin (BACKLOG L198 and L228 are inside 0.162.1 paragraphs).

### Gate

```
bash scripts/backlog-lint.sh BACKLOG.md
git diff --no-ext-diff BACKLOG.md docs/contributing/specs/gate.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; nice -n 19 bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok|intention-lint|backlog-lint' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(backlog): record the 0.163.0 rules-path and launch-flag re-probe`

## Decision candidates

ADRs 679–683 settle every load-bearing choice of the design (decision candidates 1–5, all
adopted as recommended). Two plan-level choices remain; the plan is written to each
recommendation.

| # | Choice | Options | Recommendation |
|---|---|---|---|
| PD-1 | Re-wrap of the BACKLOG entry heading (Part 3 B), which grows past 100 columns | (a) re-wrap the bold span over three lines; (b) keep two lines and let the first overflow | **(a)** — the file wraps at ~100 columns and backlog-lint reads the entry by its bold opener, which stays on the first line |
| PD-2 | Where the record's 0.162.1/0.163.0 pointer for row 3 lands (Part 1 L324) | (a) append after the existing 0.163.0 pointer sentence on L324; (b) a new sentence in the method note after L328 | **(a)** — the design names the L324 pointer sentence; the method note is about wrapping invocations, and ADR-681 keeps stub/method findings out of it |
