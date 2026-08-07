/**
 * Pure tuner core: report.json recommendations → a proposed manifest-knob patch.
 *
 * Maps the two signals that have a lint-clean manifest knob:
 *   model-routing → models.<role>   (role rides on the rec, emitted by the miner)
 *   phase-skip     → pipeline.skip   (repeated auto-skip across ≥ SKIP_MIN_RUNS runs)
 * Every other signal (cache-hotspot, review-waste, drift, recurring memory findings)
 * is surfaced as an advisory proposal (path null) that alters no frontmatter — no
 * manifest knob exists for it.
 *
 * No I/O, no clock, no random. Immutable: never mutates baseFrontmatter. Proposals
 * are sorted for byte-stable output.
 */

import { MODELS_KEYS, PHASE_NAMES } from './manifest-vocabulary.js';

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

// ── advisories (no lint-clean knob) ───────────────────────────────────────────

function advisoryProposal(source, rationale, evidence) {
  return { source, path: null, from: null, to: null, rationale, evidence };
}

function recAdvisories(recs, drift) {
  const out = [];
  for (const rec of recs) {
    if (rec.kind === 'cache-hotspot') {
      out.push(advisoryProposal('cache-hotspot',
        `phase ${rec.phase} carries high cache-creation — consider a manual checkpoint`, rec.evidence));
    } else if (rec.kind === 'review-waste') {
      out.push(advisoryProposal('review-waste',
        `${rec.evidence?.role ?? 'reviewer'} billed ${rec.evidence?.billedTurns ?? '?'} turns across review — consider a cheaper reviewer tier`, rec.evidence));
    }
  }
  for (const entry of drift) {
    out.push(advisoryProposal('drift',
      `phase ${entry.phase} drifted on ${entry.dimension} vs baseline — investigate the prompt`, entry));
  }
  return out;
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
    // equivalent mutant (`=== 'phase-skip'` → true): applyPatch only ever receives the two
    // auto-patch sources (model-routing handled above), so the else branch already only sees
    // phase-skip proposals.
    } else if (proposal.source === 'phase-skip') {
      skipAdds.push(proposal.to);
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
  ];
  const advisories = [
    ...recAdvisories(recs, drift),
    ...memoryAdvisories(memory),
  ];
  const proposals = sortProposals([...autoProposals, ...advisories]);
  const patchedFrontmatter = applyPatch(baseFrontmatter, autoProposals);
  return { proposals, patchedFrontmatter };
}
