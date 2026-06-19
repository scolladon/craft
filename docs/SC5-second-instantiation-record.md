# SC5 — second-instantiation validation record

> The committed, diffable proof that **a second, non-tsgit repo runs the default pipeline
> with no manifest** (PRD §18 SC5; gate G9). The engine-resolution layer is CI-proven
> toolchain-neutral by the `SC5` scenario (`engine/test/scenarios.test.js`); this record
> captures the on-demand **runtime** smoke — the skill/script capability-probe layer
> exercised against a real Python/pytest repo. See `skills/run/SKILL.md` §"SC5
> second-instantiation smoke" for the procedure.

## Verdict: **PASS**

The default 11-phase pipeline runs zero-config on a non-tsgit repo. The only JS tool-name on
the enabled default path (`validation.harness.tool: stryker`) degrades to a recorded no-op,
and the orchestrator releases its `propose`-gate wait on that no-op, so the walk reaches
`propose` without deadlocking.

## Target repo

| Attribute | Value |
|---|---|
| Project | Conway's Game of Life (set-based, unbounded grid) — a throwaway target |
| Language / runtime | Python 3.14 |
| Test runner | `pytest` 9.x (7 tests, green) |
| Dependency manifest | `pyproject.toml` + `requirements.txt`, **no lockfile** (no `uv.lock`/`poetry.lock`) |
| Workflow manifest | **none** (no `.claude/workflow.md`) — zero-config |
| Remote | none (local-only) |
| Mutation tooling | none configured |

The repo satisfies the SC5 precondition (ADR-076): a non-tsgit repo with a test command
discoverable without a manifest.

## Resolved walk (engine layer — repo-independent)

`pipeline-resolve` with no manifest emits the same 11-phase walk regardless of target repo
(this is the CI-gated `SC5` scenario's guarantee — gate decisions carry language-free
placeholders, never a baked-in command):

```
workspace → design → decisions → planning → implementation → review
          → refactoring → validation → documentation → propose → integrate
propose.awaitingHarnesses = ["validation"]   waivers = []
```

## Per-phase runtime outcome (observed on the target repo, zero manifest)

| Phase | Probe / degradation observed | Result |
|---|---|---|
| workspace | `worktree-setup.sh` → "no recognized lockfile/manifest — dependency install skipped (noted)" (Python, no lockfile) | runs |
| design / decisions / planning | language-neutral artifact phases; `plan-lint` (craft-internal awk) gates planning | run |
| implementation | gate probe discovers the repo's test command → **`pytest`**; suite green (7 passed); **no gate-floor REFUSE** | runs |
| review | same `pytest` gate; dimensions (code/security/tests/perf) are language-neutral | runs |
| refactoring | same `pytest` gate | runs (may honestly no-op) |
| validation | mutation-tool probe finds **no** config (no stryker/mutmut/cosmic-ray/cargo-mutants) → **no-op with a note**; its `propose`-gate entry is **released** (the runtime-no-op release clause) | no-op (released) |
| architecture | `enabled: false` by default → **not in `effective[]`** | n/a |
| documentation | probes affected pages + backlog; zero-manifest → no `backlog:` declared → no backlog work | runs |
| propose | remote probe → **none** → propose no-op; work stays on the local branch; no PR | no-op |
| integrate | gated on propose's remote probe → no-op | no-op |

The single JS tool-name that reaches the enabled default path (`stryker`) never runs against a
non-JS repo: the probe is tool-agnostic and ends with a recorded no-op. The gate-floor REFUSE
(implementation with no discoverable test command) did **not** fire here because `pytest` is
discoverable — and it is correct floor behaviour, not an SC5 miss, on a repo that genuinely has
no test command (ADR-076).

## How to reproduce

1. Create or clone a non-tsgit repo with a discoverable test command and no `.claude/workflow.md`
   (here: a tiny Python + `pytest` project).
2. Confirm `node engine/bin/pipeline-resolve.js pipeline/default.yml` (no manifest) emits the
   11-phase walk above — the engine-layer guarantee (also pinned by the `SC5` scenario).
3. Run each capability probe against the target repo and confirm the per-phase matrix above:
   `worktree-setup.sh <repo>` (ecosystem detect / skip-noted), gate discovery (`pytest` runs
   green, no REFUSE), mutation-tool probe (none → no-op), remote probe (drives propose/integrate).
4. Record the target's identity, toolchain, discovered gate command, and the per-phase outcomes
   here.
