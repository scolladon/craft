/**
 * Pure ledger→progress projection: one run's ledger lines become the ordered
 * item list a progress display renders. No I/O, no clock, no `process`.
 */

import { autoSkipPhasesInText } from './observability/skip-signals.js';
import {
  PHASE_ID, PHASE_START_RE, PHASE_DONE_RE, recordsForRun, lastAwaiting, deriveRunState,
} from './run-state.js';

const EFFECTIVE_PREFIX = 'EFFECTIVE:';
const EFFECTIVE_RE = new RegExp(`^EFFECTIVE: (${PHASE_ID}(?:,${PHASE_ID})*)$`);
const ID_SEPARATOR = ',';
const SOURCE_EFFECTIVE = 'effective';
const SOURCE_LEDGER_ONLY = 'ledger-only';
const STATUS_PENDING = 'pending';
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_COMPLETED = 'completed';

/**
 * @typedef {object} ProgressView
 * @property {string} run
 * @property {'effective' | 'ledger-only'} source
 * @property {{ id: string, status: 'pending'|'in_progress'|'completed', note: string,
 *   children: { label: string, status: string, note: string }[] }[]} items
 * @property {string[]} inFlight
 * @property {string | null} next
 * @property {{ phase: string, pid: number }[]} background
 * @property {string[]} warnings
 */

function namedPhases(record) {
  const named = [PHASE_START_RE, PHASE_DONE_RE].map((re) => re.exec(record)?.[1]);
  return [...named.filter(Boolean), ...autoSkipPhasesInText(record)];
}

function ledgerOnlyIds(records) {
  return [...new Set(records.flatMap((entry) => namedPhases(entry.record)))];
}

function resolveIds(records) {
  const effective = records.map((entry) => entry.record).filter((record) => record.startsWith(EFFECTIVE_PREFIX));
  const last = effective.at(-1);
  const match = last === undefined ? null : EFFECTIVE_RE.exec(last);
  if (match) return { ids: match[1].split(ID_SEPARATOR), source: SOURCE_EFFECTIVE, warnings: [] };
  const warnings = last === undefined ? [] : [`malformed EFFECTIVE record: ${last}`];
  return { ids: ledgerOnlyIds(records), source: SOURCE_LEDGER_ONLY, warnings };
}

function statusOf(id, state) {
  if (state.inFlight.some((entry) => entry.phase === id)) return STATUS_IN_PROGRESS;
  return state.completed.includes(id) ? STATUS_COMPLETED : STATUS_PENDING;
}

function runningBackground(state) {
  const inFlight = new Set(state.inFlight.map((entry) => entry.phase));
  return state.background
    .filter((entry) => inFlight.has(entry.phase))
    .map(({ phase, pid }) => ({ phase, pid }));
}

/**
 * @param {string[]} lines
 * @param {string} runId
 * @returns {ProgressView}
 */
export function projectProgress(lines, runId) {
  const records = recordsForRun(lines, runId);
  const { ids, source, warnings } = resolveIds(records);
  const resolution = {
    effective: ids.map((id) => ({ id })),
    gateDecisions: [{ phaseId: 'propose', awaitingHarnesses: lastAwaiting(records) ?? [] }],
  };
  const { state } = deriveRunState(lines, runId, resolution);
  return {
    run: runId,
    source,
    items: ids.map((id) => ({ id, status: statusOf(id, state), note: '', children: [] })),
    inFlight: state.inFlight.map((entry) => entry.phase),
    next: state.next,
    background: runningBackground(state),
    warnings: [...warnings, ...state.warnings],
  };
}
