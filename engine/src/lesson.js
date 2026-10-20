/**
 * Lesson file parser — the shared primitive of `consult` and `lesson-lint`.
 * Pure — no I/O. Never throws: every form error is collected and returned.
 */

import { load } from 'js-yaml';
import { extractFrontmatter } from './frontmatter.js';
import { isNonEmptyString } from './cli-io.js';
import { PHASE_NAMES } from './manifest-vocabulary.js';

export const LESSON_KINDS = Object.freeze(new Set(['trap', 'technique', 'gotcha', 'anti-pattern']));
export const LESSON_STATUSES = Object.freeze(new Set(['active', 'superseded', 'retired']));
export const LESSON_SECTIONS = Object.freeze(['Context', 'Lesson', 'How to apply', 'Evidence']);
export const MAX_HOW_TO_APPLY_LINES = 6;
export const MAX_LESSON_LINE_CHARS = 160;
export const MAX_TRIGGER_CHARS = 200;
export const MAX_TITLE_CHARS = 120;

const HOW_TO_APPLY = 'How to apply';
const FENCE = '---';
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = 10;
const EVIDENCE_ENTRY = /^([^\s:]+)(?::\d+(?:-\d+)?)?$/;
const SHA_SHAPED = /^[0-9a-f]{7,40}$/;
const H1 = /^# (\d{3,}) — (.+)$/;
const H2 = /^## (.+)$/;
const CODE_FENCE = /^\s*(```|~~~)/;
const GLOB_CHARACTER = /[*?[\]{}]/;

const NOT_A_MAPPING = 'frontmatter must be a mapping';
const MISSING_FRONTMATTER = 'missing frontmatter';
const MISSING_H1 = 'body must open with an H1 "# NNN — title" (H1 number of 3 digits or more)';
const WRONG_SECTIONS = `sections must be exactly, in order: ${LESSON_SECTIONS.join(', ')}`;

const isMapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyList = value => Array.isArray(value) && value.length > 0;

export function evidencePath(entry) {
  return entry.replace(/:\d+(?:-\d+)?$/, '');
}

function normalizeDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, ISO_DATE_LENGTH);
  if (typeof value === 'string' && ISO_DATE.test(value)) return value;
  return null;
}

function checkSubjects(subjects) {
  const valid = isNonEmptyList(subjects) && subjects.every(isNonEmptyString);
  return valid ? [] : ['subjects must be a non-empty list of non-empty strings'];
}

function checkPhases(phases) {
  if (!isNonEmptyList(phases)) return ['phases must be a non-empty list'];
  return phases.filter(id => !PHASE_NAMES.has(id)).map(id => `unknown phase: ${id}`);
}

function checkEnum(key, value, allowed) {
  return allowed.has(value) ? [] : [`${key} must be one of: ${[...allowed].join(', ')}`];
}

function checkTrigger(trigger) {
  const valid = isNonEmptyString(trigger) && !/[\r\n]/.test(trigger);
  if (!valid) return ['trigger must be a non-empty single-line string'];
  return trigger.length > MAX_TRIGGER_CHARS ? [`trigger exceeds ${MAX_TRIGGER_CHARS} characters`] : [];
}

function isRepoPath(entry) {
  if (typeof entry !== 'string') return false;
  const match = EVIDENCE_ENTRY.exec(entry);
  if (!match) return false;
  const path = match[1];
  if (/^[/~]/.test(path) || path.includes('$') || GLOB_CHARACTER.test(path) || SHA_SHAPED.test(path)) return false;
  return !path.split('/').includes('..');
}

function checkEvidence(evidence) {
  if (!isNonEmptyList(evidence)) return ['evidence must be a non-empty list'];
  return evidence.filter(entry => !isRepoPath(entry)).map(entry => `evidence entry is not a repo path: ${entry}`);
}

function checkSource(source) {
  if (!isMapping(source)) return ['source must be a mapping'];
  const errors = [];
  // equivalent mutant (`''` fallback -> any non-kebab string): KEBAB rejects '' and every non-kebab sentinel alike
  if (!KEBAB.test(source.run ?? '')) errors.push('source.run must be a kebab-case run name');
  if (!PHASE_NAMES.has(source.phase)) errors.push('source.phase must be a known phase');
  if (normalizeDate(source.date) === null) errors.push('source.date must be a date (YYYY-MM-DD)');
  return errors;
}

function checkLastVerified(lastVerified, sourceDate) {
  const verified = normalizeDate(lastVerified);
  if (verified === null) return ['last-verified must be a date (YYYY-MM-DD)'];
  // equivalent mutant (`sourceDate !== null &&` -> true): `verified < null` compares a date string with 0, which is NaN-false
  if (sourceDate !== null && verified < sourceDate) return ['last-verified must not be earlier than source.date'];
  return [];
}

function checkSupersedes(supersedes) {
  const valid = Array.isArray(supersedes) && supersedes.every(n => Number.isInteger(n) && n >= 1);
  return valid ? [] : ['supersedes must be a list of integers >= 1'];
}

function checkFrontmatter(fm) {
  const sourceDate = isMapping(fm.source) ? normalizeDate(fm.source.date) : null;
  return [
    ...checkSubjects(fm.subjects),
    ...checkPhases(fm.phases),
    ...checkEnum('kind', fm.kind, LESSON_KINDS),
    ...checkEnum('status', fm.status, LESSON_STATUSES),
    ...checkTrigger(fm.trigger),
    ...checkEvidence(fm.evidence),
    ...checkSource(fm.source),
    ...checkLastVerified(fm['last-verified'], sourceDate),
    ...checkSupersedes(fm.supersedes ?? []),
  ];
}

function readFrontmatter(content) {
  const block = extractFrontmatter(content);
  if (block === null) return { errors: [MISSING_FRONTMATTER] };
  let parsed;
  try {
    parsed = load(block);
  } catch (e) {
    return { errors: [`malformed YAML frontmatter: ${e.message}`] };
  }
  if (!isMapping(parsed)) return { errors: [NOT_A_MAPPING] };
  return { fm: parsed };
}

function bodyOf(content) {
  const lines = content.split('\n');
  const closing = lines.findIndex((line, i) => i > 0 && line.trim() === FENCE);
  return lines.slice(closing + 1);
}

function splitSections(lines) {
  const sections = [];
  let inFence = false;
  for (const line of lines) {
    if (CODE_FENCE.test(line)) inFence = !inFence;
    const heading = inFence ? null : H2.exec(line);
    if (heading) sections.push({ name: heading[1].trim(), lines: [] });
    else if (sections.length > 0) sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function trimBlankEdges(lines) {
  const first = lines.findIndex(line => line.trim() !== '');
  // equivalent mutant (guard -> false): with no non-blank line, slice(-1, 0) is empty and joins to ''
  if (first === -1) return '';
  const last = lines.findLastIndex(line => line.trim() !== '');
  return lines.slice(first, last + 1).join('\n');
}

function nonEmptyCount(text) {
  return text.split('\n').filter(line => line.trim() !== '').length;
}

function hasOverlongLine(text) {
  return text.split('\n').some(line => line.length > MAX_LESSON_LINE_CHARS);
}

function parseBody(lines) {
  const errors = [];
  // equivalent mutant (`''` fallback -> non-H1 string): H1 matches neither, so the missing-H1 error is identical
  const h1 = H1.exec(lines.find(line => line.trim() !== '') ?? '');
  if (!h1) errors.push(MISSING_H1);
  const sections = splitSections(lines);
  const names = sections.map(s => s.name);
  if (names.join('\n') !== LESSON_SECTIONS.join('\n')) errors.push(WRONG_SECTIONS);
  const texts = Object.fromEntries(sections.map(s => [s.name, trimBlankEdges(s.lines)]));
  // equivalent mutant (`''` fallback on this line and the overlong check below): a missing section already fails the sections rule, and a one-line sentinel breaches neither cap
  const howLines = nonEmptyCount(texts[HOW_TO_APPLY] ?? '');
  if (howLines > MAX_HOW_TO_APPLY_LINES) {
    errors.push(`${HOW_TO_APPLY} holds ${howLines} non-empty lines (max ${MAX_HOW_TO_APPLY_LINES})`);
  }
  if (hasOverlongLine(texts[HOW_TO_APPLY] ?? '')) {
    errors.push(`${HOW_TO_APPLY} line exceeds ${MAX_LESSON_LINE_CHARS} characters`);
  }
  if (h1 && h1[2].length > MAX_TITLE_CHARS) errors.push(`title exceeds ${MAX_TITLE_CHARS} characters`);
  return { errors, number: h1 ? Number(h1[1]) : null, title: h1 ? h1[2] : null, sections: texts };
}

function buildLesson(fm, body) {
  return {
    subjects: fm.subjects,
    phases: fm.phases,
    kind: fm.kind,
    trigger: fm.trigger,
    evidence: fm.evidence,
    source: { run: fm.source.run, phase: fm.source.phase, date: normalizeDate(fm.source.date) },
    status: fm.status,
    supersedes: fm.supersedes ?? [],
    lastVerified: normalizeDate(fm['last-verified']),
    number: body.number,
    title: body.title,
    sections: body.sections,
  };
}

/**
 * @param {string} content
 * @returns {{ lesson: object } | { reason: 'malformed-lesson', errors: string[] }}
 */
export function parseLesson(content) {
  const { fm, errors: readErrors } = readFrontmatter(content);
  if (readErrors) return { reason: 'malformed-lesson', errors: readErrors };
  const body = parseBody(bodyOf(content));
  const errors = [...checkFrontmatter(fm), ...body.errors];
  if (errors.length > 0) return { reason: 'malformed-lesson', errors };
  return { lesson: buildLesson(fm, body) };
}
