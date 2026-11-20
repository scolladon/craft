/**
 * Decision register grammar: one ruling per line. Pure, no I/O.
 */

import { matchGlob } from './glob.js';

const LINE_PATTERN = /^- R-(\d{3,}) \[([^\]]*)\] (.+)$/;
const PATH_SEPARATOR = ', ';
const ITEM_SEPARATOR = ' · ';
const REFUSED_MARKER = ' Refused: ';
const ADOPTED_MARKER = ' Adopted: ';
const SUPERSEDED_MARKER = ' Superseded by R-';
const REJECTED_MARKER = ' Rejected: ';
const MARKERS = [REFUSED_MARKER, ADOPTED_MARKER, SUPERSEDED_MARKER, REJECTED_MARKER];

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const DOT = '.';
const stripDot = (text) => text.replace(/\.$/, '');
const isBlank = (text) => text.trim() === '';

function occurrences(tail, marker) {
  return tail.split(marker).length - 1;
}

function markerError(tail) {
  const found = MARKERS.map((marker) => ({ marker, at: tail.indexOf(marker) })).filter(({ at }) => at >= 0);
  const repeated = found.find(({ marker }) => occurrences(tail, marker) > 1);
  if (repeated) return `reserved marker "${repeated.marker.trim()}" repeats`;
  const positions = found.map(({ at }) => at);
  if (positions.some((at, i) => i > 0 && at < positions[i - 1])) return 'reserved markers are out of order';
  if (found.some(({ marker }) => marker === SUPERSEDED_MARKER) && found.some(({ marker }) => marker === REJECTED_MARKER)) {
    return 'a ruling cannot be both superseded and rejected';
  }
  return null;
}

function splitSegments(tail) {
  const found = MARKERS.map((marker) => ({ marker, at: tail.indexOf(marker) })).filter(({ at }) => at >= 0);
  const segments = { statement: found.length ? tail.slice(0, found[0].at) : tail };
  found.forEach(({ marker, at }, i) => {
    const end = i + 1 < found.length ? found[i + 1].at : tail.length;
    segments[marker] = tail.slice(at + marker.length, end);
  });
  return segments;
}

const SUPERSEDED_PATTERN = /^(\d{3,}): (.*\S.*)$/;

function undotted(segments) {
  return Object.fromEntries(Object.entries(segments).map(([key, text]) => [key, stripDot(text)]));
}

function parseSuperseded(text) {
  const match = SUPERSEDED_PATTERN.exec(text);
  return match && { kind: 'superseded', by: Number(match[1]), scope: match[2] };
}

function parseStatus(segments) {
  if (segments[SUPERSEDED_MARKER] !== undefined) return parseSuperseded(segments[SUPERSEDED_MARKER]);
  if (segments[REJECTED_MARKER] !== undefined) return { kind: 'rejected', reason: segments[REJECTED_MARKER] };
  return null;
}

function emptySegmentError(segments) {
  if (isBlank(segments.statement)) return 'empty statement';
  const refused = segments[REFUSED_MARKER];
  if (refused !== undefined && refused.split(ITEM_SEPARATOR).some((item) => item.trim() === '')) return 'empty refused item';
  const named = [
    [ADOPTED_MARKER, 'empty adoption basis'],
    [REJECTED_MARKER, 'empty rejection reason'],
  ];
  const empty = named.find(([marker]) => segments[marker] !== undefined && isBlank(segments[marker]));
  return empty ? empty[1] : null;
}

function segmentError(raw, segments, status) {
  const empty = emptySegmentError(segments);
  if (empty) return empty;
  if (Object.values(raw).some((text) => !text.endsWith(DOT))) return 'every segment must end with a dot';
  if (segments[SUPERSEDED_MARKER] !== undefined && status === null) return 'superseded status needs an id and a scope';
  return null;
}

function toRuling(match, lineNo, segments, status) {
  const [, id, paths] = match;
  const refused = segments[REFUSED_MARKER];
  return {
    id: Number(id),
    line: lineNo,
    paths: paths === '' ? [] : paths.split(PATH_SEPARATOR),
    statement: segments.statement,
    refused: refused === undefined ? [] : refused.split(ITEM_SEPARATOR),
    adopted: segments[ADOPTED_MARKER] ?? null,
    status,
    raw: match[0],
  };
}

const fail = (line, message) => ({ error: { line, message } });

export function parseRulingLine(line, lineNo) {
  if (CONTROL_CHARS.test(line)) return fail(lineNo, 'control character in ruling line');
  const match = LINE_PATTERN.exec(line);
  if (!match) return fail(lineNo, 'not a ruling line: expected "- R-NNN [paths] statement."');
  const tail = match[3];
  const markers = markerError(tail);
  if (markers) return fail(lineNo, markers);
  const raw = splitSegments(tail);
  const segments = undotted(raw);
  const status = parseStatus(segments);
  const problem = segmentError(raw, segments, status);
  if (problem) return fail(lineNo, problem);
  return { ruling: toRuling(match, lineNo, segments, status) };
}

const ID_WIDTH = 3;
export const formatId = (id) => `R-${String(id).padStart(ID_WIDTH, '0')}`;

function formatStatus(status) {
  if (status === null) return '';
  if (status.kind === 'superseded') return `${SUPERSEDED_MARKER}${formatId(status.by).slice(2)}: ${status.scope}.`;
  return `${REJECTED_MARKER}${status.reason}.`;
}

export function formatRulingLine(ruling) {
  const refused = ruling.refused.length ? `${REFUSED_MARKER}${ruling.refused.join(ITEM_SEPARATOR)}.` : '';
  const adopted = ruling.adopted === null ? '' : `${ADOPTED_MARKER}${ruling.adopted}.`;
  const head = `- ${formatId(ruling.id)} [${ruling.paths.join(PATH_SEPARATOR)}] ${ruling.statement}.`;
  return `${head}${refused}${adopted}${formatStatus(ruling.status)}`;
}

export const REGISTER_HEADER = `# Rulings

What is settled, what was refused, for which paths. One line per ruling, append-only; the
decisions phase writes them, \`rulings-lint\` checks them. Why a ruling was made is not stored:
infer it from \`DOCTRINE.md\` and the code.

`;

const RULING_PREFIX = '- ';
const RULING_ID_PREFIX = '- R-';
const H1 = '# Rulings';

function parseBodyLine(line, lineNo, acc) {
  if (line.trim() === '') return;
  if (!line.startsWith(RULING_ID_PREFIX)) {
    acc.errors.push({ line: lineNo, message: 'not a ruling line' });
    return;
  }
  const parsed = parseRulingLine(line, lineNo);
  if (parsed.error) acc.errors.push(parsed.error);
  else acc.rulings.push(parsed.ruling);
}

export function parseRegister(content) {
  const acc = { rulings: [], errors: [] };
  const lines = content.split('\n');
  if (lines[0] !== H1) acc.errors.push({ line: 1, message: `the register must start with "${H1}"` });
  let inBody = false;
  lines.forEach((line, i) => {
    inBody = inBody || line.startsWith(RULING_PREFIX);
    if (inBody) parseBodyLine(line, i + 1, acc);
  });
  return acc;
}

const GLOB_SYNTAX = /[*?[\]{}()!+@\\]/;

const touchesGlob = (glob, touched, touchedSet) =>
  GLOB_SYNTAX.test(glob) ? touched.some((path) => matchGlob(path, glob)) : touchedSet.has(glob);

const touchesRuling = (ruling, touched, touchedSet) =>
  ruling.paths.some((glob) => touchesGlob(glob, touched, touchedSet));

export function sliceRulings(rulings, touched) {
  const touchedSet = new Set(touched);
  return {
    matched: rulings.filter((ruling) => touchesRuling(ruling, touched, touchedSet)),
    pathless: rulings.filter((ruling) => ruling.paths.length === 0).length,
  };
}

const SAFE_PATH_BREAKERS = /[\s,[]/;
const BASIS_RULING_REF = /R-(\d{3,})/g;

const finding = (ruling, message) => ({ line: ruling.line, message });

function orderFindings(rulings) {
  const seen = new Set();
  const findings = [];
  rulings.forEach((ruling, i) => {
    if (seen.has(ruling.id)) findings.push(finding(ruling, `duplicate id ${formatId(ruling.id)}`));
    else if (i > 0 && ruling.id < rulings[i - 1].id) findings.push(finding(ruling, `${formatId(ruling.id)} out of order`));
    seen.add(ruling.id);
  });
  return findings;
}

const isUnsafePath = (path) =>
  path === '' || path.startsWith('/') || path.startsWith('~') || path.split('/').includes('..') || SAFE_PATH_BREAKERS.test(path);

const pathFindings = (ruling) => ruling.paths.filter(isUnsafePath).map((path) =>
  finding(ruling, `path "${path}" must be repo-relative, without whitespace, "..", "~", "," or brackets`));

function supersessionProblem(ruling, byId) {
  const target = byId.get(ruling.status.by);
  const name = formatId(ruling.status.by);
  if (!target) return `superseded by ${name} which has no line`;
  if (ruling.status.by <= ruling.id) return `superseded by ${name} which is not a later ruling`;
  if (target.status?.kind === 'superseded') return `superseded by ${name} which is itself superseded`;
  return null;
}

function supersessionFindings(ruling, byId) {
  if (ruling.status?.kind !== 'superseded') return [];
  const problem = supersessionProblem(ruling, byId);
  return problem ? [finding(ruling, problem)] : [];
}

function basisFindings(ruling, byId) {
  if (ruling.adopted === null) return [];
  return [...ruling.adopted.matchAll(BASIS_RULING_REF)]
    .filter((match) => !byId.has(Number(match[1])))
    .map((match) => finding(ruling, `adoption basis names R-${match[1]} which has no line`));
}

/**
 * Whole-register checks: form, order, paths, supersession and adoption references.
 * @param {string} content
 * @returns {{ line: number, message: string }[]}
 */
export function registerFindings(content) {
  const { rulings, errors } = parseRegister(content);
  const byId = new Map(rulings.map((ruling) => [ruling.id, ruling]));
  const semantic = [
    ...orderFindings(rulings),
    ...rulings.flatMap(pathFindings),
    ...rulings.flatMap((ruling) => supersessionFindings(ruling, byId)),
    ...rulings.flatMap((ruling) => basisFindings(ruling, byId)),
  ];
  return [...errors, ...semantic].sort((a, b) => a.line - b.line);
}
