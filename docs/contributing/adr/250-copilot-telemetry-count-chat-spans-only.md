# 250 — Copilot telemetry counts `chat` spans only

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Refines ADR-245

## Context

Copilot's OTel file exporter emits a **mixed** stream: OTLP **span** records (carrying `kind` and `instrumentationScope: { name: "github.copilot" }`) *and* **metric** records (carrying neither). Within the spans, the probe found the same token counts represented at three tiers:

- `chat <model>` — one span per LLM call, the leaf, carrying `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`.
- `invoke_agent` — carries the **same attribute names** but with **rolled-up sums** of its child `chat` spans (live-observed: `2468 = 2 × 1234`, `112 = 2 × 56`).
- `gen_ai.client.token.usage` — a metric record repeating the same totals again.

A parser that ingests every token-bearing record therefore inflates reported cost roughly **3×**.

## Options considered

1. **Count `chat` spans only** *(designer recommendation)* — pros: leaves sum correctly at any fan-out depth; preserves per-model attribution. Cons: requires discriminating spans from metrics structurally.
2. **Count `invoke_agent` roll-up spans only** — cons: correct only when every call has exactly one agent level; breaks under nested `task` fan-out, which Copilot supports (ADR-244).
3. **Count the `gen_ai.client.token.usage` metric** — cons: discards per-model attribution, which `aggregate` needs for cost.

## Decision

*Adopted as recommended (no user judgment).* Option 1. The Copilot `collect` binding ingests **only** span records where `instrumentationScope.name === 'github.copilot'` **and** `kind` is present, **and** `gen_ai.operation.name === 'chat'`. `invoke_agent` spans are used for attribution only (D7), never for token math; `execute_tool` spans and **all** metric records are ignored.

Discrimination is **structural** (`kind` / `instrumentationScope`), never by `name` alone, because metric records reuse familiar names without the span envelope.

## Consequences

- A no-double-count test is mandatory: a fixture holding 2 `chat` spans, their `invoke_agent` roll-up, and the `gen_ai.client.token.usage` metric must total the **2 leaves**, not 3×.
- Token math stays correct under nested subagent fan-out.
- If Copilot ever stops emitting leaf `chat` spans, this decision reopens; the roll-up tier would then be the only source.
