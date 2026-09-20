/**
 * Pure tuner core: report.json recommendations → a proposed manifest-knob patch.
 *
 * Maps the three signals that have a lint-clean manifest knob:
 *   model-routing → models.<role>            (role rides on the rec, emitted by the miner)
 *   phase-skip    → pipeline.skip            (repeated auto-skip across ≥ SKIP_MIN_RUNS runs)
 *   turn-budget   → phases.<id>.turn_budget  (canonical phase, no budget already declared)
 * Every other signal (cache-hotspot, review-waste, drift, recurring memory findings) —
 * plus a turn-budget rec that misses either turn-budget condition — is surfaced as an
 * advisory proposal (path null) that alters no frontmatter.
 *
 * No I/O, no clock, no random. Immutable: never mutates baseFrontmatter. Proposals
 * are sorted for byte-stable output.
 */

import { MODELS_KEYS, PHASE_NAMES } from './manifest-vocabulary.js';
import { TURN_BUDGET_BILLED_TURNS } from './observability/usage-aggregate.js';

export const SKIP_MIN_RUNS = 2;
export const MEMORY_CONFIDENCE_FLOOR = 0.7;

// ── model-routing → models.<role> ─────────────────────────────────────────────

function modelRoutingProposals(recs, base) {
  const byRole = new Map();
  for (const rec of recs) {
    // equivalent mutant (kind guard `!== 'model-routing'` → false): only model-routing
    // recs carry a top-level `role`, so a rec of any other kind falls out at `!role`
    // below — removing the guard produces no different proposal.
    if (rec.kind !== 'model-routing') continue;
    const role = rec.role;
    if (!role || !MODELS_KEYS.has(role)) continue;
    const to = rec.evidence?.candidateModel;
    const from = base.models?.[role] ?? null;
    if (!to || from === to) continue;
    // Past the `!to` guard `rec.evidence` is guaranteed present (its candidateModel was
    // truthy), so the remaining reads need no optional chaining. The `?? 0` fallbacks stay
    // for a hand-edited report that dropped the priced costs (kept: they guard against NaN).
    const savings = (rec.evidence.currentPricedCost ?? 0) - (rec.evidence.projectedPricedCost ?? 0);
    const prev = byRole.get(role);
    // equivalent mutant (`>=` → `>`): a tie keeps whichever rec was seen first, but tied
    // savings for one role yield an identical proposal either way (same candidate model).
    if (prev && prev.evidence.savings >= savings) continue;
    byRole.set(role, {
      source: 'model-routing',
      path: ['models', role],
      from,
      to,
      rationale: `route ${role} to ${to} for phase ${rec.phase} (saves ~${savings} priced)`,
      evidence: { phase: rec.phase, savings, currentModel: rec.evidence.currentModel, candidateModel: to },
    });
  }
  return [...byRole.values()];
}

// ── phase-skip → pipeline.skip ────────────────────────────────────────────────

function pipelineSkipProposals(recs, base) {
  const runsByPhase = new Map();
  for (const rec of recs) {
    if (rec.kind !== 'phase-skip') continue;
    if (!runsByPhase.has(rec.phase)) runsByPhase.set(rec.phase, new Set());
    runsByPhase.get(rec.phase).add(rec.run);
  }
  // equivalent mutant (ArrayDeclaration `[]` → non-empty): the fallback only supplies an
  // empty membership set when the base has no skip list — an injected extra element is a
  // phantom phase name that no real proposal ever tests against.
  const alreadySkipped = new Set(base.pipeline?.skip ?? []);
  const proposals = [];
  for (const [phase, runs] of runsByPhase) {
    if (runs.size < SKIP_MIN_RUNS) continue;
    if (!PHASE_NAMES.has(phase)) continue;
    if (alreadySkipped.has(phase)) continue;
    // A phase can not be both skipped and required — proposing it would fail lint.
    if (base.phases?.[phase]?.required === true) continue;
    proposals.push({
      source: 'phase-skip',
      path: ['pipeline', 'skip'],
      from: null,
      to: phase,
      rationale: `drop ${phase}: auto-skipped in ${runs.size} runs (evaluated unnecessary)`,
      evidence: { phase, runs: runs.size },
    });
  }
  return proposals;
}

// ── turn-budget → phases.<id>.turn_budget ─────────────────────────────────────

// Shared by turnBudgetProposals and recAdvisory below: the ONE predicate deciding
// whether a turn-budget rec earns a patch, so the two builders can never disagree and
// double-count a rec as both a patch and an advisory.
function turnBudgetPatchEligible(rec, base) {
  if (rec.kind !== 'turn-budget') return false;
  if (!PHASE_NAMES.has(rec.phase)) return false;
  return base.phases?.[rec.phase]?.turn_budget === undefined;
}

function turnBudgetProposals(recs, base) {
  const proposals = [];
  for (const rec of recs) {
    if (!turnBudgetPatchEligible(rec, base)) continue;
    const turns = rec.evidence?.billedTurns ?? '?';
    proposals.push({
      source: 'turn-budget',
      path: ['phases', rec.phase, 'turn_budget'],
      from: null,
      to: TURN_BUDGET_BILLED_TURNS,
      rationale: `budget ${TURN_BUDGET_BILLED_TURNS} tool calls for ${rec.phase}: ${rec.role} billed ${turns} turns (threshold ${TURN_BUDGET_BILLED_TURNS})`,
      evidence: rec.evidence,
    });
  }
  return proposals;
}

// ── advisories (no lint-clean knob) ───────────────────────────────────────────

function advisoryProposal(source, rationale, evidence) {
  return { source, path: null, from: null, to: null, rationale, evidence };
}

// cache-hotspot and review-waste have no lint-clean knob and always stay advisory.
// turn-budget is the exception: it stays advisory only when turnBudgetPatchEligible
// declines (non-canonical phase, or the manifest already declares a budget) — a rec
// that would earn a patch must not also surface here.
function recAdvisory(rec, base) {
  if (rec.kind === 'cache-hotspot') {
    return advisoryProposal('cache-hotspot',
      `phase ${rec.phase} carries high cache-creation — consider a manual checkpoint`, rec.evidence);
  }
  if (rec.kind === 'review-waste') {
    return advisoryProposal('review-waste',
      `${rec.evidence?.role ?? 'reviewer'} billed ${rec.evidence?.billedTurns ?? '?'} turns across review — consider a cheaper reviewer tier`, rec.evidence);
  }
  if (rec.kind === 'turn-budget') {
    if (turnBudgetPatchEligible(rec, base)) return null;
    return advisoryProposal('turn-budget',
      `${rec.role} billed ${rec.evidence?.billedTurns ?? '?'} turns in phase ${rec.phase} — consider narrowing scope or raising the budget`, rec.evidence);
  }
  return null;
}

function recAdvisories(recs, drift, base) {
  const driftAdvisories = drift.map(entry => advisoryProposal('drift',
    `phase ${entry.phase} drifted on ${entry.dimension} vs baseline — investigate the prompt`, entry));
  return [...recs.map(rec => recAdvisory(rec, base)).filter(Boolean), ...driftAdvisories];
}

function memoryAdvisories(memory) {
  // equivalent mutant (ArrayDeclaration `[]` → non-empty): the fallback fires only when the
  // store has no findings; an injected element lacks a `confidence`, so `?? 0` drops it below
  // the floor and no advisory is produced — unobservable.
  const findings = memory?.entries?.findings ?? [];
  return findings
    .filter(finding => (finding.confidence ?? 0) >= MEMORY_CONFIDENCE_FLOOR)
    .map(finding => advisoryProposal('memory',
      `recurring finding in ${finding.file}: ${finding.pattern} — consider a context rule`, finding));
}

// ── patch assembly ────────────────────────────────────────────────────────────

function applyPatch(base, autoProposals) {
  const patched = structuredClone(base);
  const skipAdds = [];
  for (const proposal of autoProposals) {
    if (proposal.source === 'model-routing') {
      patched.models = { ...(patched.models ?? {}), [proposal.path[1]]: proposal.to };
    } else if (proposal.source === 'phase-skip') {
      skipAdds.push(proposal.to);
    } else if (proposal.source === 'turn-budget') {
      const phase = proposal.path[1];
      const phaseBlock = { ...(patched.phases?.[phase] ?? {}), turn_budget: proposal.to };
      patched.phases = { ...(patched.phases ?? {}), [phase]: phaseBlock };
    }
  }
  if (skipAdds.length > 0) {
    const merged = [...new Set([...(patched.pipeline?.skip ?? []), ...skipAdds])].sort();
    patched.pipeline = { ...(patched.pipeline ?? {}), skip: merged };
  }
  return patched;
}

function sortProposals(proposals) {
  // equivalent mutants across the two key builders (`\x00` / `.` separators, and the
  // `path ?? []` / `to ?? ''` fallbacks): proposals are primarily ordered by `source`,
  // which is always a non-empty distinct string, so no separator or empty-fallback
  // substitution changes the relative order the comparator produces.
  return [...proposals].sort((a, b) => {
    const ka = `${a.source}\x00${(a.path ?? []).join('.')}\x00${a.to ?? ''}`;
    const kb = `${b.source}\x00${(b.path ?? []).join('.')}\x00${b.to ?? ''}`;
    return ka.localeCompare(kb);
  });
}

/**
 * @param {{ report: object, memory?: object|null, baseFrontmatter?: object }} input
 * @returns {{ proposals: object[], patchedFrontmatter: object }}
 */
export function planTune({ report, memory, baseFrontmatter = {} }) {
  // equivalent mutant (ArrayDeclaration `[]` → non-empty on these two fallbacks): a phantom
  // entry has no `kind`/`phase`/`dimension`, so every consumer skips it — unobservable. The
  // `?? []` itself is load-bearing (a missing key would otherwise throw on iteration).
  const recs = report.recommendations ?? [];
  const drift = report.drift ?? [];
  const autoProposals = [
    ...modelRoutingProposals(recs, baseFrontmatter),
    ...pipelineSkipProposals(recs, baseFrontmatter),
    ...turnBudgetProposals(recs, baseFrontmatter),
  ];
  const advisories = [
    ...recAdvisories(recs, drift, baseFrontmatter),
    ...memoryAdvisories(memory),
  ];
  const proposals = sortProposals([...autoProposals, ...advisories]);
  const patchedFrontmatter = applyPatch(baseFrontmatter, autoProposals);
  return { proposals, patchedFrontmatter };
}
