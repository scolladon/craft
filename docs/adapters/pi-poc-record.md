# Pi PoC — on-demand smoke evidence record

> The deterministic adapter seams (Execution arg-shaper, Gate predicate, probe
> structural assertions) are CI-proven by 34 unit tests in `adapters/pi/test/`
> (slices 4–6). This document records the on-demand **runtime** smoke — a live Pi
> run through the acceptance-probe harness exercising all four ports against a
> real Pi session in a throwaway repo. It is refreshed by re-running the probe.

> **Not CI-gated.** The live Pi run is on-demand only. The entry point is
> `runAcceptanceProbe` exported from `adapters/pi/src/probe.js`; it requires an
> injected `piRunner` that shells out to a real `pi` binary. See the on-demand
> command below.

## Verdict: **PENDING**

The live smoke has not run yet. The `pi` binary (`@earendil-works/pi-coding-agent`)
could not be installed in the implementation environment at the time slices 4–7
were authored. The deterministic adapter and its 34 CI unit tests are the landed
proof of the seams; this record captures the runtime-fidelity smoke as a
documented follow-up.

## Target repo

| Attribute | Value |
|---|---|
| Project | throwaway `mktemp -d` repo + tiny free-text construction brief |
| Pi version | `0.79.8` (pinned: `@earendil-works/pi-coding-agent@0.79.8`) |
| Phase exercised | `implementation` (construction archetype) |
| Model tier | `sonnet` (descriptor `model: sonnet`; mapped to Pi provider+model by adapter) |
| Workflow manifest | none — engine `pipeline-resolve` drives the walk |
| Remote | none (throwaway, local-only) |

## Ports exercised

| Port | Mechanism | Expected outcome |
|---|---|---|
| Execution | `runPhase` → `execFile('pi', ['-\-mode','json','-p', prompt])` (subprocess, argv-array, no shell) | Pi runs the construction phase under the injected block; JSONL stream parsed for `usage` + `finalMessage` |
| Model | `implementation` descriptor `model: sonnet` → adapter maps craft tier to Pi provider+model via `modelRegistry` / `createAgentSession` | Pi session bound to the resolved model; `sonnet`-tier model runs the phase |
| Gate | `toolCallGuard` armed on every `tool_call` event; engine-owned gate command run as subprocess wrapper before commit | `git diff` without `--no-ext-diff` vetoed (`{ block: true }`); gate exits 0 before the commit (never-commit-on-red held) |
| VCS | throwaway isolated via `git init`; Pi's mutations confined to the throwaway path; committed artifact = the handoff | Mutations stay inside the throwaway; a commit exists with the artifact; worktree untouched |

## Per-phase outcome (to be filled on live run)

| Step | Expected | Actual |
|---|---|---|
| RED → GREEN → commit landed | One construction-phase slice committed inside throwaway | PENDING |
| Gate green before commit | `assertGateGreenBeforeCommit` returns true; never-commit-on-red held | PENDING |
| Mutations confined to throwaway | `assertMutationsInsideThrowaway` returns true | PENDING |
| Committed artifact = handoff | `assertCommittedArtifact` returns true; artifact is a non-empty string | PENDING |
| `runAcceptanceProbe` returns | `{ passed: true, evidence: { targetPath, piVersion, model, portsExercised, phases } }` | PENDING |

## On-demand command

Install the pinned Pi runtime, then drive the probe with a real `piRunner`:

```js
// run-smoke.mjs  (one-off runner — create in the repo root, not committed)
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runAcceptanceProbe } from './adapters/pi/src/probe.js';

const execFileAsync = promisify(nodeExecFile);

async function piRunner({ phaseId, modelTier, workingDir }) {
  // Minimal live piRunner: shells out to `pi --mode json -p <prompt>`.
  // Extend with createAgentSession / modelRegistry for the richer SDK path.
  const prompt = `phase: ${phaseId}\nmodel: ${modelTier}\ncwd: ${workingDir}\n\nImplement a trivial Hello-World construction slice.`;
  const { stdout } = await execFileAsync('pi', ['--mode', 'json', '-p', prompt], {
    encoding: 'utf8',
    cwd: workingDir,
  });
  // Parse the JSONL trace into the shape runAcceptanceProbe expects.
  // Adapt fields (piVersion, model, mutatedPaths, gateOutcome, gateRanBeforeCommit,
  // committedArtifact, phases) from the real Pi event stream.
  return JSON.parse(stdout.trim().split('\n').at(-1));
}

const fsOps = {
  mktemp: () => mkdtemp(`${tmpdir()}/pi-smoke-`),
};

const result = await runAcceptanceProbe({ piRunner, fsOps });
console.log(JSON.stringify(result, null, 2));
```

```sh
# 1. Install the pinned Pi runtime
npm install -g @earendil-works/pi-coding-agent@0.79.8
# or: npx @earendil-works/pi-coding-agent@0.79.8 --help  (confirm version)

# 2. From the repo root, run the one-off runner above:
node run-smoke.mjs

# 3. Transcribe the real per-port/per-phase outcome into this document.
#    Replace all PENDING cells with the actual results and update Verdict to PASS or FAIL.
```

The entry surface is **only** the exported function `runAcceptanceProbe({ piRunner, fsOps })`
from `adapters/pi/src/probe.js`. There is no pre-built runner script under `adapters/pi/`
— the one-off `run-smoke.mjs` above is the canonical invocation pattern, created
on-demand and not committed.
