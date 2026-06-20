# 090 — Pi execution bound via a headless CLI subprocess (pi -p / --mode json)

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
The Execution port's `spawn`/`runInline` must bind onto Pi. Pi offers an SDK
(`createAgentSession`/`session.prompt`), a print mode (`pi -p`), a JSONL event stream
(`--mode json`), and an RPC mode (`--mode rpc`). The PoC needs the smallest binding with obvious
failure modes.

## Options
1. **Headless CLI subprocess (`pi -p` / `--mode json`)** — pros: smallest, language-agnostic, mirrors the backlog `custom` subprocess seam, exit code = blocker, `--mode json` yields the usage block / cons: coarser than an embedded session. *(designer's recommendation, chosen)*
2. **SDK embed (`createAgentSession`/`session.prompt`)** — pros: richer control, in-process events / cons: Node-in-Node embedding, more surface for a PoC.
3. **RPC mode (`--mode rpc`)** — pros: structured bidirectional / cons: strict LF-framing protocol work, overkill for one-shot phase runs.

## Decision
The Pi adapter binds Execution via a **headless CLI subprocess** (`pi -p`, `--mode json` for the
event/usage stream). The SDK embed is documented in `execution.md` as the richer alternative
binding but not used by the PoC.

## Consequences
- Each craft phase = one Pi subprocess run; the committed artifact is the handoff between runs.
- A non-zero exit is a blocker (matches the repo's subprocess-gate idioms).
- The usage block for the run record comes from the `--mode json` stream.
