/**
 * `rulings-migrate` — derives decision-register lines from ADR files.
 */

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSubjects } from './intention-subjects.js';
import { REGISTER_HEADER, formatRulingLine, parseRulingLine } from './rulings.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const USAGE = 'usage: rulings-migrate register <adr-dir> [--chosen <json>]\n';
const PREFIX = 'rulings-migrate';
const ADR_NAME = /^(\d+)-.+\.md$/;
const H1_PATTERN = /^# (\d+) — (.+)$/;
const STATUS_PREFIX = '- **Status:**';
const OPTION_HEADINGS = ['## Options considered', '## Options'];
const OPTION_ITEM = /^(\d+)\. (.*)$/;
const BOLD_RUN = /^\*\*(.+?)\*\*/;
const TITLE_SEPARATOR = ' — ';
const RECOMMENDED_MARKERS = [
  '*(recommended)*',
  '(recommended)',
  "*(designer's recommendation)*",
  '*(designer recommendation)*',
  '*(designer recommended)*',
  '*(recommended by the design)*',
  '*(recommendation)*',
  '*(design recommendation)*',
];
const CHOSEN_MARKERS = ['*(chosen)*', '*(user choice)*', "*(user's choice)*"];
const DECISION_HEADING = '## Decision';
const ADOPTED_TOKEN = 'adopted-as-recommended';
const ADOPTED_LEAD = `**${ADOPTED_TOKEN} (no user judgment)**`;
const DEFAULT_BASIS = 'as recommended';
const REVIEW_BASES = [
  [/adopted in review \(no user judgment\)/, 'in review'],
  [/adopted from a verified review finding \(no user judgment\)/, 'from a verified review finding'],
];
const NAMED_OPTION = /(recommended )?option (\d+)/gi;
const DEVIATION = /deviat|against the [^.]*recommendation/i;
const SUSPECT_REASON = 'suspect chosen option — add a --chosen entry';
const NONE = 'none';

const DEFAULT_DEPS = {
  readFile: (p) => readFileSync(p, 'utf8'),
  listDir: readdirSync,
  isRegularEntry: (p) => lstatSync(p).isFile(),
  cwd: () => process.cwd(),
};

const safeLabel = (text) => text.replace(/[\u0000-\u001f\u007f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
const refuse = (reason) => ({ reason });

function readHeading(lines, id) {
  const match = H1_PATTERN.exec(lines.find((l) => l.startsWith('# ')) ?? '');
  if (!match) return refuse('missing or malformed H1');
  if (Number(match[1]) !== id) return refuse(`H1 number ${match[1]} does not match the filename`);
  return { title: match[2].trim() };
}

function readPaths(content) {
  let subjects;
  try {
    subjects = parseSubjects(content);
  } catch (error) {
    return refuse(error.message);
  }
  if (subjects === null) return { paths: [] };
  const valid = Array.isArray(subjects) && subjects.every((s) => typeof s === 'string' && s !== '');
  return valid ? { paths: subjects } : refuse('subjects is not a list of non-empty strings');
}

function sectionLines(lines, isHeading) {
  const start = lines.findIndex(isHeading);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return end < 0 ? rest : rest.slice(0, end);
}

function stripMarkers(text) {
  return [...RECOMMENDED_MARKERS, ...CHOSEN_MARKERS].reduce((acc, marker) => acc.split(marker).join(' '), text);
}

function optionTitle(body) {
  const bold = BOLD_RUN.exec(body);
  const raw = bold ? bold[1] : stripMarkers(body).split(TITLE_SEPARATOR)[0];
  return stripMarkers(raw).replace(/\s+/g, ' ').trim();
}

function toOption(match) {
  const [line, number, body] = match;
  return {
    number: Number(number),
    title: optionTitle(body),
    recommended: RECOMMENDED_MARKERS.some((m) => line.includes(m)),
    chosen: CHOSEN_MARKERS.some((m) => line.includes(m)),
  };
}

function readOptions(lines) {
  return sectionLines(lines, (l) => OPTION_HEADINGS.includes(l))
    .map((l) => OPTION_ITEM.exec(l))
    .filter(Boolean)
    .map(toOption);
}

function readDecision(lines) {
  const index = lines.findIndex((l) => l === DECISION_HEADING || l.startsWith(`${DECISION_HEADING}${TITLE_SEPARATOR}`));
  if (index < 0) return { heading: '', lead: '' };
  const body = lines.slice(index + 1);
  const first = body.findIndex((l) => l.trim() !== '');
  const paragraph = first < 0 ? [] : body.slice(first);
  const end = paragraph.findIndex((l) => l.trim() === '');
  return { heading: lines[index], lead: (end < 0 ? paragraph : paragraph.slice(0, end)).join(' ').trim() };
}

function reviewBasis(status) {
  const found = REVIEW_BASES.find(([pattern]) => pattern.test(status));
  return found ? found[1] : null;
}

function leadBasis(lead) {
  const basis = lead.slice(ADOPTED_LEAD.length).replace(/^\s*—\s*/, '').replace(/\.$/, '').trim();
  return basis === '' ? DEFAULT_BASIS : basis.replace(/ADR-(\d{3,})/g, 'R-$1');
}

function adoption({ status, heading, lead }) {
  const leadForm = lead.startsWith(ADOPTED_LEAD);
  const review = reviewBasis(status);
  const adopted = leadForm || review !== null || status.includes(ADOPTED_TOKEN) || heading.includes(ADOPTED_TOKEN);
  if (!adopted) return null;
  if (leadForm) return leadBasis(lead);
  return review ?? DEFAULT_BASIS;
}

const only = (options, flag) => {
  const marked = options.filter((o) => o[flag]);
  return marked.length === 1 ? marked[0].number : null;
};

function conflicts(entry, marker) {
  return entry !== undefined && marker !== null && entry !== marker;
}

function chosenNumber(options, entry) {
  const marker = only(options, 'chosen');
  if (conflicts(entry, marker)) return refuse('--chosen entry contradicts the chosen marker');
  if (entry !== undefined) return { number: entry === NONE ? null : entry };
  return { number: marker ?? only(options, 'recommended') };
}

function namesOtherOption(lead, recommended) {
  return [...lead.matchAll(NAMED_OPTION)]
    .filter((m) => !m[1])
    .some((m) => Number(m[2]) !== recommended);
}

function isSuspect(lead, options) {
  return DEVIATION.test(lead) || namesOtherOption(lead, only(options, 'recommended'));
}

function needsTableEntry(entry, options, parts) {
  if (entry !== undefined || options.some((o) => o.chosen)) return false;
  return parts.adopted === null && isSuspect(parts.lead, options);
}

function refusedTitles(options, number) {
  if (number === null || options.length < 2) return [];
  return options.filter((o) => o.number !== number).map((o) => o.title);
}

function choose(options, entry, parts) {
  if (typeof entry === 'number' && !options.some((o) => o.number === entry)) return refuse(`--chosen option ${entry} is out of range`);
  if (needsTableEntry(entry, options, parts)) return refuse(SUSPECT_REASON);
  return chosenNumber(options, entry);
}

function sameShape(parsed, ruling) {
  return JSON.stringify([parsed.statement, parsed.refused, parsed.adopted]) === JSON.stringify([ruling.statement, ruling.refused, ruling.adopted]);
}

function roundTrips(ruling) {
  const parsed = parseRulingLine(formatRulingLine(ruling), 0);
  return !parsed.error && sameShape(parsed.ruling, ruling);
}

function statusLine(lines) {
  const found = lines.find((l) => l.startsWith(STATUS_PREFIX));
  return found ? found.slice(STATUS_PREFIX.length).trim() : '';
}

function deriveRuling(id, content, entry) {
  const lines = content.split('\n');
  const heading = readHeading(lines, id);
  if (heading.reason) return heading;
  const subjects = readPaths(content);
  if (subjects.reason) return subjects;
  const options = readOptions(lines);
  const decision = readDecision(lines);
  const adopted = adoption({ status: statusLine(lines), ...decision });
  const chosen = choose(options, entry, { adopted, lead: decision.lead });
  if (chosen.reason) return chosen;
  const ruling = { id, paths: subjects.paths, statement: heading.title, refused: refusedTitles(options, chosen.number), adopted, status: null };
  return roundTrips(ruling) ? { ruling } : refuse('title, option or basis holds a reserved marker');
}

function parseTable(json) {
  let table;
  try {
    table = JSON.parse(json);
  } catch (error) {
    return refuse(`--chosen is not valid JSON: ${error.message}`);
  }
  const isObject = table !== null && typeof table === 'object' && !Array.isArray(table);
  const valid = isObject && Object.entries(table).every(([id, v]) => /^\d+$/.test(id) && (v === NONE || (Number.isInteger(v) && v > 0)));
  return valid ? { entries: new Map(Object.entries(table).map(([id, v]) => [Number(id), v])) } : refuse('--chosen must map ids to a positive integer or "none"');
}

function listAdrs(dir, deps) {
  return deps.listDir(dir)
    .filter((name) => ADR_NAME.test(name) && deps.isRegularEntry(resolve(dir, name)))
    .map((name) => ({ name, label: ADR_NAME.exec(name)[1], id: Number(ADR_NAME.exec(name)[1]) }))
    .sort((a, b) => a.id - b.id || a.name.localeCompare(b.name));
}

function deriveAll(adrs, dir, entries, deps) {
  const seen = new Set();
  return adrs.map((adr) => {
    if (seen.has(adr.id)) return { adr, ...refuse('repeated id') };
    seen.add(adr.id);
    return { adr, ...deriveRuling(adr.id, deps.readFile(resolve(dir, adr.name)), entries.get(adr.id)) };
  });
}

function parseArgs(argv) {
  const [verb, dir, flag, json, ...extra] = argv;
  const shaped = verb === 'register' && dir && extra.length === 0 && (flag === undefined || (flag === '--chosen' && json !== undefined));
  return shaped ? { dir, json: flag === undefined ? null : json } : null;
}

function fail(io, message) {
  io.stderr.write(`${PREFIX}: ${message}\n`);
  return EXIT_INVALID;
}

function report(results, io) {
  const refused = results.filter((r) => r.reason);
  if (refused.length === 0) {
    io.stdout.write(REGISTER_HEADER + results.map((r) => `${formatRulingLine(r.ruling)}\n`).join(''));
    return EXIT_OK;
  }
  refused.forEach((r) => io.stderr.write(`${PREFIX}: refuse ${r.adr.label}: ${safeLabel(r.reason)}\n`));
  return EXIT_INVALID;
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {Partial<typeof DEFAULT_DEPS>} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const resolved = { ...DEFAULT_DEPS, ...deps };
  const args = parseArgs(argv);
  if (!args) {
    io.stderr.write(USAGE);
    return EXIT_INVALID;
  }
  const table = args.json === null ? { entries: new Map() } : parseTable(args.json);
  if (table.reason) return fail(io, table.reason);
  const dir = resolve(resolved.cwd(), args.dir);
  const adrs = listAdrs(dir, resolved);
  const unknown = [...table.entries.keys()].find((id) => !adrs.some((a) => a.id === id));
  if (unknown !== undefined) return fail(io, `--chosen names unknown id ${unknown}`);
  return report(deriveAll(adrs, dir, table.entries, resolved), io);
}
