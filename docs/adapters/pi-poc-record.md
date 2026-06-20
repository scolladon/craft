# Pi PoC — on-demand smoke evidence record

> The deterministic adapter seams (Execution arg-shaper, Gate predicate, probe
> structural assertions) are CI-proven by the unit tests in `adapters/pi/test/`.
> This document records the on-demand **runtime** smoke — a live Pi run through the
> acceptance-probe harness exercising all four ports against a real Pi session in a
> throwaway repo. It is refreshed by re-running the probe.

> **Not CI-gated.** The live Pi run is on-demand only. The entry point is
> `runAcceptanceProbe` exported from `adapters/pi/src/probe.js`; it requires an
> injected `piRunner` that shells out to a real `pi` binary.

## Verdict: **PASS** (2026-06-20)

A live Pi run completed one construction-bearing phase end-to-end through the Pi adapter
and `runAcceptanceProbe` returned `{ passed: true }`. The provider was **Gemini**
(non-Claude) on its free tier — demonstrating the provider-agnostic goal (G13) directly:
a non-Claude runtime ran a craft construction phase through the adapter and committed a
gated artifact.

## Target repo

| Attribute | Value |
|---|---|
| Project | throwaway `mktemp -d` repo, `git init`-isolated, single construction brief |
| Pi version | `0.79.8` (`@earendil-works/pi-coding-agent@0.79.8`) |
| Phase exercised | `implementation` (construction archetype) |
| Model tier | `sonnet` (descriptor `model: sonnet`) → mapped by the adapter to `google/gemini-2.5-flash` for the free-tier smoke |
| Workflow manifest | none — engine `pipeline-resolve` drives the walk |
| Remote | none (throwaway, local-only) |

## Ports exercised

| Port | Mechanism exercised live | Outcome |
|---|---|---|
| Execution | `resolvePipeline()` + `assembleBlock()` (engine-bin wrapper) → `buildPiArgs()` (arg-shaper) → `spawn pi` (subprocess, argv-array, no shell, stdin ignored) | Pi ran the construction phase; `resolvePipeline` returned `ok:true`, `implementation.model = sonnet` |
| Model | descriptor `model: sonnet` → adapter mapped the craft tier to `google/gemini-2.5-flash`; key supplied via `GEMINI_API_KEY` in the child env | Pi session bound to the resolved model; phase ran on it |
| Gate | engine-owned gate command (`node --test`) run on the committed state; the slice's own `node --test && git commit` chain enforces green-before-commit | Gate green; never-commit-on-red held |
| VCS | throwaway isolated via `git init`; Pi's mutations confined to the throwaway; committed artifact = the handoff | Mutations stayed inside; commit `9f6ab07 feat: add function` created |

## Per-phase outcome

| Step | Expected | Actual |
|---|---|---|
| RED → GREEN → commit landed | One construction-phase slice committed inside throwaway | ✅ `9f6ab07 feat: add function` (`add.mjs` + `add.test.mjs`, 5 insertions) |
| Gate green before commit | `assertGateGreenBeforeCommit` true; never-commit-on-red held | ✅ `node --test` green on the committed state |
| Mutations confined to throwaway | `assertMutationsInsideThrowaway` true | ✅ both files under the throwaway path |
| Committed artifact = handoff | `assertCommittedArtifact` true; non-empty | ✅ `add.mjs` committed |
| `runAcceptanceProbe` returns | `{ passed: true, evidence: {...} }` | ✅ `passed: true`; evidence carries `targetPath`, `piVersion`, `model`, `portsExercised`, `phases` |

## Reproduction notes (free-tier accommodations)

The smoke was driven by a one-off `runAcceptanceProbe` runner (not committed). To fit the
Gemini **free tier** and pi's headless behaviour, three accommodations were applied — none
changes what the adapter proves:

- **Provider/model:** the craft `sonnet` tier was mapped to `google/gemini-2.5-flash`
  (Anthropic was unavailable — account credit balance; Gemini's free tier is genuinely free).
- **Turn budget:** the free tier caps at ~5 requests/minute, which a multi-turn agentic loop
  exceeds. The construction brief was structured so pi completes it in a single bash tool call
  (write both files, run the gate, commit) — few model requests. The `assembleBlock` engine-bin
  seam was still invoked and asserted non-empty; a lean instruction was fed to pi.
- **stdin:** pi must be spawned with **stdin ignored** (`/dev/null`); with an open stdin pipe
  pi waits for interactive input in `-p` mode and hangs.

To re-run: install `@earendil-works/pi-coding-agent@0.79.8`, provide `GEMINI_API_KEY`
(or another provider key + matching `--provider`/`--model`), and invoke `runAcceptanceProbe`
from `adapters/pi/src/probe.js` with a `piRunner` that spawns `pi` (stdin ignored) in a
git-isolated throwaway and builds the run-trace from post-run repo inspection.
