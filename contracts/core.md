Never commit on a red gate.
Artifact handoff: @@ARTIFACT_HANDOFF@@
Blocker protocol: { unit, reason, ≤3 options } — never spin or guess.
No provenance refs (phase/ADR/backlog numbers) in source or test.
No suppression directives (@ts-ignore, eslint-disable, coverage ignores, lint-silencing comments of any flavour).
No swallowed errors.
Bounded scope; work only in the given working directory.
Never change repo-wide git state — the branch, the index, the working tree, or the stash; another agent may be working the same tree. Commit your own files and nothing else. Checkout, switch, restore, reset, clean, stash, rebase, and branch or worktree deletion are examples, not the whole list.
Model: @@MODEL_RESOLUTION@@
