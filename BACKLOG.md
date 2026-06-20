# Craft — Backlog & Roadmap

> Craft is a Claude Code feature-delivery workflow engine, re-architected from a fixed
> 11-phase pipeline into a **customizable, hexagonal engine**: composable phases (skip /
> insert / reorder), strong zero-config defaults, a small invariant core, per-port
> customization.

> SoT — *intent:* `docs/PRD-customizable-engine.md` · *architecture:* `docs/DESIGN-customizable-engine.md`
> · *decisions:* `docs/adr/` · *build scripts:* `docs/PLAN-*.md` · *spikes:* `docs/SPIKE.md`

## Status — PRD program complete (P0–P16 ✅)

Every PRD goal (G1–G14) and success criterion (SC1–SC9) is discharged. **G13 met
2026-06-20** — a non-Claude provider (Gemini, via the Pi adapter) ran a construction phase
end-to-end (`docs/adapters/pi-poc-record.md`). The PRD defines **no P17**: §17 ends at P16,
itself tagged *"(next program)"*; anything beyond is un-PRD'd backlog (see *Candidate phases*).

| Phase | What | ADRs |
|---|---|---|
| P0 | Spikes SP1–SP8 — feasibility decisions | — |
| P1 | Characterization net + Node engine core + scenario goldens | — |
| P2 | `manifest-lint` hardened (later folded into Node core) | — |
| P3 | Rewire live walk + fold manifest validation into Node core | 009–012 |
| P4 | Generic vocabulary (concern-named phases + alias map) | 013–014 |
| P5 | Engine-owned contract injection + DESIGN split | 015–019 |
| P6 | Execution topology — `inline\|agent` + `solo`/`full`/`lean` + per-invocation args | 020–023 |
| P7 | Pipeline editing — skip / insert / reorder + verbatim-procedure dispatch (SC3) | 024–027 |
| P8 | Per-phase harness config (deep-merged knobs) | 028–031 |
| P8.5 | Rename **forge→craft** + namespace propagation | 032–036 |
| P9 | Agent/skill swap via manifest (contract injected around the swap; S2) | 037–040 |
| P9.5 | Hardening batch — live role probe, nested-lockfile, ci glob, full-engine mutation baseline (80%) | 041–047 |
| P10 | New default phases — optional `requirements` + `architecture` harness (default-off; S4/S5) | 048–053 |
| P11 | Backlog SoT abstraction — `{ file, custom }` two-source port (S6) | 054–060 |
| P12 | DX — `GUIDE-customizing.md` + injection catalog + lint-clean `examples/` | 061–064 |
| P13 | NFR hardening — bin mutation coverage + model-class matrix | 065–068 |
| P13.5 | Ban-enforcement boundary — free `--no-verify` (consumer discretion) | 083 |
| P14 | Derived-plugin extension surface (`extends:`; S7/G8) | 069–075 |
| P15 | Second-instantiation — non-tsgit Python/pytest repo, zero-manifest (SC5/G9) | 076–082 |
| P16 | Provider-agnostic — six port seams + Pi adapter PoC; **G13 met** | 084–092 |

Per-slice history lives in `git log`, `docs/{DESIGN,PLAN}-P*.md`, and `docs/adr/` — not here.

**Standing invariants (the working contract):**
- **Data is the SoT, not prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
- Every phase is **dogfoodable** — runnable through `/craft:run` itself.
- Working style: sliced TDD, one slice per dedicated agent (or session-direct for judgment-fused
  sweeps); 4-dimension review interleaved, every fix applied before the next; **CI green at every
  commit; `--no-verify` is the consumer's discretion, the craft gate is not.**

---

## Candidate phases (un-PRD'd — promoted from parked)

Beyond the PRD program. Real features, scoped but unscheduled — each is a coherent `/craft:run`.

### P17 — Pi adapter productization (PRD N4: multi-provider parity)

The P16 PoC proved G13; productizing it is the PRD's own non-goal N4 ("the architecture + a
PoC, not every adapter"). Two pieces, both `adapters/pi/`:

- **`craft-pi` user entrypoint** (ADR-086 chose a *separate* entrypoint). P16 landed only the
  adapter library + on-demand smoke; wire the actual user-facing bin. Touches: `adapters/pi/`.
- **Live `tool_call` wrapper.** `adapters/pi/src/gate.js` ships the pure `toolCallGuard`
  predicate only; the live `pi.on("tool_call", …)` wrapper is unwritten. It MUST (a) wrap the
  guard in try/catch and return `{ block: true }` on any throw (fail-safe), and (b)
  `realpath`/`lstat` the resolved parent before permitting a write (defeat symlink escapes the
  lexical check can't catch). Both review-flagged as wrapper-level, not predicate-level.
- **Constraint (not a task):** the git-invocation guard is bypassable by compound commands /
  qualified binaries / env-prefixes — **identically** in `hooks/git-no-ext-diff.sh` (Claude) and
  `adapters/pi/src/gate.js` (Pi), deliberately (parity; 19 mutation survivors accepted-by-parity).
  Any tightening lands in **both** together, never Pi-only. Guards output-mangling, not security.

### P18 — Walk / parallelism enforcement

Three harness knobs validate + reach the descriptor but are honored by walk-judgment, not the
engine. This phase makes them engine-enforced (documented today in `skills/review/SKILL.md` as
no-silent-cap parked items):

- **`passes > 1` multi-reviewer fan-out** — N-reviewers-per-dimension parallelism is currently a
  session-honored constraint, not an engine invariant.
- **Numeric `convergence: <n>` stopping** — the validator accepts a finite threshold; the exact
  stop rule (finding-count vs severity-weighted) is left to the review walk.
- **Per-invocation `--harness` CLI flag** (ADR-064, re-parked) — rides the same pass; its
  precondition is the two knobs above being engine-enforced. Writes nested
  `phases.<id>.harness.<knob>` (dotted-path parse + type coercion, beyond the flat profile/skip
  overlay). Follows the `cli-overlay.js` pattern.

---

## Parked

### Condition-gated (do when the trigger fires)

- **Migrate the `bats` suite to `node --test`** (user-requested, portability) — **evaluate first.**
  Worktree/hook scripts need real-process assertions (likely `node:test` + `child_process`); judge
  whether a JS port keeps shell-behavior fidelity before committing to the migration.
- **Extract an `extends-validation` module** (P14 refactor no-op) — pull the shared `checkFileRef`
  leaf + `validateExtends*` cluster out of `manifest.js` when validation grows further. Deferred
  because the cluster shares `checkFileRef` with the scripts/backlog/phases validators (needs the
  shared leaf first) and `manifest.js` is still under the 800-line max.
- **`backlog-lint` / `design-lint` structure lints** — the optional enforcing half of ADR-014
  (the `templates/backlog.md` template shipped at P4; the structure lint + bats fixtures did not).
- **Built-in per-tracker backlog adapter** (e.g. first-class `github-issues`) — rides the P14
  derived-plugin surface (a plugin shipping a backlog adapter); the repo-`custom`-script escape
  hatch (P11) already covers the tracker case today.

### Closed — won't-do (rationale recorded)

- **DC-9 registered-phase model seed** — *resolved by design, not implemented.* The walk
  model-resolution chain (`models.<role>` → `descriptor.model` → `models.fallback` → engine
  default `sonnet`) already resolves a model-less registered phase via fallback. Seeding a fixed
  `model` into `foldRegisteredPhases` would shadow `models.fallback` (a flexibility **regression**);
  inheriting the replaced default's tier violates ADR-073 (full-replace = no field inheritance).
  A registered phase that wants a tier sets it in its own descriptor or via `models.<role>`.
- **P13.5 broader scope (ban-split across every rule)** — the headline `--no-verify` question is
  resolved (P13.5/ADR-083). The remaining bans (`git-no-ext-diff` difftastic safety; contract
  provenance / suppression / swallowed-error bans) are *correctly* engine invariants; splitting
  adapter-mechanism from engine-invariant for them is unwarranted unless a consumer needs it.
- **Live `gh`/`jira` round-trip E2E** for the custom backlog recipes — a real `gh issue close` /
  Jira transition mutates a tracker and needs credentials CI lacks. The recipes are pinned
  empirically (read-only probes) + prose; a gated opt-in test is the home if ever wanted.
- **`backlog.id-pattern` manifest knob** (machine-enforced `file` id-form) — ADR-060: `file`
  id-form stays orchestrator prose-judgment until a repo actually needs the machine check. YAGNI.
