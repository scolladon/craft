# Maintainer smokes

On-demand checks a maintainer runs by hand with `/craft:run`; none is CI-gated.

## Manual acceptance check (inline fidelity) — not CI-gated

On demand / as a release smoke test: invoke craft with `--profile lean` (or `solo`) on a
real brief, confirm the inline phases commit artifacts in the same shape as the agent path
(the injected block differs only by the two carve-out lines —
`engine/test/contract-equivalence.test.js` proves that bound per descriptor), and record
the result in the run record under `inline-fidelity-check`. Rationale:
`docs/contributing/archive/DESIGN-P6-execution-topology.md`.

## Model-class matrix (cross-tier) — not CI-gated

On demand / when a maintainer wants the full-pipeline + output-quality matrix: run the
full pipeline across the Claude class — opus (`claude-opus-5-5`), sonnet
(`claude-sonnet-5-5`), haiku (`claude-haiku-4-5`) — on a representative brief,
record a tier×dimension PASS/PARTIAL/FAIL table (dimensions: planner / part-TDD /
structured-review / blocker / full-pipeline-completion), and capture the per-phase
tokens + wall-clock into the committed artifact and the run record.

**Numbers are harness-sourced.** The orchestrator reads `subagent_tokens` and `duration_ms`
from that phase's own sub-agent transcript, not from the spawn's returned final-message usage
block — that block reflects only the sub-agent's last turn, not its cumulative usage, so
trusting it undercounts by roughly two orders of magnitude. This is one file read per phase,
not zero-cost. No agent is asked to report its own usage.

**Where results land:** fill `docs/guides/model-class-matrix.md` (the committed, diffable
artifact template) and append a one-line entry to the run record under
`model-class-matrix`. Rationale: `docs/contributing/archive/DESIGN-P13-nfr-hardening.md`.

## Registered-phase dispatch smoke — not CI-gated

On demand / when end-to-end cross-plugin fidelity must be confirmed: spin up a throwaway
two-plugin fixture (mirroring SP2's `/tmp/craft-sp2`) and drive it with
`claude -p --plugin-dir craft --plugin-dir <pluginB>`, using a manifest that registers a
phase via `extends.phases` pointing at a `pluginB:` procedure. Assert the registered phase
dispatches (the walk reaches step 2 for it) and spawns (an agent is started under the
assembled contract). Document the result in the run record. This smoke is on-demand, NOT
CI-gated — the engine path it exercises is CI-proven by the S7 scenario fixture; this smoke
adds runtime cross-plugin fidelity without coupling CI to a second install.

## SC5 second-instantiation smoke — not CI-gated

On demand / when zero-config fidelity on a non-tsgit toolchain must be confirmed: take a
second repo with a test command discoverable without a manifest and **no** `.claude/workflow.md`
(e.g. a small Python + `pytest` project), then drive the default pipeline against it on a small
free-text brief (zero manifest ⇒ no `backlog:`, so the input is a brief/file, never a backlog
id). Confirm the per-phase capability-probe matrix: `worktree-setup.sh` detects the ecosystem
(or reports a noted skip when no lockfile is recognized); the gate probe discovers the repo's
test command (`pytest`/`go test`/`cargo test`/…) and `implementation` runs rather than hitting
the gate-floor REFUSE; `validation` no-ops with a note when no techniques declared/probed
(and its `propose`-gate entry is released, so the walk reaches `propose`); `propose`/`integrate`
no-op when there is no remote. Record the target's identity, toolchain, discovered gate command,
and per-phase outcomes in `docs/contributing/archive/SC5-second-instantiation-record.md`. This smoke is on-demand, NOT
CI-gated — the engine path it exercises (toolchain-neutral resolution) is CI-proven by the `SC5`
scenario fixture; this smoke adds runtime fidelity on a real second toolchain without coupling CI
to a non-JS install.
