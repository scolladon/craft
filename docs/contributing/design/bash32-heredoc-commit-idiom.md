# Design — bash32-heredoc-commit-idiom

> Brief: `git commit -m "$(cat <<'EOF' … EOF)"` breaks under macOS `/bin/bash` 3.2 when the
> message body holds certain characters (an apostrophe is the reported one). Copilot runs
> `/bin/bash`, and its guard allows the idiom. Either document the workaround for bash-3.2
> bindings, or teach a commit form that both shells parse (BACKLOG "Craft's heredoc commit idiom
> fails under macOS `/bin/bash` 3.2 when the message holds an apostrophe").
> Status: draft → self-reviewed ×3

## Context

### Where the idiom comes from

Craft does not teach the idiom. No skill, agent, contract or script tells anyone to commit with
`$(cat <<'EOF' …)`. The harness defaults produce it: Claude Code's system prompt teaches it, and
copilot's model writes it too. The only commit instructions craft gives are these:

| Surface | file:line | Text |
|---|---|---|
| core (every phase) | `contracts/core.md:1` | "Never commit on a red gate." |
| core | `contracts/core.md:9` | "Never change repo-wide git state … Commit your own files and nothing else." |
| construction | `contracts/construction.md:3` | "Gate before commit; one atomic commit with the exact message provided." |
| refinement | `contracts/refinement.md:2` | "One atomic refactor(<scope>): commit per spec; gate-green before each commit." |
| harness-exec | `contracts/harness-exec.md:3` | "Gate-green before commit." |
| agent defs | `agents/designer.md:20`, `agents/planner.md:42`, `agents/docs-writer.md:17`, `agents/harness-triager.md:27`, `agents/requirements-writer.md:19` | "Commit … with the (conventional-commit) message your invocation names." |

Bundles per phase (`pipeline/default.yml`): requirements/design/planning → `producer`;
implementation → `construction`; review → `harness-read`; refactoring → `refinement`;
validation/architecture → `harness-exec`; documentation/propose/integrate → `delivery`;
workspace/decisions → none. `engine/src/contract.js:216` `assembleContract` always pushes the
core first (`sections.push(expandCore(fragments.core, variants))`), in agent and inline mode. So
`contracts/core.md` is the only fragment that reaches every committing phase. Orchestrator
writes made outside a phase get no contract block (ADR-468, Consequences).

`contracts/` is not mirrored into adapters: `scripts/sync-adapter-agents.sh` copies agent defs
only, and no adapter file references `contracts/`. The core is pinned by marker:
`engine/test-helpers/contract-markers.js` `CORE_MARKERS` (12 case-insensitive substrings). It is
asserted on every assembled block by `engine/test/scenarios.test.js:320-333` and
`engine/test/contract-equivalence.test.js:78` (agent mode), plus the inline pin at
`contract-equivalence.test.js:269`. No test pins the core's size or byte content.
`engine/test/fixtures/contracts/core.md` is a deliberately minimal subset and is not touched.
The precedent for adding a core line is ADR-468: one `core.md` line plus one `CORE_MARKERS` entry.

### Surfaces that make the claim

| Surface | file:line | Claim |
|---|---|---|
| copilot README | `adapters/copilot/README.md:71-75` | "craft's `"$(cat <<'EOF' … EOF)"` commit idiom is accepted … On macOS `/bin/bash` 3.2, an apostrophe inside the commit-idiom body fails bash's own parse … a bash limitation, not the guard." |
| copilot README | `adapters/copilot/README.md:96` | 1.0.98 re-probe: "the commit idiom executed" |
| gate spec | `docs/contributing/specs/gate.md:171-174` | Same claim as the README, word for word. |
| gate spec | `docs/contributing/specs/gate.md:198` | Same re-probe line. |
| ADR-595 | `docs/contributing/adr/595-…-deadline.md:45-46, 56` | "Craft's commit idiom `"$(cat <<'DELIM' … DELIM)"` is recognised exactly and its body treated as data"; "craft's routine git and commit idiom stay plain". |
| BACKLOG | `BACKLOG.md:215-219` | The open entry for this change. |

Both living docs say "craft's" idiom, which is wrong (see above). Both also say only an
apostrophe breaks it, and that the guard plays no part. The matrix below disproves both.

### The copilot gate and the idiom

`engine/src/guards/git-plain-command-gate.js`: `IDIOM_HEADER_SOURCE`/`IDIOM_OPEN`/`IDIOM_CLOSE`
(:32-35), `closingEnd` (:38-49), `idiomEndAt` (:52-59), and the idiom branch of `quoteChunk`
(:85-86) recognise the idiom and turn it into one opaque word part (`OPAQUE_WORD_PART`, :22).
`holdsOpaquePart` (:111) then refuses that word in command position. Inside quotes the gate
denies `$` and backtick in single quotes (`SINGLE_QUOTE_FORBIDDEN`, :17), and `$`, backtick,
`\` and `!` in double quotes (`DOUBLE_QUOTE_FORBIDDEN`, :16). `<` is never plain (:14), so a
heredoc or input redirect in a command that mentions git is denied. Tests:
`engine/test/guards/git-plain-command-gate.test.js` has `COMPLEX_COMMANDS` (denied) and
`PLAIN_COMMANDS` (allowed). `PLAIN_COMMANDS` pins four idiom rows as allowed: :152 (body
`feat(x): don't break (really)` + `` `ticks` ``, which bash 3.2 cannot run, see below), :176,
:177 and :187.

### Which bindings run bash 3.2

| Binding | Shell for the model's commands | Evidence |
|---|---|---|
| copilot | `/bin/bash` (3.2 on macOS) | live reproduction recorded in the BACKLOG entry |
| claude (this harness, this box) | `/bin/zsh` 5.9 | pinned here: the Bash tool reports `ZSH_VERSION=5.9`, `ps -p $$` → `/bin/zsh` |
| codex | unpinned | `docs/contributing/specs/codex-poc-record.md:533` pins the **hook** shell (login shell from the user database, `$SHELL` ignored), not the shell of the model's `exec_command` |
| cursor, opencode, aider, antigravity, pi | unproven | none |

### Pinned matrix

Box: macOS, `GNU bash, version 3.2.57(1)-release (arm64-apple-darwin)`, zsh 5.9, git 2.54; no
bash 5 installed. Each form ran as a script file (`<shell> s.sh`) in a fresh `mktemp` repo with
`GIT_CONFIG_GLOBAL=/dev/null`. "Gate" is `copilotGuard({ tool: 'Bash', tool_input: { command } })`
from `adapters/copilot/src/git-guard-adapter.js` on this branch. `/bin/sh` gave the same result
as `/bin/bash` on every row.

The idiom, `git commit -m "$(cat <<'EOF'⏎<body>⏎EOF⏎)"`:

| Body | Gate | `/bin/bash` 3.2 | `/bin/zsh` |
|---|---|---|---|
| `fix: do not stop` | allow | exit 0, message correct | exit 0, correct |
| `fix: don't stop` (odd `'`) | allow | exit 2, ``unexpected EOF while looking for matching `''``, no commit | exit 0, correct |
| `fix: stop⏎⏎it's fine` (odd `'` in a body line) | allow | exit 2, no commit | exit 0, correct |
| `fix: don't won't` (even `'`) | allow | exit 0, correct | exit 0, correct |
| `fix: 6" ruler` (odd `"`) | allow | exit 2, ``matching `)'``, no commit | exit 0, correct |
| ``fix: run `x`` (odd backtick) | allow | exit 2, no commit | exit 0, correct |
| `fix: case (a only` (unbalanced `(`) | allow | exit 2, no commit | exit 0, correct |
| `fix: case a) only` (unbalanced `)`) | allow | **exit 0, message `fix: case a only⏎EOF⏎)`**: a silently wrong commit | exit 0, correct |
| `fix: close #12` | allow | exit 0, correct | exit 0, correct |
| `fix: costs $5` | allow | exit 0, correct | exit 0, correct |

Root cause: bash 3.2 finds the end of `$(…)` with a scanner that tracks quotes and parens but
does not know about heredoc bodies. An odd quote, an odd backtick or an extra `(` in the body
leaves the scanner unbalanced, which is a syntax error. An extra `)` closes the substitution
early: the rest of the body becomes shell text. The odd-quote case is the one
`engine/test/guards/shell-git-invocations.differential.test.js:38` already notes. The early
close is not covered there.

The early close also runs code. Benign-marker probe in a throwaway repo holding branch `victim`:

| Command | Gate | `/bin/bash` 3.2 | `/bin/zsh` |
|---|---|---|---|
| `git branch -D victim` | **DENY** "destructive git (forced branch delete) is denied in this binding" | — | — |
| `git commit -q --allow-empty -m "$(cat <<'EOF'⏎x)"; git branch -D victim; echo "⏎EOF⏎)"` | **allow** | exit 0, **`victim` deleted**, HEAD message `x` | exit 0, `victim` kept, the body committed as data |

On a bash-3.2 host, the gate's rule that the idiom body is data (ADR-595) is false. A body
that holds `)"` gets past the destructive predicate. The guard function and the shell were
both pinned; a live copilot session was not run. Live proof: send the same command through
`copilot -p` in a throwaway repo and check that `victim` is gone.

Other commit forms:

| Form | Gate | `/bin/bash` 3.2 | `/bin/zsh` |
|---|---|---|---|
| `git commit -m "fix: don't stop"` | allow | exit 0, correct | exit 0, correct |
| `git commit -m "fix: don't stop" -m "body: it's fine"` | allow | exit 0, two paragraphs | same |
| `git commit -m 'fix: do not stop'` | allow | exit 0, correct | same |
| `git commit -m "fix: case a) close #12"` | allow | exit 0, correct | same |
| `git commit -m 'fix: stop!'` | allow | exit 0, correct | same |
| `git commit -m "fix: stop!"` | **DENY** (`!` in `"…"`) | exit 0, correct | same |
| `git commit -m 'fix: costs $5'` | **DENY** (`$` in `'…'`) | exit 0, correct | same |
| `git commit -m "fix: costs $5"` | **DENY** | exit 0, **message `fix: costs`** (`$5` expanded) | same |
| `git commit -m "fix: it's $HOME"` | **DENY** | exit 0, `$HOME` expanded | same |
| ``git commit -m "fix: run `x`"`` | **DENY** | exit 0, `x` executed, message `fix: run` | same |
| `git commit -F msg.txt` (file already written) | allow | exit 0, correct | same |
| `cat > msg2.txt <<'EOF'⏎fix: don't stop⏎EOF⏎git commit -F msg2.txt` (one command) | **DENY** (`<`) | exit 0, correct | same |
| `git commit -F - <<'EOF'⏎fix: don't stop⏎EOF` | **DENY** (`<`) | exit 0, correct | same |

What this pins:

- Double-quoted `-m "…"`, one per paragraph, parses the same under bash 3.2, `sh` and zsh, and
  the gate allows it, as long as the message holds none of `` " $ ` \ ! ``. These characters
  either expand in every shell (`$`, backtick), need a `\` escape (`"`), or are denied by the
  gate (`\`, `!`).
- A message that holds any of those characters works through `-F <file>`, provided the file is
  written by a command that does not mention git (a separate call, or the Write tool). Writing
  it and committing in one command is denied on copilot.
- Craft's own messages are one-line Conventional Commits handed to each role verbatim, so a
  single `-m "<type>(<scope>): <subject>"` covers nearly all of them.

## Requirements

Written for the recommended options (DC-1 (b), DC-2 (b), DC-3 (a)). Each requirement names the
DC option that brings it in.

| # | Requirement | Proof |
|---|---|---|
| R1 (DC-1 b) | `contracts/core.md` holds exactly one new line, inserted after the "Never change repo-wide git state" line (`:9`): ``Commit form: git commit -m "<message>", one double-quoted -m per paragraph; a message holding " $ ` \ or ! goes in a file outside the working tree, committed with git commit -F <file>. Never -m "$(cat <<'EOF' … EOF)": /bin/bash 3.2 misparses it.`` | `git diff --no-ext-diff -U0 -- contracts/core.md` shows one `+` line and no `-` line |
| R2 (DC-1 b) | `CORE_MARKERS` gains `'Commit form'`; every assembled block, in agent and inline mode, contains it | `scenarios.test.js` S2 loop, the `contract-equivalence.test.js:78` loop and the new inline-mode pin are green |
| R3 (DC-1 b) | The core line does not contain "retrieval" | `contracts-lint` green |
| R4 (DC-2 b) | `gitPlainCommandGate` denies every command that holds `"$(cat <<'…'`, including the four former `PLAIN_COMMANDS` idiom rows and the `)"` smuggling row from the matrix | new and moved `COMPLEX_COMMANDS` rows green |
| R5 (DC-2 b) | No idiom-recognition code is left in `git-plain-command-gate.js` (`IDIOM_*`, `closingEnd`, `idiomEndAt`, the idiom branch of `quoteChunk`); `OPAQUE_WORD_PART`/`holdsOpaquePart` stay, because they are still reachable (see Part 2) | `grep -n -i "idiom" engine/src/guards/git-plain-command-gate.js` returns nothing; every remaining `PLAIN_COMMANDS` row still passes |
| R6 | `adapters/copilot/README.md:71-75` and `docs/contributing/specs/gate.md:171-174` no longer say "craft's" idiom. They name the taught form (double-quoted `-m`, `-F <file>` for `` " $ ` \ ! ``), and state the bash-3.2 failure modes from the matrix (syntax error on an odd quote, backtick or `(`; early close on `)`). Under DC-2 (b) they say the gate denies the idiom; under DC-2 (a) they list the early-close smuggle as a residual | `grep -n "a bash limitation, not the guard" adapters/copilot/README.md docs/contributing/specs/gate.md` returns nothing |
| R7 | The dated re-probe lines (`adapters/copilot/README.md:96`, `gate.md:198`) stay as recorded and gain "(denied since this change)" after "the commit idiom executed" under DC-2 (b) | diff review |
| R8 | The BACKLOG entry at `BACKLOG.md:215-219` and its trailing blank line are removed; no other entry changes | `git diff --no-ext-diff --numstat -- BACKLOG.md` shows deletions only |
| R9 | `bash scripts/ci.sh` is green after every part | ci log |

## Design

Three parts, one per seam. Under DC-1 (a), only Part 3 ships, minus its DC-1 (b) wording.
Under DC-2 (a), Part 2 is dropped and Part 3 lists the smuggle as a residual.

### Part 1 — the core teaches a commit form both shells parse (DC-1 b)

The new line (R1) goes right after the git-state line, so the rules about how to commit sit
together. It names the form, the fallback and the reason, and nothing else. It does not mention
copilot, because the core is the same for every binding. The fallback character set is the
union of the characters that expand in any shell and the characters copilot's gate denies, so
the one rule is safe everywhere. "Outside the working tree" keeps the message file out of
`git add -A` and matches the core's "never change the working tree" rule.

Context block:

- `contracts/core.md` — 12 lines, 1164 bytes; insert after line 9.
- `engine/test-helpers/contract-markers.js` `CORE_MARKERS` — append `'Commit form'`.
- Consumers that turn RED when only the marker is added: `engine/test/scenarios.test.js:320`
  (`S2 … EVERY core marker`) and the `engine/test/contract-equivalence.test.js:78` loop. Both
  assemble in agent mode only. For inline mode, add a sibling of the git-state pin at
  `contract-equivalence.test.js:269-287` (same shape, marker `commit form`); that pin is how the
  git-state line got its inline coverage. All three go GREEN once the line lands.
- `engine/src/contracts-lint-main.js:38` refuses "retrieval" in any bundle; the line avoids it.
- Not touched: `engine/test/fixtures/contracts/core.md` (minimal-subset fixture),
  `docs/guides/customizing.md:97-118` (a partial list of non-injectable invariants that never
  listed every core line).
- Commit: `feat(contracts): teach a commit form that bash 3.2 and zsh both parse`.

### Part 2 — the copilot gate stops recognising the idiom (DC-2 b)

Delete the idiom special case. With it gone, `"$(cat <<'EOF' …` is ordinary double-quoted text
holding `$`, so `DOUBLE_QUOTE_FORBIDDEN` denies it with the existing fixed reason, and the
remedy ("spell it plainly") points to the form Part 1 teaches. This keeps ADR-594's posture:
the gate cannot know which bash will run the command, so it denies a construct whose meaning
depends on that.

Context block:

- `engine/src/guards/git-plain-command-gate.js`: delete `IDIOM_HEADER_SOURCE`, `IDIOM_OPEN`,
  `IDIOM_CLOSE` and the equivalent-mutant comment between them (:32-35), `closingEnd` with its
  comment (:37-49), `idiomEndAt` with its comment (:51-59), and the idiom lines in `quoteChunk`
  (:84-86); `quoteChunk` then starts at `const end = quotedEnd(command, index);`. Keep
  `OPAQUE_WORD_PART` (:22), `holdsOpaquePart` (:111) and `isOpaqueCommand` (:112): they are
  still reachable without the idiom. A single-quoted command-position word that holds a literal
  `"` keeps the `"` in its word text, and the gate denies it today (pinned:
  `'a"b' x; git status` and `git status; 'a"b' x` → block, `echo 'a"b'; git status` → allow).
  Removing them would change that verdict, which is outside this change. Keep the signatures of `gitPlainCommandGate(command)`
  (:206) and `COMPLEX_NEAR_GIT_REASON` (:7).
- `engine/test/guards/git-plain-command-gate.test.js`: RED first by adding the matrix
  smuggling row ``'git commit -m "$(cat <<\'EOF\'\nx)"; git branch -D victim; echo "\nEOF\n)"'``
  to `COMPLEX_COMMANDS` (allowed today). Then move `PLAIN_COMMANDS` rows :152, :176, :177, :187 to
  `COMPLEX_COMMANDS`. Existing idiom-shaped `COMPLEX_COMMANDS` rows (:26-28, :44-46, :82, :125,
  :126, :142, and the `smuggled` helper at :5) stay; they now deny for the simpler reason.
- Not touched: `engine/test/guards/shell-tokeniser.test.js:262` and the predicate rows at
  `git-destructive-predicate.test.js:195,298`. The
  tokeniser and the predicates are shared by every binding and model bash 5 and zsh, which
  parse the idiom correctly. On copilot the gate runs first (`adapters/copilot/src/git-guard-adapter.js:110-116`
  `bashBlock`), so the predicates never see the idiom there.
- Mutation: Stryker on `git-plain-command-gate.js` with a narrowed vitest corpus (this module's
  suite plus `adapters/copilot/test/git-guard-adapter.test.js`). The deletion removes four
  equivalent-mutant comments (:33, :39, :53, :84); no new ones are expected.
- Commit: `fix(guards): deny the heredoc commit idiom in the copilot plain-command gate`.

### Part 3 — docs and backlog (all options)

Context block:

- `adapters/copilot/README.md:70-75` and `docs/contributing/specs/gate.md:171-174`: replace the
  "craft's … idiom is accepted … a bash limitation, not the guard" sentences (R6). Proposed
  text under DC-1 (b) + DC-2 (b):
  > The `"$(cat <<'EOF' … EOF)"` commit idiom that some harnesses emit is denied. On macOS
  > `/bin/bash` 3.2 it fails to parse when the body holds an odd quote, an odd backtick or a `(`,
  > and a `)` in the body ends the substitution early and runs the rest as shell. Commit the way
  > craft's core contract teaches: `git commit -m "<message>"` (one double-quoted `-m` per
  > paragraph), or `git commit -F <file>` with the file written in a separate call when the
  > message holds `` " $ ` \ ! ``.

  Under DC-2 (a), "is denied" becomes "is accepted", and the early-close sentence moves to the
  residuals list (README from :98, gate.md from :200) as a channel a static guard cannot see.
- `README.md:96`, `gate.md:198`: R7.
- `BACKLOG.md:215-219`: R8.
- `README.md:200`: the design-doc count moves with this doc's own commit, not with Part 3.
- Commit: `docs(copilot): state the commit form bash 3.2 parses and drop the craft's-idiom claim`.

### Edge behaviour

- Harness defaults still emit the idiom. Under DC-1 (b) the injected core contradicts them on
  every phase spawn. Under DC-2 (b) copilot denies the idiom deterministically, and the agent
  re-issues the command in the taught form, at a cost of one tool call. Without DC-2 (b),
  a copilot message with an odd quote costs one failed command, and a `)` in it costs a wrong
  commit message that nothing flags.
- Orchestrator commits made outside a phase (run-record and metrics chores) get no block
  (ADR-468) and keep the harness default. Their messages are fixed templates such as
  `chore(metrics): record the <slug> run`, which hold none of the trigger characters.
- On Linux, copilot's `/bin/bash` is usually bash 5 and parses the idiom. DC-2 (b) denies it
  there too. Bash 5 behaviour is not pinned on this box (no bash 5 installed); the denial does
  not depend on which shell runs.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How craft responds to the bash-3.2 misparse | (a) **Document only**: copilot README + gate.md gain the workaround (double-quoted `-m`, `-F <file>`); no contract change. (b) **Teach the form in `contracts/core.md`**: one line (R1) + one `CORE_MARKERS` entry, plus the docs. (c) **Teach it in the committing bundles**: the same line in `producer`, `construction`, `refinement`, `harness-exec` and `delivery` | (b) | (a) leaves every role following the harness default, which the matrix shows fails or silently corrupts on bash 3.2; only someone who reads the adapter README benefits. (b) reaches every phase in both execution modes from one place (`contract.js:216`), with ADR-468 as precedent; cost about 240 bytes per spawn, including the read-only review spawns. (c) skips those review spawns but repeats one rule five times, and still misses the decisions phase, which commits ADRs but has no bundle |
| DC-2 | What copilot's plain-command gate does with the idiom | (a) **Keep accepting it**; record the bash-3.2 early-close smuggle as a residual. (b) **Deny it**: delete the idiom special case (Part 2). (c) **Accept only bash-3.2-safe bodies**: no `'`, `"`, backtick, `(` or `)` in the body | (b) | The matrix shows a `)"` body running `git branch -D` past a gate that denies the same command spelled plainly. (a) keeps a hole in a shape the gate allows by name (ADR-595). (c) needs a safe character set pinned against bash 3.2's scanner, where any gap fails open, and it denies most real bodies anyway. (b) fails closed, removes code, and costs one re-issue per idiom; this is cheap when DC-1 (b) teaches the replacement. The scope-minimal choice is (a), if the hole is accepted as a residual |
| DC-3 | The fallback for a message that `-m "…"` cannot carry | (a) `-F <file>`, with the file written outside the working tree by a command that does not mention git. (b) Rephrase the message to avoid `` " $ ` \ ! ``. (c) Single-quoted `-m '…'` when there is no apostrophe | (a) | Pinned to commit exact text under bash 3.2, sh and zsh, and allowed by the gate. (b) changes the message, but roles receive it as an "exact message" (`construction.md:3`). (c) does not help: the gate denies `$` and backtick inside single quotes as well (`SINGLE_QUOTE_FORBIDDEN`, :17; matrix row `'fix: costs $5'`) |

## Test strategy

- Part 1, RED→GREEN: add `'Commit form'` to `CORE_MARKERS`. `scenarios.test.js` S2 and the
  `contract-equivalence.test.js:78` marker loop fail on the missing marker, and so does the new
  inline-mode pin. Add the line and all three pass. `contracts-lint` stays green. No mutation run: a contract line and a test
  constant have nothing to mutate.
- Part 2, RED→GREEN: the new smuggling row in `COMPLEX_COMMANDS` fails today (the gate allows
  it). Delete the idiom code and it passes. The four moved rows fail as `PLAIN_COMMANDS`, so they
  are moved in the same RED step and pass as `COMPLEX_COMMANDS` after the deletion. Every
  remaining `PLAIN_COMMANDS` row and the linear-time test (:245) stay green. Mutation: a
  narrowed Stryker run on `git-plain-command-gate.js` with no new survivors; check every survivor
  against the full covering set, including `adapters/copilot/test/git-guard-adapter.test.js`.
- Edge matrix covered by Part 2 rows: an idiom with a plain body (:176/:177), with `$` and
  backticks (:152), with a second `-m` (:187), and with a `)"` smuggle (new). Plain double-quoted
  `-m` with an apostrophe (`git commit -m "fix: don't stop"`) gets a `PLAIN_COMMANDS` row. The
  existing row `'git add -A && git commit -m "feat(guards): x — y"'` (:149) has no apostrophe,
  so the new row is the one that keeps the taught form allowed. It passes on its first run (a
  GUARD, not a RED).
- Part 3: `bash scripts/ci.sh` green (prose-lint, readme-drift, design-lint, backlog-lint). The
  R6 grep returns nothing.
- Shell behaviour is not re-tested in-suite. The matrix above is the pinned record. The suites
  stay hermetic, and the taught form is ordinary quoting that every shell parses the same way.
- Optional live smoke, the user's call: one copilot `-p` session in a throwaway repo issuing the
  idiom (expect a deny) and `git commit -m "fix: don't stop"` (expect a commit).

## Out of scope

- Changing the tokeniser or the shared predicates to model bash 3.2's `$(…)` scan. They serve
  every binding and model bash 5 and zsh; on copilot the gate runs first.
- Orchestrator commits outside a phase (`skills/run/SKILL.md`). They get no contract block
  (ADR-468), and their fixed-template messages hold no trigger character.
- Pinning the shell that codex, cursor, opencode, aider, antigravity or pi use for model
  commands. Proving it takes one throwaway session per binding that runs `echo $BASH_VERSION
  $ZSH_VERSION` through the agent.
- Amending ADR-595's "Craft's commit idiom … body treated as data". ADRs are records; the ADR
  phase writes a refining ADR if DC-2 (b) is chosen.
- Dated design and plan docs that call it craft's idiom (`copilot-git-argv-normalising-guard.md`,
  plan of the same name). They are records of what was believed at the time.
- Proven, not acted on: `adapters/copilot/README.md:122-123` and `docs/contributing/specs/gate.md:229`
  give "an apostrophe plus `$` in a quoted word (`git commit -m "it's $HOME"`)" as the intended
  false block. The gate denies any `$` or backtick in a quoted word, and `\` or `!` in a
  double-quoted word, with or without an apostrophe (matrix rows `'fix: costs $5'` and
  `"fix: stop!"`; `git-plain-command-gate.js:16-17`). The listed example is narrower than the rule.
