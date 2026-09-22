/**
 * Pure ledger→state derivation: replay one run's ledger lines into the shape
 * a rebuilding orchestrator needs after losing its working memory. No I/O, no
 * clock, no `process` — every input is a plain value.
 */

import { autoSkipPhasesInText } from './observability/skip-signals.js';

const LINE_RE = /^(\S+) (\S+) (.*)$/;
const PHASE_ID = '[a-z][a-z0-9-]*';
// Dimension and technique ids come from a manifest, which accepts any label a
// token can carry unambiguously: no parentheses, colon or whitespace.
const TOKEN_ID = '[^():\\s]+';

// equivalent mutant (trailing `$` dropped): this regex only ever runs against
// `record`, which is always LINE_RE's own third capture group — and LINE_RE's
// `(.*)$` can only match a line with no embedded newline (`.` never crosses
// one), so `record` is always newline-free here. A greedy `(.+)` on a
// newline-free string already extends to the string's true end on its own,
// making the trailing `$` redundant — unlike PART_RE's own trailing `$`,
// whose last group is a fixed `(pass|blocked)` alternation that does NOT
// self-extend, so dropping it there is observable.
const AWAITING_RE = /^AWAITING\(propose\): (.+)$/;
const PHASE_START_RE = new RegExp(`^PHASE-START\\((${PHASE_ID})\\): (\\S+)$`);
const PHASE_DONE_RE = new RegExp(`^PHASE-DONE\\((${PHASE_ID})\\): (.*)$`);
const PART_RE = /^PART\((\d+)\): ([0-9a-f]{7,40}) size=(\S+) outcome=(pass|blocked)$/;
const FINDINGS_RE = new RegExp(`^FINDINGS\\((${TOKEN_ID})\\): c(\\d+) (\\S+) n=(\\d+)$`);
const HARNESS_BG_RE = new RegExp(`^HARNESS-BG\\((${PHASE_ID}):(${TOKEN_ID})\\): pid=(\\d+) out=(\\S+) spec=(\\S+)$`);
const GATE_RE = new RegExp(`^GATE\\((${PHASE_ID})\\): (green|red)$`);
const NO_OP_RELEASE_RE = new RegExp(`^NO-OP\\((${PHASE_ID})\\):`);

/**
 * @param {string} line
 * @returns {{ runId: string, phase: string, record: string } | null}
 */
function parseRecord(line) {
  const match = LINE_RE.exec(line);
  if (!match) return null;
  const [, runId, phase, record] = match;
  return { runId, phase, record };
}

/**
 * @param {string[]} lines
 * @param {string} runId
 * @returns {{ runId: string, phase: string, record: string }[]}
 */
function recordsForRun(lines, runId) {
  return lines
    .map(parseRecord)
    .filter((entry) => entry !== null && entry.runId === runId);
}

/**
 * Last AWAITING(propose) line for the run, parsed into an id list (or null if absent).
 * @param {{ record: string }[]} records
 * @returns {string[] | null}
 */
function lastAwaiting(records) {
  let found = null;
  for (const { record } of records) {
    const match = AWAITING_RE.exec(record);
    if (match) found = match[1];
  }
  if (found === null) return null;
  const list = found.trim();
  if (list === 'none') return [];
  return list.split(',').map((id) => id.trim()).filter((id) => id !== '');
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Fold PHASE-START/PHASE-DONE/auto-skip markers into a per-phase timeline.
 * @param {{ phase: string, record: string }[]} records
 * @param {Set<string>} effectiveIds
 * @param {string[]} warnings
 * @returns {{ lastEvent: Map<string,string>, since: Map<string,string>, autoSkipped: Set<string> }}
 */
function foldTimeline(records, effectiveIds, warnings) {
  const timeline = { lastEvent: new Map(), since: new Map(), autoSkipped: new Set() };
  for (const { record } of records) {
    applyTimelineRecord(record, effectiveIds, warnings, timeline);
  }
  return timeline;
}

/**
 * Match one record against the timeline tokens and mutate `timeline` in place.
 * @param {string} record
 * @param {Set<string>} effectiveIds
 * @param {string[]} warnings
 * @param {{ lastEvent: Map<string,string>, since: Map<string,string>, autoSkipped: Set<string> }} timeline
 */
function applyTimelineRecord(record, effectiveIds, warnings, timeline) {
  const start = PHASE_START_RE.exec(record);
  if (start) {
    applyTimelineEvent(start[1], effectiveIds, warnings, () => {
      timeline.lastEvent.set(start[1], 'START');
      timeline.since.set(start[1], start[2]);
    });
    return;
  }
  const done = PHASE_DONE_RE.exec(record);
  if (done) {
    applyTimelineEvent(done[1], effectiveIds, warnings, () => timeline.lastEvent.set(done[1], 'DONE'));
    return;
  }
  for (const phase of autoSkipPhasesInText(record)) {
    applyTimelineEvent(phase, effectiveIds, warnings, () => timeline.autoSkipped.add(phase));
  }
}

/**
 * Apply a timeline update when the phase belongs to the effective pipeline,
 * otherwise record a warning and drop the event.
 * @param {string} phase
 * @param {Set<string>} effectiveIds
 * @param {string[]} warnings
 * @param {() => void} apply
 */
function applyTimelineEvent(phase, effectiveIds, warnings, apply) {
  if (!effectiveIds.has(phase)) {
    warnings.push(`phase ${phase} is not in the effective pipeline`);
    return;
  }
  apply();
}

/**
 * @param {readonly string[]} effectiveIds
 * @param {{ lastEvent: Map<string,string>, since: Map<string,string>, autoSkipped: Set<string> }} timeline
 * @returns {{ completed: string[], inFlight: {phase:string,since:string}[], next: string|null }}
 */
function projectTimeline(effectiveIds, { lastEvent, since, autoSkipped }) {
  const completed = [];
  const inFlight = [];

  for (const phase of effectiveIds) {
    const event = lastEvent.get(phase);
    if (event === 'START') {
      inFlight.push({ phase, since: since.get(phase) });
    } else if (event === 'DONE' || autoSkipped.has(phase)) {
      completed.push(phase);
    }
  }

  const placed = new Set([...completed, ...inFlight.map((entry) => entry.phase)]);
  const next = effectiveIds.find((phase) => !placed.has(phase)) ?? null;

  return { completed, inFlight, next };
}

/**
 * Released(id) ⇔ auto-skip: id ∨ exact NO-OP(id): ∨ the last GATE(id) is green.
 * @param {{ record: string }[]} records
 * @param {Set<string>} autoSkipped
 * @returns {Set<string>}
 */
function releasedPhases(records, autoSkipped) {
  const released = new Set(autoSkipped);
  const lastGate = new Map();

  for (const { record } of records) {
    const noOp = NO_OP_RELEASE_RE.exec(record);
    if (noOp) released.add(noOp[1]);
    const gate = GATE_RE.exec(record);
    if (gate) lastGate.set(gate[1], gate[2]);
  }
  for (const [phase, decision] of lastGate) {
    if (decision === 'green') released.add(phase);
  }

  return released;
}

/** @param {RegExpExecArray} match @returns {{ n: number, sha: string, size: string, outcome: string }} */
function buildPart(match) {
  const [, n, sha, size, outcome] = match;
  return { n: Number(n), sha, size, outcome };
}

/** @param {RegExpExecArray} match @returns {{ dimension: string, cycle: number, path: string, count: number }} */
function buildFinding(match) {
  const [, dimension, cycle, path, count] = match;
  return { dimension, cycle: Number(cycle), path, count: Number(count) };
}

/** @param {RegExpExecArray} match @returns {{ phase: string, technique: string, pid: number, out: string, spec: string }} */
function buildBackground(match) {
  const [, phase, technique, pid, out, spec] = match;
  return { phase, technique, pid: Number(pid), out, spec };
}

/** One row per record-collecting token: literal prefix, full-match regex, and its value builder. */
const COLLECTORS = [
  { name: 'PART', prefix: 'PART(', regex: PART_RE, build: buildPart },
  { name: 'FINDINGS', prefix: 'FINDINGS(', regex: FINDINGS_RE, build: buildFinding },
  { name: 'HARNESS-BG', prefix: 'HARNESS-BG(', regex: HARNESS_BG_RE, build: buildBackground },
];

/**
 * Keep the last part per `n`, sorted ascending.
 * @param {{ n: number }[]} parts
 * @returns {{ n: number }[]}
 */
function lastPartPerNumber(parts) {
  const byNumber = new Map(parts.map((part) => [part.n, part]));
  return [...byNumber.values()].sort((a, b) => a.n - b.n);
}

/**
 * Fold PART/FINDINGS/HARNESS-BG records into their collections, in ledger order.
 * @param {{ record: string }[]} records
 * @param {string[]} warnings
 * @returns {{ parts: object[], findings: object[], background: object[] }}
 */
function foldCollections(records, warnings) {
  const collected = { PART: [], FINDINGS: [], 'HARNESS-BG': [] };

  for (const { record } of records) {
    const collector = COLLECTORS.find((entry) => record.startsWith(entry.prefix));
    if (!collector) continue;
    const match = collector.regex.exec(record);
    if (!match) {
      warnings.push(`malformed ${collector.name} record: ${record}`);
      continue;
    }
    collected[collector.name].push(collector.build(match));
  }

  return {
    parts: lastPartPerNumber(collected.PART),
    findings: collected.FINDINGS,
    background: collected['HARNESS-BG'],
  };
}

/** Tokens folded outside COLLECTORS whose malformed shape must still surface as a warning. */
const PREFIX_CHECKS = [
  { name: 'AWAITING(propose)', prefix: 'AWAITING(', regex: AWAITING_RE },
  { name: 'PHASE-START', prefix: 'PHASE-START(', regex: PHASE_START_RE },
  { name: 'PHASE-DONE', prefix: 'PHASE-DONE(', regex: PHASE_DONE_RE },
];

/**
 * @param {{ record: string }[]} records
 * @param {string[]} warnings
 */
function checkMalformedPrefixes(records, warnings) {
  for (const { record } of records) {
    const check = PREFIX_CHECKS.find((entry) => record.startsWith(entry.prefix));
    if (check && !check.regex.test(record)) {
      warnings.push(`malformed ${check.name} record: ${record}`);
    }
  }
}

/**
 * Resolve gateDecisions[propose].awaitingHarnesses, defaulting to the empty set.
 * @param {{ gateDecisions?: {phaseId:string, awaitingHarnesses?: string[]}[] }} resolution
 * @returns {string[]}
 */
function resolvedAwaiting(resolution) {
  const propose = resolution.gateDecisions?.find((entry) => entry.phaseId === 'propose');
  return propose?.awaitingHarnesses ?? [];
}

/**
 * Set comparison between the ledger's recorded AWAITING(propose) ids and the
 * resolution's, per the mismatch rule (a `null` ledger side vs. a non-empty
 * resolved set counts too).
 * @param {string[] | null} ledgerAwaiting
 * @param {string[]} resolved
 * @returns {{ kind: 'awaiting-mismatch', ledger: string[]|null, resolution: string[] } | null}
 */
function checkAwaitingMismatch(ledgerAwaiting, resolved) {
  if (ledgerAwaiting === null) {
    return resolved.length > 0 ? { kind: 'awaiting-mismatch', ledger: null, resolution: resolved } : null;
  }
  return sameSet(ledgerAwaiting, resolved)
    ? null
    : { kind: 'awaiting-mismatch', ledger: ledgerAwaiting, resolution: resolved };
}

/**
 * @param {{ record: string }[]} records
 * @param {string} runId
 * @param {string[]} effectiveIds
 * @param {string[] | null} ledgerAwaiting
 * @param {string[]} warnings
 * @returns {object}
 */
function buildState(records, runId, effectiveIds, ledgerAwaiting, warnings) {
  checkMalformedPrefixes(records, warnings);
  const timeline = foldTimeline(records, new Set(effectiveIds), warnings);
  const { completed, inFlight, next } = projectTimeline(effectiveIds, timeline);
  const released = releasedPhases(records, timeline.autoSkipped);
  const awaitingHarnesses = (ledgerAwaiting ?? []).filter((id) => !released.has(id));

  return {
    run: runId,
    completed,
    inFlight,
    next,
    awaitingHarnesses,
    ...foldCollections(records, warnings),
    warnings,
  };
}

/**
 * @param {string[]} lines
 * @param {string} runId
 * @param {object} resolution
 * @returns {{ kind: 'state', state: object } | { kind: 'awaiting-mismatch', ledger: string[]|null, resolution: string[] }}
 */
export function deriveRunState(lines, runId, resolution) {
  const records = recordsForRun(lines, runId);
  const effectiveIds = resolution.effective.map((entry) => entry.id);
  const ledgerAwaiting = lastAwaiting(records);
  const resolved = resolvedAwaiting(resolution);

  const mismatch = checkAwaitingMismatch(ledgerAwaiting, resolved);
  if (mismatch) return mismatch;

  const warnings = ledgerAwaiting === null ? [`no AWAITING(propose) line for run ${runId}`] : [];
  return { kind: 'state', state: buildState(records, runId, effectiveIds, ledgerAwaiting, warnings) };
}
