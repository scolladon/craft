---
# Methodology declination — wires injection point #10 (`role:` swap) + #6 (`harness:`).
# Not itself a new injection point. The review phase runs the RecursiveMAS "Deliberation"
# topology in text space — N refinement rounds communicating ONLY through a bounded
# refined-state block (the latent analog). Opt-in, ~2x cost for depth — NOT a default.
phases:
  review:
    role: deliberation-reviewer   # save the agent below as .claude/agents/deliberation-reviewer.md
    harness:
      dimensions: [security]      # role: swaps the WHOLE phase — narrow to the one costly lens
      max_cycles: 2                # engine convergence OUTSIDE composes with rounds INSIDE
---

# Example — deliberation-topology review (RecursiveMAS style, text-space)

**Status: stable methodology declination — opt-in, ~2× the cost of a single-pass review,
for depth on one high-stakes dimension. Not a default.** This declination ports the
*collaboration methodology* of [RecursiveMAS](https://github.com/RecursiveMAS/RecursiveMAS)
— not its mechanism. The mechanism (trained RecursiveLink adapters exchanging hidden
states via `inputs_embeds`) requires white-box self-hosted models and does not transfer to
craft. What *does* transfer is the topology: recursive refinement rounds over a **bounded
shared state**, instead of one pass or an append-only transcript.

| RecursiveMAS (latent space) | this declination (text space) |
|---|---|
| Reflector / Tool-Caller deliberation rounds | SOLVER → REFLECTOR → SOLVER-FINAL rounds |
| latent state, `latent_length` tokens | `REFINED-STATE` block, ≤ 20 claim-lines |
| RecursiveLink projects state between models | the block is re-prompted verbatim to the next round |
| trained per agent-pair | zero training — the state contract is versioned text |

The refined-state contract is the interesting part — it is craft's artifact-handoff
philosophy applied *inside* a phase: each round is a fresh context receiving (diff +
state), never a growing transcript. Anything not written into the state is deliberately
lost, which forces claim compression (`VERIFIED:` / `SUSPECT:` / `RULED-OUT:` / `PROBE:`)
— the same four-token vocabulary a finding's optional `status` field now carries.

## Whole-phase swap, not per-dimension

`role:` replaces the reviewer for the **whole** `review` phase — there is no per-dimension
mixing of reviewers within one phase. To scope deliberation to the one dimension worth its
cost, narrow `harness.dimensions` (above, `[security]`) instead: the swapped
`deliberation-reviewer` then runs deliberation rounds on that dimension alone, in place of
the default single-pass reviewer.

## The agent (`.claude/agents/deliberation-reviewer.md`)

```markdown
---
name: deliberation-reviewer
description: Review-phase worker running the RecursiveMAS deliberation topology in text
  space. Each invocation is ONE round; rounds communicate ONLY through a bounded
  refined-state block. Opt-in — depth on one high-stakes dimension, ~2x the cost of a
  single-pass review.
model: opus
---

You are one round of a deliberation review of a code change. Your invocation names your
round role and carries the diff plus (after round 1) a REFINED-STATE block. The refined
state is the ONLY memory across rounds — anything not written into it is lost.

Round roles:

- SOLVER (round 1): review the diff for defects. Output nothing but a REFINED-STATE block.
- REFLECTOR (middle rounds): you see the diff and the refined state — no prior prose.
  Attack the state: which defect classes has it not examined or ruled out? Check at least:
  boundary conditions, identity/key construction, error paths and what failures they mask,
  resource lifecycle (creation, growth, teardown), API-misuse under optional inputs.
  Verify SUSPECT lines against the diff; promote to VERIFIED or demote to RULED-OUT.
  Output nothing but the updated REFINED-STATE block.
- SOLVER-FINAL (last round): from diff + refined state, emit the final structured findings
  list in the canonical per-line shape the review normalizer accepts, one per line:
  `[<STATUS>: ]<severity> <file>:<line> — <finding> [ | <fix>]` (severity in
  CRITICAL/HIGH/MEDIUM/LOW; the pipe is reserved for the optional fix; tag surviving
  claims with their status, e.g. `RULED-OUT: LOW src/x.js:4 — checked, not a defect`).
  No prose around it, no REFINED-STATE block.

REFINED-STATE contract (the latent analog — hard limits):

- at most 20 lines, plain text, fenced between `REFINED-STATE:` and `END-STATE`
- every line is a claim with a status prefix: `VERIFIED:`, `SUSPECT:`, `RULED-OUT:`, `PROBE:`
- compress aggressively — keep the strongest claims, drop resolved probes
```

## What the G5 guarantee means here

The `role:` swap changes *who* reviews, never *what binds it*: the engine still assembles
the review contract from the phase descriptor and injects it around this agent. The
deliberation rounds happen **beneath the artifact boundary** — the phase still hands off a
committed findings artifact, the invariant core is untouched.

## Measured (probe date 2026-07-25)

Full method and matrix:
[docs/design/sp9-findings-adoption.md](../../docs/contributing/design/sp9-findings-adoption.md). Headless
A/B/C on a 4-planted-bug diff, sonnet all arms, no tools:

| arm | shape | output tokens | planted caught |
|---|---|---|---|
| A | craft default single-pass reviewer | 7,860 | 4/4 (+2 extra) |
| B | **this declination** — 3 rounds, ≤20-line refined state | 18,289 | 4/4 (+2 extra, incl. one A missed) |
| C | control — 3 rounds, full-transcript threading | 26,340 | 4/4 (+4 extra) |

Read: the topology works mechanically (round 2 promoted SUSPECT→VERIFIED and demoted
probes to RULED-OUT inside the bound) and buys extra *depth* at ~2× the single-pass cost —
worth it only for high-stakes dimensions, not as a default. The interesting micro-result
is **B vs C**: bounded-state threading kept comparable final quality at ~31% fewer output
tokens than transcript threading — the RecursiveMAS thesis-analog, and craft's own
artifact-over-transcript philosophy, confirmed *inside* a phase. Caveats: n=1, one small
diff, catch-rate saturated at baseline — treat as directional.

> In your real repo the frontmatter above lives at the project root as `.claude/workflow.md`,
> and the agent block is saved to `.claude/agents/deliberation-reviewer.md`.
