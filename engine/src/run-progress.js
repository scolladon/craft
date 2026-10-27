/**
 * Pure ledger→progress projection: one run's ledger lines become the ordered
 * item list a progress display renders. No I/O, no clock, no `process`.
 */

import { autoSkipPhasesInText } from './observability/skip-signals.js';
import {
  PHASE_ID, PHASE_START_RE, PHASE_DONE_RE, NO_OP_RELEASE_RE, recordsForRun, lastAwaiting, deriveRunState,
} from './run-state.js';

const EFFECTIVE_PREFIX = 'EFFECTIVE:';
const EFFECTIVE_RE = new RegExp(`^EFFECTIVE: (${PHASE_ID}(?:,${PHASE_ID})*)$`);
const ID_SEPARATOR = ',';
const SOURCE_EFFECTIVE = 'effective';
const SOURCE_LEDGER_ONLY = 'ledger-only';
const STATUS_PENDING = 'pending';
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_COMPLETED = 'completed';
const NOTE_MAX_CHARS = 120;
const AUTO_SKIP_FALLBACK_NOTE = 'auto-skipped';
const AUTO_SKIP_SIGNAL_RE = /\(([^()]*)\)\s*$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu;
const IMPLEMENTATION = 'implementation';
const REVIEW = 'review';

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
  // equivalent mutant (always exec): exec(undefined) coerces to "undefined", which never matches the EFFECTIVE grammar
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

function sanitizeNote(text) {
  return [...text.replace(CONTROL_CHARS_RE, '')].slice(0, NOTE_MAX_CHARS).join('');
}

function lastNoteFrom(records, noteOf) {
  return records.map(noteOf).filter((note) => note !== null).at(-1) ?? null;
}

function noOpNote(records, id) {
  return lastNoteFrom(records, ({ record }) => {
    const match = NO_OP_RELEASE_RE.exec(record);
    return match?.[1] === id ? record.slice(match[0].length).trim() : null;
  });
}

function autoSkipNote(records, id) {
  return lastNoteFrom(records, ({ record }) => {
    if (!autoSkipPhasesInText(record).includes(id)) return null;
    return AUTO_SKIP_SIGNAL_RE.exec(record)?.[1] ?? AUTO_SKIP_FALLBACK_NOTE;
  });
}

function doneNote(records, id) {
  return lastNoteFrom(records, ({ record }) => {
    const match = PHASE_DONE_RE.exec(record);
    return match?.[1] === id ? match[2] : null;
  });
}

function phaseNote(records, id, status) {
  if (status !== STATUS_COMPLETED) return '';
  // equivalent mutant (fallback literal): a completed phase always has a PHASE-DONE or auto-skip record, so doneNote never yields null here
  const note = noOpNote(records, id) ?? autoSkipNote(records, id) ?? doneNote(records, id) ?? '';
  return sanitizeNote(note);
}

function partChildren(state) {
  return state.parts.map(({ n, outcome, sha }) => {
    const passed = outcome === 'pass';
    return {
      label: `part ${n}`,
      status: passed ? STATUS_COMPLETED : STATUS_IN_PROGRESS,
      note: sanitizeNote(passed ? sha : 'blocked'),
    };
  });
}

function cycleChildren(state, reviewStatus) {
  const countByCycle = new Map();
  for (const { cycle, count } of state.findings) {
    countByCycle.set(cycle, (countByCycle.get(cycle) ?? 0) + count);
  }
  const cycles = [...countByCycle.keys()].sort((a, b) => a - b);
  const newest = cycles.at(-1);
  return cycles.map((cycle) => ({
    label: `cycle ${cycle}`,
    status: cycle === newest && reviewStatus === STATUS_IN_PROGRESS ? STATUS_IN_PROGRESS : STATUS_COMPLETED,
    note: `n=${countByCycle.get(cycle)}`,
  }));
}

function childrenOf(id, state, status) {
  if (id === IMPLEMENTATION) return partChildren(state);
  if (id === REVIEW) return cycleChildren(state, status);
  return [];
}

function itemOf(id, records, state) {
  const status = statusOf(id, state);
  return { id, status, note: phaseNote(records, id, status), children: childrenOf(id, state, status) };
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
    items: ids.map((id) => itemOf(id, records, state)),
    inFlight: state.inFlight.map((entry) => entry.phase),
    next: state.next,
    background: runningBackground(state),
    warnings: [...warnings, ...state.warnings],
  };
}
