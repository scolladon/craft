# What craft costs, and what it buys

A controlled comparison of three ways to deliver the same change: a plain prompt,
a hand-staged design→plan→implement run, and craft.

**n=1.** One refactor, one repository, one run each. Directional evidence, not a
benchmark. Read the [caveats](#caveats) before quoting any number.

## The experiment

The task was a behaviour-preserving refactor of
[sfdx-git-delta](https://github.com/scolladon/sfdx-git-delta): make its metadata
handlers pure — remove a shared mutable accumulator threaded through 14 handler
classes, plus a mutable orchestration object and an in-place-mutated domain type.
No output change permitted; the repo's own gates must stay green.

That shape was chosen deliberately. It is wide (77–79 files), it is
behaviour-preserving (so "it still works" is the whole requirement), and the
repository enforces a 100% unit-coverage threshold — which turns out to matter.

| Arm | Process | Prompt |
|---|---|---|
| plain | feature description only | "Implement the refactor described in SPEC.md" |
| staged | description + design + plan + implementation | the same, plus a three-stage instruction ending "show me the design before you plan, and the plan before you implement" |
| craft | craft on the description | `/craft:run SPEC.md` |

All three ran from the same base commit in isolated git worktrees, driven by a
fixed operator protocol: answer what is asked, volunteer nothing, approve
permission prompts, approve the staged arm's gates tersely so that reviewing it
harder than craft's design phase could not hand it an advantage.

## Results

| | plain | staged | craft |
|---|---|---|---|
| Interactions | 1 | 3 | 1 |
| Tokens | 88.6M | 154.3M | 544.3M |
| Cost | $62.72 | $103.95 | $297.55 |
| Agent time | 41m | 1h 8m | 4h 49m |
| Commits | 1 | 7 | 13 |
| Gates (cold cache) | 5/5 pass | 5/5 pass | 5/5 pass |
| Tests | 1343 | 1342 | 1363 |
| Blind quality | 25/35 | 23/35 | **27/35** |
| Mergeable as-is | **no** | with 2 fixes | with 1 fix |

Efficiency figures are derived from session transcripts, not self-reported — the
arms were never told they were being measured, which would have biased them.
Quality was scored by an independent judge on anonymized diffs with all
process markers stripped; the mapping was revealed only after scoring.

**craft cost 4.7x the plain run.**

## What that bought

### The cheapest run shipped a silent output change

The plain arm passed build, lint, integration, functional, and 1343 unit tests at
a 100% coverage threshold — and changed generated output on an ordinary diff.

It rewrote a surgical index removal as a rebuild through a tuple projection that
keeps only the first matching change-kind. A component legitimately carrying two
kinds therefore loses one. Reachable via a bundle type whose member is derived
per *content item* rather than per file: add one file, modify another in the same
item, and the member sits in two kind buckets.

What made the rewrite look safe was a code comment asserting the case could not
happen. The comment was wrong. Nothing in the gate stack could catch it, and the
mutation-testing job that might have was itself broken (see below).

### craft's review phase found what coverage hid

Two HIGH findings, each **proven red by injection** before being accepted:

- two warning-propagation legs were wired but never asserted — deleting them left
  1719 tests green at 100% coverage
- a public validation function's return value was never inspected by any test;
  all 30+ assertions hit a private method instead

This is the same failure class the plain run shipped. Coverage measures which
lines executed, not which behaviours are pinned.

### It disproved its own regression

Three benchmarks showed 2.0–6.9x slowdowns. Rather than shipping the alarm or
chasing it, the run root-caused a **self-referential fixture**: the benches read
`HEAD~20..HEAD`, and the run's own 7 commits had grown that range from 112 to 156
files. Proof was blob-SHA identity across every file the benches touch, plus
re-pinning the range to the baseline commits, which returned the figure to 1.02x.

### It separated "my bug" from "not mine"

Five security findings ruled out with evidence. A pre-existing O(n²) queue
operation ruled out as untouched and out of scope. Two latent behaviour deltas
*declared* rather than buried. And a live broken CI gate surfaced, proven
independent of the change, and deliberately not fixed: the repository's mutation
job calls a TypeScript API removed in TS 7, so it cannot pass. The run recorded
that its own change therefore went un-mutation-scored, and hand-injected 7
targeted mutants as a partial substitute — all killed.

### It policed itself

The code reviewer caught craft's *own* sub-agents leaking design-provenance
references into shipped source and test titles — a violation of a contract craft
injects into every spawn prompt. It also removed a `try/catch` its own
implementer had added, reasoning that the fold is structurally total, so the
catch would be an uncovered branch under a 100% threshold.

## Where craft lost

Honest scoring, from the same blind judge:

- **Purity (4/5 vs the plain run's 5/5).** craft left the orchestration object
  mutable — one of the three smells only half addressed. The cheapest run did
  that part better.
- **Scope discipline (3/5).** It deleted a post-processor class and relocated its
  logic, an extension-architecture change nobody asked for.
- **A declared regression it shipped anyway.** Moving a transform out of a
  guarded call site means a throw there now aborts the run instead of degrading
  to a warning.
- **Plan gaps.** Part enumeration missed two test files; implementers caught them
  as collateral and reported it. Recovery worked; the plan was still wrong.

More process is also not automatically better. The **staged** arm spent 66% more
than the plain run and scored *worse* — it used the extra thinking to invent
three role interfaces, a 173-line builder, a visitor protocol, and an unrequested
`Object.freeze`. Where the thinking lands matters more than how much of it there
is.

## When craft is worth it

**Worth it** when the change is wide, behaviour-preserving, or lands where a
silent regression is expensive to find later — exactly the shape above. The
correctness-assurance argument is the strong one: craft was the only arm whose
branch was mergeable, and the only one that found the defects the repo's own
tooling could not.

**Not worth it** for a one-file fix, a copy change, or a dependency bump; for
spikes and throwaway prototypes; in a repo with no usable test command, where the
never-commit-on-red invariant has nothing to stand on; or under a tight token
budget — expect single-digit-x the cost of an unguided run, with sub-agents
dominating (75% of tokens here).

## Caveats

1. **n=1.** One feature, one repo, three runs. The quality spread (23–27 of 35)
   is narrow enough that a different task could reorder the middle.
2. **Wall clock is contaminated.** All three ran in parallel, sharing CPU and API
   rate limits. Do not read craft's elapsed time as "craft is 6.5x slower"
   without a serial re-run.
3. **The judge is a single model** — blind, but not an independent panel. Its
   specific findings are file-level and checkable, and the one carrying the
   conclusion was verified by hand. The 1–5 numbers are softer.
4. **Quality was judged on diffs only**, which excludes the staged arm's design
   and plan documents and craft's run record — artifacts those processes exist to
   produce. This under-credits both.
5. **"Plain" is not unguided.** A global instruction set (TDD, SOLID,
   conventional commits, coverage expectations) applied to all three arms. A
   genuinely unguided run would likely score worse.
6. **The measurement harness had two bugs, both flattering craft** — see below.

## Measuring this yourself

Two traps, both found the hard way:

**Sub-agent cost is not in the spawn rollup.** The parent session records a
rollup carrying the sub-agent's *final message* usage. Summing those
under-reported real sub-agent cost by **~58x** in this run. Read the nested
per-sub-agent transcripts instead. *craft's own metrics ledger is written from
the rollup path and currently carries this error — it under-reports its own
cost.*

**A typed slash command is not a `human` origin.** It arrives as
`<command-name>` markup with no origin field, so a naive interaction count scores
a `/craft:run` session at zero interactions and zero elapsed time.

Also: cached task-runner results will happily report a green gate without
executing anything. Invalidate the cache before trusting a gate run.
