---
subjects:
  - engine/src/guards/shell-git-invocations.js
  - engine/src/guards/git-destructive-predicate.js
  - engine/src/guards/git-ext-diff-predicate.js
  - adapters/copilot/hooks/craft-guard.js
supersedes: []
---
# 594 — The tokeniser fails closed on unmodelled shell constructs and on excess work

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** refines ADR-580, ADR-582, ADR-584

## Context

Review cycle 1 verified about eighteen false allows, each one a bash construct the tokeniser does
not model: ANSI-C escapes in `$'…'` (`$'\x67it' push`), locale strings `$"git" push`, brace and
glob expansion (`{git,push}`, `gi[t] push`), `#` inside `${…}`, `<<` inside `((…))`, shell and
`env` option grammar (`bash -o pipefail -c '…'`, `env -S'…'`), dynamic words behind wrappers
(`command $G push`), the dashed builtins (`git-push`), and config channels outside `-c`
(`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_KEY_n`, `-c include.path=`). It also verified a fail-open by
resource exhaustion: an 80 KB chain of `eval` words drove the real hook to 49 s and a V8 out-of-memory
abort (exit 134, no verdict), past copilot's ~30 s hook timeout, which fails open.

## Options considered

1. **Invert the default: anything not fully modelled is dynamic or unparseable, and work is
   bounded** *(recommended)* — pros: closes each class and the next unmodelled one / cons: more
   intended false blocks on exotic shell.
2. **Model each reported construct precisely** — cons: the next unmodelled construct is the next
   bypass.
3. **Fix the CRITICAL and HIGH findings, document the rest** — cons: known bypass classes shipped.

## Decision

**Ratified by the user.** Option 1:

- A word whose expansion the tokeniser does not compute is **dynamic**: a `$'…'` holding a
  backslash escape, any unquoted brace expression (`{a,b}`, `{a..b}`), any unquoted glob character
  (`*`, `?`, `[`). `$"…"` is read as a double-quoted string.
- A construct the tokeniser cannot place is **unparseable** (deny): it includes the cases where
  its own state would otherwise swallow text bash executes (a `#` inside `${…}` is literal; `<<`
  inside an arithmetic command is not a heredoc). Where a shell or `env` option grammar is not
  modelled exactly, every later non-option word is re-parsed as a command.
- A dynamic word anywhere in a simple command that is followed by a destructive verb word anchors
  an invocation; a word whose basename is `git-<verb>` is read as `git <verb>`.
- Config channels other than `-c alias.*` block in both predicates: `--config-env`/`-c` keys
  `include.path` and `includeif.*`, and assignments (as head words or `env` arguments) to
  `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`,
  `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`. An `alias` builtin whose value holds a git word blocks.
- **Work is bounded**: a hard input-length cap (131072 characters) denies with a fixed reason;
  only the first `eval` of a simple command is re-parsed (its string already holds the later ones);
  anchoring and option normalisation run in linear time; the nesting cap (8) stays. A separate
  parse work budget was built and then removed as unreachable: instrumented runs peaked at 7.9x the
  input length (8-level heredoc and `$()` nests over a 10k core) against a 16x budget, because the
  nesting cap already bounds re-scanning to about one pass per level.

## Consequences

The intended false-block classes grow (exotic quoting, brace/glob words near git, dynamic words
before a verb word) and are pinned in tests and documented. The differential fuzz gains generator
fragments for every class above and judges bash's logged argv with an oracle independent of the
tokeniser.
