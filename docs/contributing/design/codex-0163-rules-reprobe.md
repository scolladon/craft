# Design — codex 0.163.0 rules-path and launch-flag re-probe: still fails open, the TUI warns on screen

> Brief: re-probe, on codex-cli 0.163.0, the three rows that *Re-probe — codex-cli 0.163.0* in
> `docs/contributing/specs/codex-poc-record.md` lists as "Not re-probed" because they need auth or
> an attended session: the app-server malformed-rules path, the interactive-TUI malformed-rules
> path, and the `-c features.unified_exec_tty=false` launch flag. Re-pin only the rows that were
> re-observed (ADR-320, ADR-678). Decision point the user reserved: if either rules path now fails
> closed, changing the treat-as-fail-open posture (ADR-574) is the user's call.
> Status: draft → self-reviewed ×3 (2026-10-22). The reserved decision point did not trigger.

---

## Context

The orchestrator ran the probe live on 2026-10-22 (Paris 13:52–15:30; UTC 11:52–13:30). **This
design records that evidence and does not re-derive it. The designer ran no codex command and
designed nothing from memory of codex.** The designer added read-only repo facts only: file
contents and greps.

**Outcome: neither rules path fails closed on 0.163.0, so the reserved decision point is not
triggered and the posture stays "treat as fail open".** Both fail-open paths and the launch flag
behave as on 0.162.1. One observation differs: the interactive TUI shows a warning on screen
before the prompt is sent, and the command still runs. This is a docs-only change. No `src`,
test or template line changes.

### Pinned matrix — codex-cli 0.163.0, 2026-10-22 (second batch)

**Method.**

- **Homes.** The app-server and TUI probes share one throwaway `HOME`/`CODEX_HOME` made with
  `mktemp`, signed in by `codex login` run inside it (browser sign-in). No `auth.json` was copied.
  An earlier attempt to sign in from the operator side left no `auth.json`, twice; the cause was
  not established, and that attempt is not part of the evidence.
- **Wrapping.** Every codex invocation was wrapped in the throwaway env, `--version` and
  `generate-json-schema` included.
- **Isolation.** `find ~/.codex -newer <marker>` returned 0 entries after every batch. One false
  alarm, disclosed: a `find ~/.codex` run from a shell that had exported the throwaway `HOME`
  counted the throwaway's own directory (3 entries); the real home held 0.
- **Rules variants** at `$CODEX_HOME/rules/craft.rules`: the committed `adapters/codex/craft.rules`
  (control) and that file minus its last line `)` (malformed).
- **Ground truth.** The side effect on an untracked `VICTIM.txt` in a `git init` throwaway target
  with one tracked file.

| # | Probe | Observation (0.163.0) | Verdict |
|---|---|---|---|
| 1 | App-server thread/turn, malformed | The client sends `initialize` → `initialized` → `thread/start {cwd, approvalPolicy:"never", sandbox:"workspace-write"}` → `turn/start` asking for `git clean -f`, with stdin kept open and a kill timer. 3/3: a `configWarning` notification `{"summary":"Error parsing rules; custom rules not applied.","details":"failed to parse rules file <path>: starlark error: error: Parse error: unexpected new line, expected expression …"}` and a stderr line `ERROR codex_app_server: Error parsing rules; …`. A `commandExecution` item `/bin/zsh -lc 'git clean -f'`, exit 0, output `Removing VICTIM.txt`; `VICTIM.txt` deleted | **FAILS OPEN**, unchanged |
| 2 | App-server control, committed rules | 3/3: no warning, no `commandExecution` item, `VICTIM.txt` survived; the agent reports the command rejected by the safety policy. Side effect: each `thread/start` wrote `[projects."<cwd>"] trust_level = "trusted"` into the throwaway's `config.toml` for its cwd | blocked |
| 3 | Interactive TUI, malformed | `codex -a never -s workspace-write -C <target>`, driven by the session under `expect`, not by an operator in a real terminal as on 0.162.1. Setup: 40x140 pty, `TERM=xterm-256color`, the `ESC[6n` cursor query answered, the target pre-trusted in `config.toml`, the prompt submitted with the kitty-protocol Enter `ESC[13u` (a plain CR does not submit: the TUI turns the kitty keyboard protocol on). Stub `git` first on `PATH`: it logs argv, `clean` deletes nothing, anything else passes through to `/usr/bin/git`. The detached daemon (binary under `$CODEX_HOME/packages/app-server-daemon/releases/0.163.0-aarch64-ap…`) was killed between runs, and its `app-server-daemon/daemon.stderr.log` removed before each run. 3/3: the daemon log holds `Error parsing rules` (1 line) and the command ran. Run 1 reached the stub (`clean -f` logged; screen `Ran git clean -f └ STUB: clean intercepted`). Runs 2 and 3 ran the real git (`Removing VICTIM.txt`, `VICTIM.txt` deleted) | **FAILS OPEN**, unchanged |
| 3a | TUI screen, malformed | Before the prompt is sent, the status line shows `⚠ 1 warning · f2 to view` (3/3). F2, sent as `ESC[Q`, opens `Warnings · 1 of 1 · Startup  Error parsing rules; custom rules not applied.: failed to parse rules file <path>: starlark error … These warnings may reflect settings from when the background server started. If you’ve already fixed them, use /daemon to restart it.` That panel was captured for runs 2 and 3. Run 1 sent the wrong F2 sequence (`ESC OQ`), but its screen shows the badge | **DIFFERS** from the 0.162.1 row ("the screen shows nothing", operator-observed) |
| 3b | Stub reliability (method) | `PATH=<stub>:$PATH /bin/zsh -lc 'command -v git'` → `/usr/bin/git`, 3/3: in a login shell, macOS `/etc/zprofile` (`path_helper`) reorders `PATH`, and with a throwaway `HOME` no user profile puts the stub back. `zsh -c` → the stub. So `VICTIM.txt` is the ground truth, and the stub proves only that the command ran when it is hit | method finding |
| 4 | TUI control, committed rules | 3/3: `VICTIM.txt` survived, the stub never logged `clean`, no daemon parse error, no warning badge, F2 → `No warnings`; the agent reports the command blocked or rejected by the execution policy | blocked |
| 5a | Launch flag, no config key | Offline: a fake Responses provider (SSE server written by the session, `[model_providers.fake] wire_api = "responses"`, model `gpt-5.5`). One fresh `mktemp` `HOME`/`CODEX_HOME` and one `mktemp` work dir per case, no auth. Command: `codex exec --json --skip-git-repo-check -s workspace-write -C <work>`. The fake model forces `exec_command {cmd:"sh", tty:true}`, then, if a session id comes back, `write_stdin {session_id, chars:"echo WS_MARKER > ws_marker.txt\nexit\n"}`. `tty` presence is read from the `exec_command` parameters in the request body. With `-c features.unified_exec_tty=false`, 3/3: `tty` absent; output ``TTY execution is disabled by config; omit `tty` or set it to false.``; marker absent | **CLOSED**, unchanged |
| 5b | Launch flag over config `true` | The same flag over a config `[features] unified_exec_tty = true`, 3/3: same as 5a | **CLOSED**, unchanged |
| 5c | Controls | No flag and no key (3/3), and config `true` without the flag (1/1): `tty` present, `Process running with session ID …`, marker present | open, as expected |

No hook was configured in probe 5, so the firing order recorded on 0.162.1 for the config-key
case was not re-observed.

### Facts found while mapping the change (each with its proof)

- **The 0.163.0 section already exists and its method paragraph contradicts this batch.**
  `codex-poc-record.md` L605–612 says "No `auth.json` was copied into any of them, and no step
  needed auth". That stays true of the first batch, but it is false of probes 1–4, which ran
  signed in. A row appended to that table would sit under a method it does not follow. See
  *Decision candidates* 1.
- **Five living lines state "not re-probed" for these rows, and this run makes each false.**
  - record L195 (*Execpolicy*): "the app-server and TUI paths were not re-probed"
  - record L335 (row 3 evidence): "the app-server path was not re-probed"
  - record L639 (0.163.0 config-key row): "The `-c features.unified_exec_tty=false` launch flag
    was not re-probed."
  - record L645–649 (the *Not re-probed* paragraph)
  - BACKLOG L230–231: "the app-server and TUI paths were not re-probed"

  These are status claims, not version pins. The #93 precedent replaced the status sentence of
  row 1 ("Still a codex limitation; stays OPEN.") instead of keeping it, so these get the same
  treatment.
- **The open-rows heading (record L317) already reads "rows 0, 1, 3: revisited 2026-10-22 on
  0.163.0".** Row 3 is revisited again on the same date and version, so the heading stays as it is.
  Only the L324–325 pointer sentence names the new subsection.
- **"Nothing on screen" for the TUI sits on six living lines.** `git grep 'nothing shows on
  screen\|nothing on screen'` outside the design/plan/ADR history returns record L195 and L335,
  BACKLOG L198 and L228, and `adapters/codex/README.md` L221. The record's 0.162.1 TUI row (L586)
  says "the screen shows nothing". Every one of those lines is pinned to 0.162.1 except README
  L221–222, which also says "the warning lands only in `$CODEX_HOME/app-server-daemon/daemon.stderr.log`".
  On 0.163.0 that is false, because the badge and the F2 panel show the warning.
- **Two more lines pin the launch flag to 0.162.1, and this run re-observed it.** One is README
  L201: "and by the launch flag `-c features.unified_exec_tty=false` (pinned on 0.162.1)". The
  other is `docs/contributing/specs/gate.md` L278: "(offline probe 2026-10-18, 0.162.1; the
  template key re-confirmed 2026-10-22 on 0.163.0)". The brief names the README line but not
  `gate.md`. ADR-678's context names `gate.md` as an out-of-brief pin it covers, so it is in scope
  under that ADR.
- **The README's "Only `codex exec` was probed" (L207) stays true.** Probe 5 drove `codex exec`
  only. The TUI and app-server tty paths are still unprobed.
- **The stub-bypass finding does not overturn the 0.162.1 TUI row.** On 0.162.1 the operator's
  stub was hit 3/3 (record L586: "stub marker written"). This run's 3b explains why runs 2 and 3
  bypassed it under `/bin/zsh -lc`. It does not explain why run 1 hit it, and nothing was measured
  that bears on the 0.162.1 run. Both rows rest on their own ground truth.
- **No README or test pin reads the on-screen wording.** `native-surface.test.js` L369–378 pins
  only `/fail open/i` and `/refuses?\s+to\s+start/i` README-wide. The Guard-section sentence
  predicates (L557–581) need one sentence with `write_stdin` + `reopens` and one with
  `.codex/config.toml` + `unified_exec_tty = true`. The L201 edit touches neither sentence.

### Constraints already decided

- **ADR-574**: a malformed rules file is treated as fail open, its status split by surface and
  version-pinned. "A future re-probe adds a dated row per surface rather than rewriting the
  status." The `/fail open/i` and `/refuses?\s+to\s+start/i` pins stay matched.
- **ADR-320**: the record carries a dated re-probe section. Only re-observed rows are re-labelled
  elsewhere, and the older pin stays beside the new one. The 0.162.1 TUI row (L586), the 0.162.1
  launch-flag row (L576) and the 0.162.1 section's closing paragraph (L598–601) are not edited.
- **ADR-678**: a re-observed 0.162.1 pin gets a dated 0.163.0 clause, and an unobserved half keeps
  its pin. Here every half of the rules split was re-observed (`codex exec` by #93, app-server and
  TUI by this run), and so was the launch flag.
- **ADR-676 / ADR-675**: name the capture and give no bare counts. Each new row states its own n
  (3/3, 1/1).
- **History is not edited.** ADRs, designs and plans keep their text. So do the BACKLOG delivered
  and closed lead paragraphs (L189–206) and the dated 0.162.1 paragraph of the malformed-rules
  entry (L220–229), except for its trailing "not re-probed" status sentence (see the previous
  section).
- **README corpus counts are gated** (`scripts/readme-drift.sh`). This design commit bumps
  `README.md` L226 design docs 93 → 94. No part adds a doc.

## Requirements

1. `docs/contributing/specs/codex-poc-record.md` records probes 1–5c as dated 0.163.0 rows, each
   naming its n and its ground truth, under a method text that matches how they were run
   (signed-in throwaway, scripted pty, offline fake provider). Each row is marked `(0.163.0)`.
2. The record's four "not re-probed" claims for these rows (L195, L335, L639, L645–649) are
   corrected. The *Not re-probed* paragraph keeps only the rows still unprobed on 0.163.0: hook
   timeout and default timeout, the project-config override, trust `--check` idempotence and ALLOW,
   the `execpolicy check` and `cmp` rows, the `unified_exec` and `shell_tool` switches, the tool
   shell, and the heredoc idiom.
3. Row 3 status and the *Execpolicy* paragraph gain the 0.163.0 re-confirmation. Each still says
   to treat a malformed rules file as fail open.
4. The TUI's on-screen warning is stated as a 0.163.0 observation. No line claims that codex
   changed between 0.162.1 and 0.163.0, and no line drops the 0.162.1 "nothing on screen" pin
   (*Decision candidates* 2).
5. `adapters/codex/README.md` L201 re-pins the launch flag to 0.163.0. L216–222 re-pins the
   surface split to 0.162.1 and 0.163.0, drops "the warning lands only in …" as a current-state
   claim, and keeps the literals `fail open` and `refuses to start`.
6. `BACKLOG.md`: group B gains one lead paragraph for this run. The malformed-rules entry heading
   L207–208 names 0.163.0 and the 2026-10-22 re-probe. Its "not re-probed" sentence (L230–231)
   is replaced by a dated `**Re-probe on 0.163.0 (2026-10-22): …**` paragraph. The entry stays open.
7. `docs/contributing/specs/gate.md` L278 adds the launch flag to the 0.163.0 re-confirmation
   (ADR-678).
8. Every committed artifact uses repo-relative paths and placeholders (`<throwaway>`, `<target>`,
   `<work>`, `<path>`, `<stub>`, `<cwd>`). It never uses a home-rooted path. `~/.codex` stays as
   the generic name of codex's default home.
9. `bash scripts/ci.sh` is green at every commit.

## Design

Three parts, one atomic docs commit each. The order puts the record first, so that every other
surface cites a record that already exists. Line numbers are pre-edit. Inside a file, edit from
the bottom up, so that no cited line moves under a later step.

### Part 1 — `docs/contributing/specs/codex-poc-record.md`: record the rules-path and launch-flag rows

Commit: `docs(codex): record the 0.163.0 app-server, TUI and launch-flag re-probe`.

**Context block**

| Location | Current | Change |
|---|---|---|
| L645–649 | `**Not re-probed** (they need auth or an attended session), so they keep their 0.162.1 pins: the app-server and TUI malformed-rules fail-open, the hook timeout …, the \`-c features.unified_exec_tty=false\` launch flag, the project-config override, …` | Replace it with the new subsection below, then the trimmed paragraph: `**Not re-probed** on 0.163.0, so they keep their 0.162.1 pins: the hook timeout and default-timeout rows, the project-config override, trust \`--check\` idempotence and ALLOW, the \`execpolicy check\` and \`cmp\` rows, the \`unified_exec\` and \`shell_tool\` switches, the tool shell, and the heredoc idiom.` The reason clause goes, because auth was obtained for this batch |
| L639 (`[features] unified_exec_tty = false` (0.163.0)) | ends "The `-c features.unified_exec_tty=false` launch flag was not re-probed." | That sentence becomes "The `-c features.unified_exec_tty=false` launch flag is re-probed under *Rules paths and launch flag (0.163.0, signed in)* below." |
| L605 | `Method: 2026-10-22. Throwaway …` | `Method, for the table below: 2026-10-22. Throwaway …`. This scopes "no step needed auth" to the first batch |
| L335 row 3, status | `**fail-open on the app-server path, fail-closed on \`codex exec\` (0.162.1) — treat as fail open**` | `**fail-open on the app-server path, fail-closed on \`codex exec\` (0.162.1; re-confirmed 0.163.0) — treat as fail open**` |
| L335 row 3, last evidence sentence | `0.163.0: the \`codex exec\` refusal re-confirmed (3/3); the app-server path was not re-probed.` | `0.163.0, by side effect (3/3 each): \`codex exec\` refuses to start; the app-server path warns, skips the rules and runs the command; the TUI fails open through its daemon, and its status line shows \`⚠ 1 warning · f2 to view\` before the prompt is sent.` |
| L324–325 | `Rows 0, 1 and 3 were revisited on \`codex-cli 0.163.0\` too; see \`Re-probe — codex-cli 0.163.0\`.` | Append: `Row 3's app-server and TUI paths are under its *Rules paths and launch flag (0.163.0, signed in)* subsection.` |
| L317 heading | already reads `rows 0, 1, 3: revisited 2026-10-22 on 0.163.0` | unchanged |
| L195 (*Execpolicy*) | `On 0.163.0 the \`codex exec\` refusal re-confirmed (3/3); the app-server and TUI paths were not re-probed.` | `On 0.163.0 all three re-confirmed by side effect (3/3 each); the TUI's status line also shows \`⚠ 1 warning · f2 to view\` before the prompt is sent, and the command still runs.` The sentence that follows, "Still treat a malformed \`.rules\` file as fail open.", stays |

**New subsection** (recommended shape, *Decision candidates* 1). It goes inside
`## Re-probe — codex-cli 0.163.0`, after the first table and before the trimmed *Not re-probed*
paragraph:

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

Probe 3b is in the method text, not in a row of its own (*Decision candidates* 3). The trust-write
side effect stays a clause of the control row (*Decision candidates* 4). Do not add frontmatter:
`intention-lint` skips the record because it has no `subjects:`.

**Not re-labelled**: the 0.162.1 TUI row (L586), the 0.162.1 launch-flag row (L576), the 0.162.1
section's closing paragraph (L598–601), and row 3's 0.162.1 evidence sentence ("fails open with
nothing on screen (3/3)"). Each one is that version's finding.

### Part 2 — `adapters/codex/README.md`

Commit: `docs(codex): re-pin the README rules split and launch flag to 0.163.0`.

**Context block**

- L200–201, inside the Guard section's `write_stdin` bullet: change only
  `(pinned on 0.162.1)` after the launch flag to `(pinned on 0.163.0)`. The rest of the bullet
  stays, including both sentences that satisfy the Guard predicates, and L207 "Only `codex exec`
  was probed", which probe 5 leaves true.
- L216–222, the malformed-rules bullet, becomes:

  ```markdown
  - A malformed `craft.rules` file **may fail open** at runtime, so treat it as fail open.
    On codex 0.162.1 and 0.163.0 the outcome depends on how codex is driven: `codex exec`, this
    binding's launch path, refuses to start, so the run stops loudly; the app-server
    thread/turn path logs a warning, skips the rules, and runs the command anyway. The
    interactive TUI runs its turns through an app-server daemon and fails open the same way.
    The daemon logs the warning to `$CODEX_HOME/app-server-daemon/daemon.stderr.log`. On
    0.163.0 the TUI status line also shows `⚠ 1 warning · f2 to view` before the first prompt,
    and the command still runs; on 0.162.1 nothing showed on screen.
  ```

  "(re-confirmed on 0.163.0)" after "stops loudly" goes: the leading "On codex 0.162.1 and
  0.163.0" now covers it. The literals `fail open` and `refuses to start` stay. The wording
  follows *Decision candidates* 2, option A, which the recommended option B also uses in the
  README.
- Hygiene: `native-surface.test.js` L278–305 runs the provenance loops over the README. Version
  strings pass `PROVENANCE_REF_RE`. Write no ADR, part or run-slug reference into the README.

### Part 3 — `BACKLOG.md` and `docs/contributing/specs/gate.md`

Commit: `docs(backlog): record the 0.163.0 rules-path and launch-flag re-probe`.

**Context block**

Apply the edits bottom-up:

1. **L230–231, malformed-rules entry body.** Delete the trailing sentence `On 0.163.0
   (2026-10-22) the \`codex exec\` refusal re-confirmed (3/3); the app-server and TUI paths were
   not re-probed (*Re-probe — codex-cli 0.163.0*).` The paragraph then ends at
   `*Re-probe — codex-cli 0.162.1*.` Append a new paragraph after it, in the house in-place form:

   ```markdown
   **Re-probe on 0.163.0 (2026-10-22): unchanged on every surface.** Same ground truth.
   `codex exec` refuses to start (3/3); the app-server thread/turn path emits the same
   `configWarning` and `git clean -f` deletes `VICTIM.txt` (3/3); the interactive TUI fails open
   through its daemon (3/3). Unlike the 0.162.1 observation, the TUI's status line shows
   `⚠ 1 warning · f2 to view` before the prompt is sent, and F2 opens the parse error; the
   command still runs. With the committed rules every path blocks. Treat a malformed rules file
   as fail open. Evidence: `docs/contributing/specs/codex-poc-record.md`,
   *Re-probe — codex-cli 0.163.0*.
   ```

2. **L207–208, entry heading.** `**Malformed \`.rules\` execpolicy — treat as fail open: on 0.162.1
   the app-server path fails open and \`codex exec\` refuses to start — recorded 2026-07-21,
   re-probed 2026-10-15**` → `… on 0.162.1 and 0.163.0 the app-server path fails open and \`codex
   exec\` refuses to start — recorded 2026-07-21, re-probed 2026-10-15 and 2026-10-22**`. The
   entry stays open, and `(harden-prove-codex-binding, B9)` on L209 stays.
3. **Group B lead paragraph** (*Decision candidates* 5). Add it after the `Closed 2026-10-22
   (codex-0163-reprobe)` paragraph (L202–205), before the entry heading:

   ```markdown
   Delivered 2026-10-22 (codex-0163-rules-reprobe): on codex 0.163.0 a malformed `craft.rules`
   still fails open on the app-server thread/turn path and in the interactive TUI (3/3 each,
   `VICTIM.txt` deleted), and `codex exec` still refuses to start. The TUI's status line
   shows `⚠ 1 warning · f2 to view` before the prompt is sent; the command still runs. The
   `-c features.unified_exec_tty=false` launch flag still closes `write_stdin`, over a config
   `unified_exec_tty = true` too (3/3). Record: `docs/contributing/specs/codex-poc-record.md`,
   *Re-probe — codex-cli 0.163.0*. The binding is unchanged: a malformed rules file is still
   treated as fail open.
   ```

4. **`docs/contributing/specs/gate.md` L278.** `(offline probe 2026-10-18, 0.162.1; the template
   key re-confirmed 2026-10-22 on 0.163.0)` → `(offline probe 2026-10-18, 0.162.1; the template key
   and the flag re-confirmed 2026-10-22 on 0.163.0)`. L281 ("Only `codex exec` was probed") stays
   true. `intention-lint` reads `gate.md` (it has `subjects:` frontmatter), and the frontmatter is
   not touched.

The delivered lead paragraphs L189–200, the closed paragraph L202–205 and the 0.162.1 paragraph
body (L220–229, "with nothing on screen (3/3, 2026-10-21)" included) stay verbatim.

## Decision candidates

None of these touches the posture. Each is a wording or placement choice that the ADRs above do
not settle.

| # | Choice | Options | Recommendation |
|---|---|---|---|
| 1 | Where the signed-in rows go in the record | **A.** A `### Rules paths and launch flag (0.163.0, signed in)` subsection inside `## Re-probe — codex-cli 0.163.0`, with its own method paragraph and table; the trimmed *Not re-probed* paragraph closes the section. **B.** Append the rows to the existing 0.163.0 table and add a second method paragraph above it. **C.** A new `##` section, e.g. `## Re-probe — codex-cli 0.163.0, signed in`. | **A.** The existing method paragraph says "no step needed auth", which is false for these rows, so B puts rows under a method they did not follow. C splits one version across two top-level sections, while every other doc cites the section by the name *Re-probe — codex-cli 0.163.0*. A keeps that name valid and gives the batch its own method |
| 2 | How the TUI's on-screen warning reads against the 0.162.1 "nothing on screen" pin | **A.** Side by side, each pinned to its version: "on 0.163.0 the status line shows `⚠ 1 warning …`; on 0.162.1 nothing showed on screen". **B.** A, plus a method caveat in the record row only: 0.162.1 was observed by an operator in a real terminal and 0.163.0 by a scripted pty, so whether 0.162.1 also showed the badge is not established. **C.** Drop the 0.162.1 "nothing on screen" wording from current-state lines (the README), keeping only the 0.163.0 fact. | **B.** The two observations used different drivers, so the record should not imply a codex change it did not isolate (ADR-678: nothing re-pinned on inference). The README keeps the short form A, because the caveat is evidence detail and belongs in the record. C drops a pinned observation, against ADR-320 |
| 3 | Whether the stub-git finding (`/bin/zsh -lc` + `path_helper` bypasses a `PATH` stub) goes into the record | **A.** Into the subsection's method paragraph, as the reason `VICTIM.txt` is the ground truth. **B.** A, plus a general sentence in the *Open rows* method note (L325–328) for every future stub-git probe. **C.** Design doc only. | **A.** It explains why the TUI rows read "runs 2 and 3 ran the real git", so it has to sit beside them. B states a rule for future probes from one environment's measurement (macOS, throwaway `HOME`). C leaves the record's TUI row looking inconsistent |
| 4 | Whether `thread/start` writing `trust_level = "trusted"` for its cwd is recorded | **A.** One clause in the app-server control row, with no README or BACKLOG claim. **B.** A, plus a README Guard bullet: an app-server client that starts a thread in a repo marks it trusted, so that repo's `.codex/config.toml` applies (and it can set `unified_exec_tty = true`). **C.** Omit it: it was a side note. | **A.** It was observed and has a plausible link to the project-config override, so the record should hold it. But no probe showed that a `thread/start`-trusted project's config then re-enables tty, so B would be an inference. C discards an observed fact |
| 5 | How group B records this run | **A.** A new `Delivered 2026-10-22 (codex-0163-rules-reprobe): …` lead paragraph; existing leads untouched. **B.** Append a dated clause to the `codex-tui-malformed-rules-probe` lead paragraph. **C.** No lead paragraph; only the entry's dated re-probe paragraph. | **A.** Group B's convention is one lead paragraph per finished run (L189–205), and B edits a delivered paragraph, which is history. C leaves no group-level trace of a run that delivered three re-probes |

## Test strategy

No behaviour changes, so there is no RED test to write. Every gate below must stay green. A pin
that turns red means an edit dropped a mandated disclosure.

- **`adapters/codex/test/native-surface.test.js`**, unchanged. It is the guard for Part 2:
  - README-wide `/fail open/i` (L369–373) and `/refuses?\s+to\s+start/i` (L375–379), which the new
    L216–222 text keeps
  - Guard-section sentence predicates (L557–581): `write_stdin` + `reopens`, and
    `.codex/config.toml` + `unified_exec_tty = true`, in sentences Part 2 does not edit
  - the Configure and Usage launch-flag pins (L544–548, L565–572), whose lines Part 2 does not
    touch
  - the provenance hygiene loops (L278–305)
- **Doc and ledger gates in `scripts/ci.sh`**:
  - `design-lint` (this file's six headings)
  - `backlog-lint` (no structural heading added or removed)
  - `intention-lint` (the record has no frontmatter and stays skipped; `gate.md` and BACKLOG are
    read)
  - `docs-structure-lint`
  - `readme-drift` (this design commit bumps design docs 93 → 94; Parts 1–3 add no doc)
- **No stale "not re-probed" claim left.** After Parts 1–3, `git grep -n 'not re-probed'` over the
  record, BACKLOG and both READMEs must not match the app-server path, the TUI path or the launch
  flag. The trimmed *Not re-probed* paragraph and unrelated rows may still match.
- **No unpinned "nothing on screen".** After Part 2, every living line that says nothing shows on
  screen carries a 0.162.1 pin (`git grep -n 'nothing sh\|nothing on screen'`, excluding design,
  plan and ADR history).
- **Path hygiene.** Before each commit, grep the changed files for `/Users/` and `/home/`.
- **No live re-run.** The matrix in *Context* is the evidence. No test spawns real `codex`.

## Out of scope

- **Changing the treat-as-fail-open posture.** The reserved decision point did not trigger, and
  ADR-574 stands.
- **Re-probing the rows still unprobed on 0.163.0**: hook timeouts, the project-config override,
  trust idempotence and ALLOW, the `execpolicy check` and `cmp` rows, the `unified_exec` and
  `shell_tool` switches, the tool shell, the heredoc idiom, and the tty paths of the TUI and the
  app-server.
- **Re-probing 0.162.1** to settle whether its TUI showed the badge.
- **Finding out why run 1 of the TUI probe resolved the stub, and why the operator-side
  `codex login` left no `auth.json`.** Neither changes a verdict, because each verdict rests on
  `VICTIM.txt`.
- **Probing whether a `thread/start`-trusted project's `.codex/config.toml` re-enables tty
  sessions.** It would be a new row, not a re-observation.
- **Making the binding read or surface the daemon warning.** The binding launches `codex exec`,
  which already refuses to start.
- **Editing history**: ADRs, designs, plans, BACKLOG delivered and closed lead paragraphs, and the
  0.162.1 rows and paragraphs of the record.
