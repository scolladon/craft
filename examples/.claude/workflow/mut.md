# Validation procedure — project-shaped mutation testing (sample `override:` body)

> Sample content for the [`override-procedure`](../../override-procedure/) example — the
> **overridable Procedure half** of the `validation` phase. In a real repo this lives at
> `.claude/workflow/mut.md`. The engine still prepends the non-overridable Preamble (the invariant
> contract) around these steps — this file owns *how* mutation runs, never *what binds it*.

## Steps

1. **Scope** — restrict mutation to the hunks this branch changed (`git diff --no-ext-diff
   main...HEAD`), not the whole tree, so the run is bounded and fast.
2. **Run** — invoke the project's mutation tool over that scope; capture the surviving mutants.
3. **Triage each survivor** — for every surviving mutant, either:
   - **kill it** with a new/strengthened test that fails on the mutant and passes on HEAD, or
   - **prove equivalence** — document why the mutant is behaviorally identical (no test can
     distinguish it) so it is provably, not lazily, accepted.
4. **Gate** — the phase is green only when every survivor is killed or documented-equivalent.
   Never accept an untriaged survivor; never lower the threshold to pass.

## Notes

- The closing gate, the never-commit-on-red rule, the blocker protocol, and the run record come
  from the injected Preamble — do not restate or relax them here.
- Tune the tool/scope here freely; this is exactly the project-shaped flexibility `override:` exists
  for.
