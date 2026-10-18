---
subjects:
  - hooks/git-no-ext-diff.sh
  - engine/src/claude-ext-diff-hook-main.js
  - engine/bin/claude-ext-diff-verdict.js
  - docs/contributing/specs/gate.md
  - README.md
supersedes:
  - adr: "542"
    scope: "the hook's verdict is grep's printed match count over its own regex"
---
# 646 — The Claude ext-diff hook delegates its verdict to the engine

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/claude-ext-diff-hook-gaps.md · **Supersedes/Refines:** supersedes ADR-542

## Context

`hooks/git-no-ext-diff.sh` judges with its own regex (`GIT_RE`) and allows `(git diff)`, `FOO=1 git diff`,
`env`/`command`/`!`/`time git diff`, `{ git diff; }`, `git --no-pager diff`, `git -p diff` and
`git --git-dir .git diff` (3/3 each on 0d44e0e). The regex has no quote state: it falsely denies quoted
text holding `; git diff`, and its corrected command rewrites that data. Codex and copilot already judge
with the engine's shell parse, which denies every one of these forms.

## Options considered

1. **Patch the bash matcher** — pros: crash contract untouched, no node / cons: six measured ext-diff
   bypass rows stay open (quote removal, `sh -c`/`eval`, `/usr/bin/git`, `xargs`, substring bypass,
   `--no-ext-diff --ext-diff`) and the false denies stay
2. **Node entrypoint replaces the bash hook** — pros: one process / cons: node missing (127) or killed
   fails open where bash denies today; `hooks.json` changes
3. **Bash crash shell + node verdict** *(recommended)* — pros: every crash path keeps its exit-2 deny;
   the engine closes every pinned form / cons: about 22 ms per Bash call (11 → 33 ms); node replaces jq
   as the hook's prerequisite

## Decision

Ratified by the user: option 3. The bash hook keeps its EXIT/TERM/HUP traps, `verdict_reached`, the
feed sentinel and exit 2 on every failure. It runs `node engine/bin/claude-ext-diff-verdict.js`, which
reads the payload from the inherited stdin and prints exactly one token: `allow`, or the JSON deny.
The hook allows only on the `allow` token, prints the JSON deny as given, and treats a non-zero node
exit, a missing sentinel, or any other output as a crash, which the EXIT trap denies.

Superseded from ADR-542: the verdict is grep's printed match count over the hook's own regex.

Carried forward from ADR-542: only an explicit clean verdict allows; any other status of the verdict
step is a crash the EXIT trap denies; a large matching command is denied like a short one.

## Consequences

`cat`, `jq`, `grep` and `sed` leave the hook; node missing or older than the engine's range is a crash
deny. ADR-533/534/535, ADR-539, ADR-540 and ADR-541 still hold unchanged, and the hook header,
`docs/contributing/specs/gate.md` and `README.md` (ADR-538) are edited together. The residual fail-opens
(`/bin/bash` missing, hook file missing, SIGKILL or untrapped signal, Claude Code's timeout) are
unchanged. `git${IFS}diff` stays allowed, the engine residual codex and copilot share.
