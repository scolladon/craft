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

const stripDot = (text) => text.replace(/\.$/, '');

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
  const segments = { statement: stripDot(found.length ? tail.slice(0, found[0].at) : tail) };
  found.forEach(({ marker, at }, i) => {
    const end = i + 1 < found.length ? found[i + 1].at : tail.length;
    segments[marker] = stripDot(tail.slice(at + marker.length, end));
  });
  return segments;
}

const SUPERSEDED_PATTERN = /^(\d{3,}): (.+)$/;

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
  if (segments.statement === '') return 'empty statement';
  const refused = segments[REFUSED_MARKER];
  if (refused !== undefined && refused.split(ITEM_SEPARATOR).some((item) => item.trim() === '')) return 'empty refused item';
  const named = [
    [ADOPTED_MARKER, 'empty adoption basis'],
    [REJECTED_MARKER, 'empty rejection reason'],
  ];
  const empty = named.find(([marker]) => segments[marker] === '');
  return empty ? empty[1] : null;
}

function segmentError(segments, status) {
  const empty = emptySegmentError(segments);
  if (empty) return empty;
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
  const match = LINE_PATTERN.exec(line);
  if (!match) return fail(lineNo, 'not a ruling line: expected "- R-NNN [paths] statement."');
  const tail = match[3];
  const markers = markerError(tail);
  if (markers) return fail(lineNo, markers);
  const segments = splitSegments(tail);
  const status = parseStatus(segments);
  const problem = segmentError(segments, status);
  if (problem) return fail(lineNo, problem);
  return { ruling: toRuling(match, lineNo, segments, status) };
}

const ID_WIDTH = 3;
const formatId = (id) => `R-${String(id).padStart(ID_WIDTH, '0')}`;

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

const touchesRuling = (ruling, touched) =>
  ruling.paths.some((glob) => touched.some((path) => matchGlob(path, glob)));

export function sliceRulings(rulings, touched) {
  return {
    matched: rulings.filter((ruling) => touchesRuling(ruling, touched)),
    pathless: rulings.filter((ruling) => ruling.paths.length === 0).length,
  };
}
