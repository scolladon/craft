Never commit on a red gate.
Artifact handoff: @@ARTIFACT_HANDOFF@@
Blocker protocol: { unit, reason, ≤3 options } — never spin or guess.
No provenance refs (phase/ADR/backlog numbers) in source or test.
No suppression directives (@ts-ignore, eslint-disable, coverage ignores, lint-silencing comments of any flavour).
No swallowed errors.
Bounded scope; work only in the given working directory.
Never change repo-wide git state (stash, pop, checkout, reset); another agent may be working the same tree.
Model: @@MODEL_RESOLUTION@@
