Never commit on a red gate.
Artifact handoff: @@ARTIFACT_HANDOFF@@
Blocker protocol: { unit, reason, ≤3 options } — never spin or guess.
No provenance refs (phase/ADR/backlog numbers) in source or test.
No suppression directives (@ts-ignore, eslint-disable, coverage ignores, lint-silencing comments of any flavour).
No swallowed errors.
Bounded scope; work only in the given working directory.
Out-of-perimeter finding: never fix it; report it in your final message as IMPACT(<file>): <finding> — proof: <command> ⇒ <expected>.
Committed artifacts carry repo-relative paths — never an absolute or home-rooted path (/Users/<name>, /home/<name>); name an out-of-repo location by placeholder (<worktree>, <main-repo-dir>, <node-bin>).
Never change repo-wide git state — the branch, the index, the working tree, or the stash; another agent may be working the same tree. Commit your own files and nothing else. Checkout, switch, restore, reset, clean, stash, rebase, and branch or worktree deletion are examples, not the whole list.
Commit form: git commit -m "<message>", one double-quoted -m per paragraph; a message holding " $ ` \ or ! goes in a file outside the working tree, committed with git commit -F <file>. Never -m "$(cat <<'EOF' … EOF)": /bin/bash 3.2 misparses it.
Model: @@MODEL_RESOLUTION@@
Output digest: any command whose output may exceed ~100 lines writes to a file; read back only the lines that matter (grep/sed, a symbol range). Never read a whole file when a range answers the question.
Turn budget: @@TURN_BUDGET@@
