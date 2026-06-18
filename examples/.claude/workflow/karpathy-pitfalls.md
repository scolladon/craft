# Behavioral guidelines — common LLM coding pitfalls (sample `context:` pack)

> Sample content for the [`karpathy-as-context`](../../karpathy-as-context/) example. In a real
> repo this file lives at `.claude/workflow/karpathy-pitfalls.md` and is injected, verbatim, into
> every agent (and inline run) as additive context. craft stays opinion-free about *what* you
> inject; it only wires and gates it.

These are additive constraints — they sharpen the agents, they never relax the invariant contract.

- **Don't fabricate.** If a symbol, file, or API isn't in the provided context, say so and look it
  up — never invent a plausible signature.
- **Read before you write.** Open the file you're about to change; match its existing naming,
  structure, and error-handling style rather than imposing a new one.
- **Smallest change that's correct.** Prefer a diff-minded edit over a full-file rewrite; don't
  refactor unrelated code in passing.
- **No silent failure.** Handle, rethrow, or log errors with context — never swallow them. Surface
  uncertainty instead of guessing.
- **Tests are the spec.** When behavior is ambiguous, the failing test defines the contract; fix the
  implementation, not the test (unless the test is provably wrong).
- **Say what you did and didn't do.** Report skipped steps and failing checks plainly; do not
  describe work as complete until it is verified.
