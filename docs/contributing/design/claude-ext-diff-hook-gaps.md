# Design — claude-ext-diff-hook-gaps

> Brief: the Claude ext-diff hook (`hooks/git-no-ext-diff.sh`, a bash regex matcher) allows
> `(git diff)`, `FOO=1 git diff`, `env/command/!/time git diff`, `{ git diff; }`,
> `git --no-pager diff`, `git -p diff` and `git --git-dir .git diff`. Close them, either by
> patching the matcher in place or by delegating to the shared engine verdict, which changes the
> hook's crash contract (ADR-533…541) (BACKLOG "The Claude ext-diff hook shares the anchor and
> global-option gaps").
> Status: draft → self-reviewed ×3

## Context

### What the hook does today

`hooks/git-no-ext-diff.sh` (92 lines) is wired as the only PreToolUse(Bash) hook in
`hooks/hooks.json` (`"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh"`). Pipeline:

```
stdin ─cat─> IN ─jq .tool_input.command─> CMD
  CMD empty ................................. allow (exit 0, no stdout)
  CMD contains "--no-ext-diff" or "rtk proxy" (substring) ... allow
  grep -cE GIT_RE (L75) == 0 ................ allow
  sed rewrite (L89) ─> FIXED ─jq─> stdout {"hookSpecificOutput":{…"deny"…"Re-issue exactly: <FIXED>"}}
```

`GIT_RE` anchors on `(^|[;&|]\s*)git`, knows four globals (`-C <p>`, `-c <kv>`, `--git-dir=`,
`--work-tree=`) and ends on `(\s|$)`. The `sed` rewrite repeats the same grammar to insert
`--no-ext-diff` after the subcommand.

Crash contract (ADR-533…541, timeout text ADR-546/552): every failure bash can see ends in exit 2
with `craft git-no-ext-diff: failed (exit <n>), call denied` (or `no verdict reached`) on stderr,
because Claude Code runs the call on every other exit status. The contract has three pieces: an
inline EXIT trap (ADR-539), a TERM/HUP trap that exits through it (ADR-541), and a feed sentinel
that turns a command substitution that never started into a crash. Allow happens only on grep's
exit 1 with a printed zero count (ADR-542). Residual fail-open: `/bin/bash` missing, the hook file
missing or not executable, SIGKILL or any other untrapped signal, and the 600 s hook timeout
(SIGTERM to the whole tree). ADR-538 requires the contract to be written in three places: the hook
header (L1-22), `docs/contributing/specs/gate.md` "Claude binding" (L44-81), and the README
Quickstart requirement sentence (`README.md:99-101`: "`jq` on `PATH` (the Claude Code guard hook
denies every Bash call without it)"). `grep -rln git-no-ext-diff` finds no other living operator
doc (`docs/guides/` has no hit).

The shared engine (`engine/src/guards/`) already parses shell text:
`gitExtDiffPredicate(command)` (`git-ext-diff-predicate.js`) = `judgeInvocations(command,
extDiffVerdictFor)`. It runs the tokeniser and normaliser (`shell-git-invocations.js`,
`git-argv.js`), which handle wrappers, assignments, subshells, groups, reserved words, quote
removal, `sh -c`/`eval` re-parse, substitutions, and git globals. `plainGitCommandVerdict` in
`git-bash-verdict.js` adds the plain-command gate and destructive git; codex and copilot share it
(ADR-640). The engine is already a runtime dependency of the Claude plugin: skills call
`node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/*.js"` (`skills/init/SKILL.md:29`,
`skills/propose/SKILL.md:33`). `engine/package.json` sets `engines.node` to
`^22.18.0 || >=24.2.0`.

### Pinned H — hook vs engine predicate, verdict matrix

Probes ran on main `0d44e0e` (macOS, GNU bash 3.2.57, jq 1.8.2, git 2.56.0, node 22.22.3) with
throwaway scripts outside the repo. "Hook" means the real hook spawned as `/bin/bash
hooks/git-no-ext-diff.sh` with `{"tool_input":{"command":…}}` on stdin. Every hook row exited 0,
and DENY means a JSON deny on stdout. "Engine" means `gitExtDiffPredicate(cmd)` in-process. "Regex
(A)" is the option-(A) prototype below. The pinned and control rows were run 3× each with the same
verdict every time.

| Command | Class | Hook | Engine | Regex (A) |
|---|---|---|---|---|
| `git diff` | control | DENY | DENY | DENY |
| `(git diff)` · `{ git diff; }` · `true && (git diff)` | grouping (pinned) | allow | DENY | DENY |
| `FOO=1 git diff` · `env git diff` · `command git diff` · `! git diff` · `time git diff` | prefix/wrapper (pinned) | allow | DENY | DENY |
| `git --no-pager diff` · `git -p diff` · `git --git-dir .git diff` | global option (pinned) | allow | DENY | DENY |
| `git -c x=y --no-pager diff` · `git -C . -c a=b --no-pager --git-dir .git diff` | mixed globals | allow | DENY | DENY |
| `git diff\|cat` · `git diff;echo x` | operator right after the subcommand | allow | DENY | DENY |
| `if true; then git diff; fi` · `$(git diff)` | reserved word / substitution | allow | DENY | DENY |
| `"git" diff` · `git "diff"` | quote removal | allow | DENY | **allow** |
| `sh -c 'git diff'` · `eval git diff` | string run as a command | allow | DENY | **allow** |
| `/usr/bin/git diff` · `GIT diff` | path-qualified / case-folded head | allow | DENY | **allow** |
| `echo x \| xargs git diff` · `G=gi; ${G}t diff` | xargs / dynamic head | allow | DENY | **allow** |
| `git diff; echo --no-ext-diff` · `echo "rtk proxy"; git diff` | substring pre-allow bypass | allow | DENY | **allow** (same `case` as today) |
| `git diff --no-ext-diff --ext-diff` | later `--ext-diff` overrides the marker | allow | DENY | **allow** |
| `git -c alias.d=diff d` | inline alias | allow | DENY (alias reason) | allow |
| `GIT_CONFIG_COUNT=1 git status` | config channel | allow | DENY (config reason) | allow |
| `echo "a; git diff x"` · `git commit -m "wip; git diff fix"` · `git log --grep "x; git show y"` | text inside quotes | **DENY** | allow | **DENY** |
| `cat > notes.md <<'EOF'⏎run …; git show HEAD⏎EOF` | quoted heredoc body (data) | **DENY** | allow | **DENY** |
| `echo "$(` · `echo 'unterminated` | unparseable, no git | allow | DENY (parse reason) | allow |
| `git${IFS}diff` | word split inside the command word | allow | allow | allow |
| `git diff --no-ext-diff HEAD` · `rtk proxy git diff` · `git stash show` · `git show-ref` · `git difftool` · `git status` | must allow | allow | allow | allow |
| heredoc commit idiom (`git commit -m "$(cat <<'EOF'⏎…git diff…⏎EOF⏎)"`) · `gh pr create --body "$(cat <<'EOF'…)"` · `python3 - <<'PY'…['git','diff']…PY` · `find … -exec grep -l 'git diff' {} +` | everyday Claude commands | allow (commit idiom only run) | allow | — |
| `for f in *.js; do echo $f; done` · `awk '{print $1}' f` · `echo $((1+2))` · `[[ -f x ]] && echo y` · `case x in x) echo y;; esac` · `npm test 2>&1 \| tail -5` | everyday, no git | allow | allow | allow |

The hook's false denies come with a corrected command that rewrites the data:
`echo "a; git diff x"` → "Re-issue exactly: `echo "a; git diff --no-ext-diff x"`", and the heredoc
row inserts `--no-ext-diff` into the file body. This happened live twice while this design was
written: the hook denied two probe Bash calls whose quoted test data contained `"a; git diff x"`,
and its "Re-issue exactly" command would have corrupted that data.

### Option (A) — what a regex patch reaches

The prototype extends the anchor to `(^|[;&|(){!]|then|do|else|elif)` followed by any run of
`NAME=value`, `env`, `command`, `time`, `exec`, `nohup` or `!` words. It extends the globals with
`--git-dir`/`--work-tree`/`--namespace` taking `=` or a space, `--no-pager`, `-p`, `--paginate`,
`-P`, `--no-optional-locks`, `--bare`, `--literal-pathspecs` and `--no-replace-objects`, and the
terminator to `([[:space:];&|)]|$)`. It closes all 10 pinned forms and the operator-terminator
gap (column "Regex (A)"). It cannot reach parity. A regex tracks no quote state, so it can never
separate code from data: quote removal (`"git" diff`) stays open, and quoted text that looks like
code (`echo "a; git diff x"`) stays a false deny. Every new wrapper, global or reserved word is
one more hand-added alternative that has to be mirrored in the `sed` rewrite. Copilot's design
pinned the same growth for its old `GIT_DIFF_SHOW_RE` (`copilot-git-argv-normalising-guard.md`
§Pinned A), and that was the reason the engine parser exists.

### Option (B) — what delegation costs, measured

Latency, mean of 30 calls × 3 runs (stable to the ms across runs):

| Variant | allow | deny |
|---|---|---|
| bash hook today | 11 ms | 17 ms |
| node entrypoint calling `gitExtDiffPredicate` | 28 ms | 29 ms |
| bash crash shell + node verdict (prototype of B2) | 33 ms | — |
| `node -e ''` (start-up floor) | 23 ms | — |

So delegation adds about 22 ms to every Bash call, and node start-up is most of it.

Crash behaviour of a B2 prototype: the hook's EXIT/TERM/HUP traps, with node run in the
foreground. Each row ran 3×:

| Fault | rc | Result |
|---|---|---|
| deny payload (`git -p diff`) | 0 | JSON deny on stdout |
| `node` missing from PATH | 2 | `craft git-no-ext-diff: failed (exit 127), call denied` |
| `node` SIGKILLed | 2 | bash sees 137 → crash deny |
| stdin not JSON | 2 | node exits 1 (its SyntaxError on stderr) → crash deny |
| node exits 0 and prints nothing | **0** | **allow: fail-open** unless the hook requires an explicit verdict token (closed in Design) |

A node-only entrypoint, like the codex `adapters/codex/hooks/craft-guard.js`, would move the
crash net into node (`uncaughtException`/`unhandledRejection`/`beforeExit` handlers, no static
imports). It would also add residuals that bash denies today. With `node` missing from PATH, the
`hooks.json` command exits 127 and the call runs; today `jq` missing denies every call (ADR-535).
A signal that kills node would end the hook with no deny at all. And the `hooks.json` command
string would change.

## Requirements

- **R1.** The hook denies every form in Pinned H where the engine column is DENY. At minimum it
  denies the 10 pinned forms and `git -c x=y --no-pager diff`, each fed as
  `{"tool_input":{"command":…}}`, with exit 0 and a JSON `permissionDecision: "deny"` on stdout.
- **R2.** It allows every Pinned H row whose engine column is allow. That includes the three
  quoted-text rows and the heredoc-body row it falsely denies today, the must-allow row and the
  everyday rows.
- **R3.** The crash contract holds: every failure the hook can see ends in exit 2 with a
  `craft git-no-ext-diff:` reason on stderr and nothing on stdout. That covers a missing or
  too-old node, a node that crashes, is signalled, or exits 0 with no verdict, stdin that is not
  JSON, a feed that cannot start, a syntax error below the trap, and TERM/HUP. The residual
  fail-open list is unchanged: `/bin/bash` missing, the hook file missing or not executable,
  SIGKILL of the hook's own bash or any other untrapped signal, and the 600 s timeout.
- **R4.** `hooks/hooks.json` stays byte-identical.
- **R5.** The verdict is computed by the engine's ext-diff rule, the same module codex's and
  copilot's Bash paths use for that rule. There is no second matcher in bash.
- **R6.** The living docs tell the truth after the change: the hook header, `gate.md` "Claude
  binding", and the README requirement sentence (ADR-538's three places). A new ADR records the
  contract change and supersedes ADR-542. The BACKLOG entry leaves the Open list.
- **R7.** `bash scripts/ci.sh` is green, and the new engine module meets the repo's mutation bar.

## Design

Recommended shape: **B2**. The bash hook keeps its crash contract and gives the verdict to a node
CLI, which judges with `gitExtDiffPredicate` (DC-1 b2, DC-2 a, DC-3 a).

```
Claude Code ─stdin payload─> hooks/git-no-ext-diff.sh  (bash: EXIT/TERM/HUP traps, feed sentinel)
                               └─ node engine/bin/claude-ext-diff-verdict.js   (inherits stdin)
                                    └─ engine/src/claude-ext-diff-hook-main.js  main(argv, io)
                                         └─ gitExtDiffPredicate(command)
                               stdout token:  "allow"  |  {"hookSpecificOutput":…deny…}
                               anything else / non-zero exit  ─> crash deny (exit 2)
```

### Part 1 — `engine/src/claude-ext-diff-hook-main.js` + `engine/bin/claude-ext-diff-verdict.js`

This follows the `*-main.js` + thin bin pattern (`engine/bin/filter-findings.js` →
`engine/src/filter-findings-main.js`). The bin file is `isEntryPoint(import.meta)` → `process.exit(main(argv,
{ stdout, stderr, readStdin: () => readFileSync(0, 'utf8') }))`.

```js
export const ALLOW_VERDICT = 'allow';
const NOT_A_COMMAND_EXIT = 1;

/** @returns {number} exit code; writes exactly one verdict token on stdout, no trailing newline */
export function main(argv, io) {
  const command = commandOf(JSON.parse(io.readStdin()));   // throws → node exits 1 → bash denies
  if (command === null) { /* non-string command */ io.stderr.write(…); return NOT_A_COMMAND_EXIT; }
  const verdict = command === '' ? { block: false } : gitExtDiffPredicate(command);
  io.stdout.write(verdict.block ? denyJson(verdict.reason) : ALLOW_VERDICT);
  return 0;
}
```

- `commandOf(payload)` reads `payload.tool_input.command`. An absent, `null` or `''` command
  becomes `''` (allow, as `// empty` does today). A non-string command returns `null` (exit 1 →
  crash deny). Today `jq -r` prints a number as text and allows it, so this is a tightening, and
  nobody depends on it. A payload that is not an object, or has no `tool_input`, gives `''`, to
  match today's `// empty`.
- `denyJson(reason)` → `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"craft: <reason>"}}`
  (DC-3 a). It skips the `craft: ` prefix when the reason already starts with it (the engine's
  config-channel, alias and parse-failure reasons do).
- No crash handlers in node: bash catches every non-zero status, and the verdict-token check
  catches a clean exit with no token. A throwing `NODE_OPTIONS` preload and a too-old node (the
  `isEntryPoint` throw: "craft needs Node …") both exit non-zero, so both are denied.
- Only `JSON.parse` sees the payload, and JSON allows only one top-level document. Two JSON
  documents on stdin therefore become a parse error → crash deny. Today jq judges the first one
  and denies with a corrected command. It is still a deny, only through the crash path.

### Part 2 — `hooks/git-no-ext-diff.sh` becomes the crash shell

The traps, `allow`, `deny_on_crash`, `verdict_reached` and the named exit constants stay
verbatim. These are removed: `cat` and the `IN` feed (node reads the inherited stdin), the `jq`
extraction, the substring `case` (it is a proven bypass; the engine judges the marker per
invocation), `GIT_RE`/grep/`GREP_NO_MATCH`/`NO_MATCHING_LINES`, and the `sed` rewrite with its
final `jq -cn`. Added:

```bash
readonly NO_VERDICT_STATUS=0          # reported by deny_on_crash as "no verdict reached"
readonly ALLOW_VERDICT='allow'
readonly DENY_VERDICT_PREFIX='{"hookSpecificOutput":'
hook_dir=${BASH_SOURCE[0]%/*}
[ "$hook_dir" = "${BASH_SOURCE[0]}" ] && hook_dir=.
readonly VERDICT_BIN="$hook_dir/../engine/bin/claude-ext-diff-verdict.js"

VERDICT=$(node "$VERDICT_BIN" && printf '%s' "$FEED_SENTINEL")
[ "${VERDICT%"$FEED_SENTINEL"}" != "$VERDICT" ] || exit "$FEED_NEVER_RAN_STATUS"
VERDICT=${VERDICT%"$FEED_SENTINEL"}
case "$VERDICT" in
  "$ALLOW_VERDICT")         allow ;;
  "$DENY_VERDICT_PREFIX"*)  printf '%s\n' "$VERDICT" ;;
  *)                        exit "$NO_VERDICT_STATUS" ;;
esac
verdict_reached=1
```

- A node failure ends the hook through `set -e`: under `VAR=$(cmd && …)` the assignment takes
  the substitution's status, so the hook exits with node's status and the EXIT trap denies with
  `failed (exit <n>)`. Node's own stderr (missing module, SyntaxError, the node-version message)
  passes through ahead of the craft line, so the cause is readable.
- A substitution that cannot start (no fds or no fork) expands to empty with status 0. The
  missing sentinel catches it, as today.
- Node exits 0 with no token, or with an unknown token: `exit 0` while `verdict_reached=0` →
  `no verdict reached, call denied` (ADR-540 path).
- TERM and HUP from another sender: bash defers the trap until the foreground node returns, then
  exits 143 or 129 through the EXIT trap. That is today's behaviour with a foreground `jq`. On
  Claude Code's timeout, the tree-wide SIGTERM kills node too, and the call runs whatever the
  hook does (fail-open, ADR-546/552, unchanged).
- Tools the hook needs: `node` and bash built-ins. `cat`, `jq`, `grep` and `sed` are no longer
  used, so the "PATH without cat/jq/grep/sed" crash classes disappear and "PATH without node"
  replaces them.
- No `git` substring pre-filter to skip node. Commands without the literal text `git` can still
  run git diff (`G=gi; ${G}t diff`, denied by the engine in Pinned H), so a pre-filter would put a
  gap back to save about 22 ms.
- The header (L1-22) is rewritten to: the strategy paragraph (unchanged), "the verdict is the
  engine's ext-diff rule, computed by node", the crash paragraph naming node (missing, too old,
  crashed, signalled, silent) as crash-denied, and the residual and timeout paragraphs unchanged.

### Part 3 — ADR and living docs

- **New ADR** (ADR-646): "The Claude ext-diff hook delegates its verdict to the
  engine". Subjects: `hooks/git-no-ext-diff.sh`, `docs/contributing/specs/gate.md`, `README.md`,
  `engine/src/claude-ext-diff-hook-main.js`. Options are DC-1's three. **Supersedes ADR-542**:
  the allow condition becomes "node printed the allow token", and grep is gone. ADR-533/534/535
  (the trap, exit 2, deny-all on crash), ADR-539 (inline trap), ADR-540 (no verdict denies) and
  ADR-541 (TERM/HUP) stay in force unchanged. ADR-535's realistic trigger moves from `jq` to
  `node`. ADR-538's three places are all edited.
- `gate.md` "Claude binding" (L47-81): replace the regex description (the four globals, the
  substring pass-through, "Re-issue exactly: <fixed-command>") with the engine delegation and the
  engine reason. In the crash paragraph, "With `jq` missing from `PATH`" becomes "With `node`
  missing from `PATH`, or older than the engine's supported range". Residual and timeout text
  stay as they are.
- `README.md:99-101`: "`jq` on `PATH`" becomes "`node` (^22.18 or ≥24.2) on `PATH`". `jq` stays
  optional: `hooks/bound-run.sh` degrades without it. The README drift tests run.
- The `BACKLOG.md:310` entry leaves the Open list.
- `engine/src/guards/tool-call-guard.js:13` ("Mirrors hooks/git-no-ext-diff.sh") stays true. Not
  touched.

### Edge behaviour (deliberate changes, all from Pinned H)

| Input | Today | After |
|---|---|---|
| quoted text or heredoc body holding `; git diff x` | false deny + corrupting fix | allow |
| unparseable command with no git (`echo "$(`) | allow (bash then fails on the syntax) | deny, parse reason |
| `GIT_CONFIG_COUNT=1 git status`, `git -c alias.d=diff d` | allow | deny, config/alias reason (part of `extDiffVerdictFor`) |
| command over 131 072 chars (tokeniser cap) | judged by regex | deny, length reason |
| two JSON documents on stdin | JSON deny | crash deny (exit 2) |
| non-string `tool_input.command` | allow | crash deny (exit 2) |
| `git${IFS}diff` | allow | allow (engine residual, as on codex/copilot) |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 **(user's escalation)** | How the hook closes the gaps | (a) **Patch the bash matcher**: extend `GIT_RE` anchors, wrappers, globals and terminator plus the `sed` mirror; crash contract untouched. (b1) **Node entrypoint** replaces the bash hook (codex-style handlers); `hooks.json` command changes. (b2) **Bash crash shell + node verdict** (Design): traps and sentinel stay, verdict from `gitExtDiffPredicate` | (b2) | (a) closes the 10 pinned forms (prototype, Pinned H), but a regex has no quote state. It keeps 6 measured ext-diff bypass rows open (quote removal, `sh -c`/`eval`, `/usr/bin/git`/`GIT`, `xargs`/dynamic head, the substring bypasses, `--no-ext-diff --ext-diff`) and keeps the false denies, whose corrected command corrupts data (seen live twice while writing this design). Each future form needs a hand edit in two regexes. (b1) adds fail-open residuals bash denies today (`node` missing → 127 → call runs; node killed → no deny) and changes `hooks.json`. (b2) keeps every residual as it is (node missing, SIGKILLed, non-JSON stdin: all exit 2, 3/3), and an explicit verdict token closes the one new hole it has, node exiting 0 with no verdict. Cost: about 22 ms per Bash call (11 → 33 ms), node replaces jq as the hard prerequisite, and one ADR supersedes ADR-542 |
| DC-2 | Verdict scope under (b) | (a) **Ext-diff only**: `gitExtDiffPredicate`, today's scope. (b) **Full `plainGitCommandVerdict`**: adds destructive git and the plain-command gate to Claude | (a) | (b) is a scope change the backlog entry does not ask for. The gate denies any git-mentioning command that holds `$`, `\"` or a wrapper (codex design pins `echo $HOME; git status` and `git commit -m "fix: \"q\""` as false blocks), and ADR-606 records that it also denies the heredoc commit idiom (`git commit -m "$(cat <<'EOF' …)"`), which Claude agents use all the time. Claude's destructive-git posture is set by its permission system, not this hook. (a) already brings two small extra deny classes (config channel, inline alias; Pinned H). Revisit (b) only with a measured Claude destructive-git gap |
| DC-3 | Deny reason under (b) | (a) **Engine reason**, `craft: `-prefixed; drop "Re-issue exactly". (b) Engine verdict + `sed`-derived corrected command when the old regex finds a site. (c) Add source offsets to the tokeniser so the verdict can return a parse-derived rewrite | (a) | The parse carries no source positions (`gitInvocations` returns normalised words only), so (c) is a tokeniser change across every binding for a hint. (b) puts the regex back, and its "exactly" claim is wrong on the forms the regex misreads (the data rows rewrite quoted text) and missing on the forms it cannot see (`sh -c`). Config, alias and parse-failure denies have no insertion fix anyway. The engine reason says what to add (`git diff/show must carry --no-ext-diff`), and that is the reason codex and copilot agents already act on. Cost: three reason assertions and three crash-path assertions in `test/hooks.test.js` change from the corrected command to the engine reason |

Adopted as recommended, without a user decision: node reads the payload itself, so `jq` and
`cat` leave the hook. No `git` pre-filter. A non-string command is a crash deny. Engine module
placement follows the `*-main.js` pattern. `hooks.json` is untouched.

## Test strategy

TDD, London School. Red → Green → Refactor per part. Titles are Given/When/Then; bodies are AAA
with a `sut` variable. Titles stay printable ASCII (no `⏎`, NEL, U+2028 or invisible characters;
Stryker's tap dry run rejects them). Multi-line commands are built with `\n` in the body and named
by shape in the title. No provenance references (phase, ADR or backlog numbers) in source or test
code.

### Part 1 — `engine/test/claude-ext-diff-hook-main.test.js` (in-process, Stryker-visible)

Matched by `engine/test/**/!(*.differential).test.js`. It uses `makeCaptureIo()`
(`engine/test-helpers/capture-io.js`) plus a `readStdin` stub returning a built payload.
Collaborator: `gitExtDiffPredicate` is used for real (pure). The London-school seam is
`io`.

- Red first, one test per pinned form: the 10 Pinned H forms and `git -c x=y --no-pager diff`.
  Each one: Given the payload, when `sut = main([], io)`, then exit 0, stdout parses to
  `permissionDecision: "deny"`, and the reason is `craft: git diff/show must carry --no-ext-diff
  (external diff mangles parsed output)`.
- Allow rows: Pinned H's must-allow, quoted-text, heredoc-body and everyday rows → stdout is
  exactly `allow`, with no newline.
- Reason prefix: config-channel and parse-failure reasons are not double-prefixed.
- Payload shapes: absent `tool_input`, absent or `null` or `''` command → `allow`. Numeric command
  → exit 1, stderr names the shape, stdout empty. Non-JSON → throws, which the bin turns into a
  non-zero exit.

### Part 2 — `test/hooks.test.js` (real hook process, `/bin/bash hooks/git-no-ext-diff.sh`)

- Deny matrix (L53-110): keep the five existing fixtures. Swap the four "reason contains corrected
  command" assertions for the engine reason (DC-3 a), Red first. Add one fixture per pinned form
  under `test/fixtures/hooks/no-ext-diff-deny-*.json` (or build payloads inline with
  `JSON.stringify`, like `runHookWithPayload`), each asserting `decision(...) === 'deny'`.
- Allow matrix (L114-151): keep the five. Add the quoted-text row (`git commit -m "wip; git diff
  fix"`) and the heredoc-body row → empty stdout. These are Red today.
- Crash contract (L268-415). Remove the cat/jq/sed/grep-only tests (those tools are gone), and
  the "grep exits 1 without a count" test (ADR-542 superseded). Add:
  - Given PATH without node → exit 2, `crashReason(127)`, stdout empty (`withToolsOnly([])`).
  - Given a stub `node` that exits 0 silently (a PATH-first stub dir) → exit 2,
    `no verdict reached, call denied`.
  - Given a stub `node` that prints an unknown token → exit 2, no verdict reached.
  - Given a stub `node` that SIGKILLs itself → exit 2, `crashReason(137)`.
  - Given stdin that is not JSON → exit 2 (kept, status now node's 1).
  - Given two JSON documents → exit 2 crash deny (replaces today's JSON-deny assertion).
  - Kept as they are: syntax error below the trap, too few fds for a substitution, feed that
    cannot start (anchor moves to the `VERDICT=` line), TERM/HUP while reading (the first child
    is now the substitution running node), the pipe-buffer-overflow payload (now asserts the
    engine reason), no writable temp dir (asserts the engine reason).
- `hooks.json` registration test (L546): unchanged, and green (R4).

### Differential arm (review cycle 1)

`test/git-no-ext-diff.differential.test.js`, not in Stryker (the root `test/` is not in
`tap.testFiles`). It reuses `engine/test-helpers/git-differential-harness.js` (`generateCommands`,
`mapPool`, the seed/cap env `GUARD_FUZZ_SEEDS`/`GUARD_FUZZ_COUNT`) and checks one oracle: for every
generated command, the real hook's verdict (stdout deny ⇔ exit 0 with JSON) equals in-process
`gitExtDiffPredicate(command).block`, and no generated command ever exits with a status other
than 0 or 2. That catches payload decode divergence between `JSON.stringify` → node `JSON.parse`
and the in-process string (U+2028, NUL, lone surrogates, long payloads). The engine's own
shell-oracle fuzz already covers the predicate against real bash. Cost ≈ 400 × 33 ms / 8 ≈ 2 s.
Generated commands never appear in titles.

### Mutation

Stryker over `engine/src/claude-ext-diff-hook-main.js`, with one comma-separated `--mutate` per
run (repeated `--mutate` flags keep only the last). If the dry run dies with a worker exit, narrow
`tap.testFiles` to the module's own suite through an override config. Survivors are hand-checked
against the full covering set before writing a test. The bash hook is outside Stryker's reach;
`test/hooks.test.js` covers it.

### Gate

`bash scripts/ci.sh` green per part, `bash scripts/design-lint.sh` on this doc.

## Out of scope

- Destructive git or the plain-command gate on Claude (DC-2 b): a scope change, with no measured
  Claude gap.
- `git${IFS}diff` and other engine residuals: shared with codex and copilot, and owned by the
  engine.
- A parse-derived corrected command (DC-3 c): would need source offsets in the tokeniser for all
  bindings.
- The Claude hook timeout fail-open (ADR-546): unchanged, still documented, not fixed.
- Rewording the dated "Changing it is out of scope" note in
  `copilot-git-argv-normalising-guard.md` §Pinned A: dated design docs stay as written.
