/**
 * `rulings-migrate` — derives decision-register lines from ADR files.
 */

import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { extractFrontmatter } from './frontmatter.js';
import { parseSubjects } from './intention-subjects.js';
import { REGISTER_HEADER, formatRulingLine, parseRulingLine, registerFindings } from './rulings.js';
import { safeLabel } from './cli-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const USAGE = 'usage: rulings-migrate register <adr-dir> [--chosen <file.json>]\n       rulings-migrate cite <file>...\n';
const PREFIX = 'rulings-migrate';
const ADR_NAME = /^(\d+)-.+\.md$/;
const H1_PATTERN = /^# (\d+) — (.+)$/;
const STATUS_PREFIX = '- **Status:**';
const OPTION_HEADINGS = ['## Options considered', '## Options'];
const OPTION_ITEM = /^(\d+)\. (.*)$/;
const CONTINUATION = /^\s+\S/;
const BOLD_RUN = /^\*\*(.+?)\*\*/;
const TITLE_SEPARATOR = ' — ';
const RECOMMENDED_MARKERS = [
  '*(recommended)*',
  '(recommended)',
  "(designer's recommendation)",
  '(designer recommendation)',
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
const ADOPTED_LEAD = new RegExp(`^\\*\\*${ADOPTED_TOKEN} \\(no user judgment\\)\\.?\\*\\*`);
const DEFAULT_BASIS = 'as recommended';
const REVIEW_BASES = [
  [/adopted in review \(no user judgment\)/, 'in review'],
  [/adopted from a verified review finding \(no user judgment\)/, 'from a verified review finding'],
];
const NAMED_OPTION = /(recommended )?option (\d+)/gi;
const DEVIATION = /deviat|against the [^.]*recommendation/i;
const SUSPECT_REASON = 'suspect chosen option — add a --chosen entry';
const NONE = 'none';
const ID_WIDTH = 3;
const SUPERSEDED_STATUS = /^superseded by ADR-(\d{3,})/;
const REJECTED_STATUS = /^rejected — (.+)$/;

const LINK_TARGET = /\]\(((?:[\w.-]+\/)*)adr\/\d{3,}-[\w-]+\.md(?:#[^)\s]*)?\)/g;
const BARE_PATH = /(?<![\w.-])(?:[\w.-]+\/)*adr\/(\d{3,})-[\w-]+\.md(?::\d+)?/g;
const ADR_ID = /\bADR-(\d{3,})\b/g;
const CITE_RULES = [
  [LINK_TARGET, ']($1RULINGS.md)'],
  [BARE_PATH, 'R-$1'],
  [ADR_ID, 'R-$1'],
];

const DEFAULT_DEPS = {
  readFile: (p) => readFileSync(p, 'utf8'),
  listDir: readdirSync,
  isRegularEntry: (p) => lstatSync(p).isFile(),
  writeFile: (p, content) => writeFileSync(p, content),
  cwd: () => process.cwd(),
};

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
  const [text, number, body] = match;
  return {
    number: Number(number),
    title: optionTitle(body),
    recommended: RECOMMENDED_MARKERS.some((m) => text.includes(m)),
    chosen: CHOSEN_MARKERS.some((m) => text.includes(m)),
  };
}

function joinItems(lines) {
  const items = [];
  let open = false;
  for (const l of lines) {
    if (OPTION_ITEM.test(l)) items.push(l);
    else if (open && CONTINUATION.test(l)) items[items.length - 1] += ` ${l.trim()}`;
    open = OPTION_ITEM.test(l) || (open && CONTINUATION.test(l));
  }
  return items;
}

function readOptions(lines) {
  return joinItems(sectionLines(lines, (l) => OPTION_HEADINGS.includes(l)))
    .map((l) => OPTION_ITEM.exec(l))
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

const BASIS_DASH = /^\s*—\s*/;
const FIRST_SENTENCE = /^(.*?)(?:\.(?:\s|$)|$)/s;
const BARE_OPTION = /^option \d+\W*$/i;

const toRulingIds = (text) => text.replace(ADR_ID, 'R-$1');

function leadBasis(lead) {
  const afterMarker = lead.replace(ADOPTED_LEAD, '');
  if (!BASIS_DASH.test(afterMarker)) return DEFAULT_BASIS;
  const basis = afterMarker.replace(BASIS_DASH, '').match(FIRST_SENTENCE)[1].trim();
  return basis === '' || BARE_OPTION.test(basis) ? DEFAULT_BASIS : toRulingIds(basis);
}

function isRecognisedAdoption({ status, heading, lead }) {
  return ADOPTED_LEAD.test(lead) || status.includes(ADOPTED_TOKEN) || heading.includes(ADOPTED_TOKEN);
}

function adoption({ status, heading, lead }) {
  const review = reviewBasis(status);
  if (!isRecognisedAdoption({ status, heading, lead }) && review === null) return null;
  if (ADOPTED_LEAD.test(lead)) return leadBasis(lead);
  return review ?? DEFAULT_BASIS;
}

const only = (options, flag) => {
  const marked = options.filter((o) => o[flag]);
  return marked.length === 1 ? marked[0].number : null;
};

function conflicts(entry, marker) {
  return entry !== undefined && marker !== null && entry !== marker;
}

function recommendedSource(recommended, adopted) {
  if (recommended === null) return { number: null, source: NONE };
  return { number: recommended, source: adopted === null ? 'recommended' : 'adopted' };
}

function chosenNumber(options, entry, adopted) {
  const marker = only(options, 'chosen');
  if (conflicts(entry, marker)) return refuse('--chosen entry contradicts the chosen marker');
  if (entry !== undefined) return { number: entry === NONE ? null : entry, source: 'table' };
  if (marker !== null) return { number: marker, source: 'chosen-marker' };
  return recommendedSource(only(options, 'recommended'), adopted);
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
  return chosenNumber(options, entry, parts.adopted);
}

function sameShape(parsed, ruling) {
  return JSON.stringify([parsed.statement, parsed.refused, parsed.adopted, parsed.status]) === JSON.stringify([ruling.statement, ruling.refused, ruling.adopted, ruling.status]);
}

function roundTrips(ruling) {
  const parsed = parseRulingLine(formatRulingLine(ruling), 0);
  return !parsed.error && sameShape(parsed.ruling, ruling);
}

function statusLine(lines) {
  const found = lines.find((l) => l.startsWith(STATUS_PREFIX));
  return found ? found.slice(STATUS_PREFIX.length).trim() : '';
}

function successorOf(content) {
  const match = SUPERSEDED_STATUS.exec(statusLine(content.split('\n')));
  return match ? Number(match[1]) : null;
}

function scopeFor(id, successorContent) {
  const block = extractFrontmatter(successorContent);
  const entries = block === null ? null : load(block)?.supersedes;
  const entry = Array.isArray(entries) ? entries.find((e) => Number(e?.adr) === id) : undefined;
  return typeof entry?.scope === 'string' ? toRulingIds(entry.scope.replace(/\.$/, '')) : null;
}

function liveTail(id, docs) {
  const visited = new Set([id]);
  let current = id;
  for (;;) {
    const next = successorOf(docs.get(current));
    if (next === null) return { tail: current };
    if (!docs.has(next)) return refuse(`superseding ADR ${next} has no file`);
    if (visited.has(next)) return refuse('supersession cycle');
    visited.add(next);
    current = next;
  }
}

function supersededStatus(id, docs) {
  const direct = successorOf(docs.get(id));
  const tail = liveTail(id, docs);
  if (tail.reason) return tail;
  const scope = scopeFor(id, docs.get(direct));
  return { status: { kind: 'superseded', by: tail.tail, scope: scope ?? `see R-${direct}` } };
}

function rejectedStatus(lines) {
  const match = REJECTED_STATUS.exec(statusLine(lines));
  return match ? { kind: 'rejected', reason: toRulingIds(match[1].replace(/\.$/, '')) } : null;
}

function statusOf(id, docs) {
  if (successorOf(docs.get(id)) !== null) return supersededStatus(id, docs);
  return { status: rejectedStatus(docs.get(id).split('\n')) };
}

function buildRuling({ id, subjects, heading, options, adopted, chosen, status }) {
  return { id, paths: subjects.paths, statement: toRulingIds(heading.title), refused: refusedTitles(options, chosen.number).map(toRulingIds), adopted, status };
}

function describe(ruling, chosen, options, unrecognised) {
  return { ruling, source: chosen.source, notRecommended: chosen.number !== only(options, 'recommended'), unrecognised };
}

function deriveRuling(id, content, entry, docs) {
  const lines = content.split('\n');
  const heading = readHeading(lines, id);
  if (heading.reason) return heading;
  const subjects = readPaths(content);
  if (subjects.reason) return subjects;
  const options = readOptions(lines);
  const parts = { status: statusLine(lines), ...readDecision(lines) };
  const adopted = adoption(parts);
  const chosen = choose(options, entry, { adopted, lead: parts.lead });
  if (chosen.reason) return chosen;
  const superseded = statusOf(id, docs);
  if (superseded.reason) return superseded;
  const ruling = buildRuling({ id, subjects, heading, options, adopted, chosen, status: superseded.status });
  if (!roundTrips(ruling)) return refuse('title, option or basis holds a reserved marker');
  return describe(ruling, chosen, options, content.includes(ADOPTED_TOKEN) && !isRecognisedAdoption(parts));
}

function readTableFile(path, deps) {
  try {
    return { text: deps.readFile(resolve(deps.cwd(), path)) };
  } catch (error) {
    return refuse(`--chosen cannot read ${path}: ${error.message}`);
  }
}

function parseTable(path, deps) {
  const file = readTableFile(path, deps);
  if (file.reason) return file;
  let table;
  try {
    table = JSON.parse(file.text);
  } catch (error) {
    return refuse(`--chosen ${path} is not valid JSON: ${error.message}`);
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
  const docs = new Map(adrs.map((adr) => [adr.id, deps.readFile(resolve(dir, adr.name))]));
  return adrs.map((adr) => {
    if (seen.has(adr.id)) return { adr, ...refuse('repeated id') };
    seen.add(adr.id);
    return { adr, ...deriveRuling(adr.id, docs.get(adr.id), entries.get(adr.id), docs) };
  });
}

const HEADER_LINES = REGISTER_HEADER.split('\n').length - 1;

function selfCheck(results) {
  const derived = results.filter((r) => r.ruling);
  const register = REGISTER_HEADER + derived.map((r) => `${formatRulingLine(r.ruling)}\n`).join('');
  const byLine = new Map(registerFindings(register).map((f) => [f.line, f.message]));
  const failing = new Map(derived.map((r, i) => [r, byLine.get(HEADER_LINES + i + 1)]).filter(([, message]) => message !== undefined));
  return results.map((r) => (failing.has(r) ? { adr: r.adr, ...refuse(failing.get(r)) } : r));
}

function parseRegisterArgs(argv) {
  const [verb, dir, flag, chosen, ...extra] = argv;
  const shaped = verb === 'register' && dir && extra.length === 0 && (flag === undefined || (flag === '--chosen' && chosen !== undefined));
  return shaped ? { verb, dir, chosen: flag === undefined ? null : chosen } : null;
}

function parseArgs(argv) {
  const [verb, ...files] = argv;
  if (verb === 'cite') return files.length > 0 ? { verb, files } : null;
  return parseRegisterArgs(argv);
}

function fail(io, message) {
  io.stderr.write(`${PREFIX}: ${message}\n`);
  return EXIT_INVALID;
}

const SOURCES = ['table', 'chosen-marker', 'adopted', 'recommended', 'none'];
const NO_IDS = '(none)';

const idList = (results) => (results.length ? results.map((r) => `R-${String(r.ruling.id).padStart(ID_WIDTH, '0')}`).join(', ') : NO_IDS);

function writeSummary(results, io) {
  const counts = SOURCES.map((source) => `${source}=${results.filter((r) => r.source === source).length}`);
  io.stderr.write(`${PREFIX}: chosen ${counts.join(' ')}\n`);
  io.stderr.write(`${PREFIX}: not-recommended ${idList(results.filter((r) => r.notRecommended))}\n`);
  io.stderr.write(`${PREFIX}: adopted-mention-unrecognised ${idList(results.filter((r) => r.unrecognised))}\n`);
}

function report(results, io) {
  const refused = results.filter((r) => r.reason);
  if (refused.length === 0) {
    io.stdout.write(REGISTER_HEADER + results.map((r) => `${formatRulingLine(r.ruling)}\n`).join(''));
    writeSummary(results, io);
    return EXIT_OK;
  }
  refused.forEach((r) => io.stderr.write(`${PREFIX}: refuse ${r.adr.label}: ${safeLabel(r.reason)}\n`));
  return EXIT_INVALID;
}

function rewriteCitations(text) {
  let rewrites = 0;
  const content = CITE_RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, (...m) => {
      rewrites += 1;
      return replacement.replace(/\$(\d)/g, (_, i) => m[Number(i)]);
    }),
    text,
  );
  return { content, rewrites };
}

function readCiteTarget(file, deps) {
  const path = resolve(deps.cwd(), file);
  try {
    if (!deps.isRegularEntry(path)) return refuse('not a regular file');
    return { file, path, text: deps.readFile(path) };
  } catch (error) {
    return refuse(`cannot read: ${error.message}`);
  }
}

function citeAll(files, io, deps) {
  const targets = files.map((file) => ({ file, ...readCiteTarget(file, deps) }));
  const refused = targets.filter((t) => t.reason);
  refused.forEach((t) => io.stdout.write(`${PREFIX}: refuse ${safeLabel(t.file)}: ${safeLabel(t.reason)}\n`));
  if (refused.length > 0) return EXIT_INVALID;
  targets
    .map((t) => ({ ...t, ...rewriteCitations(t.text) }))
    .filter((t) => t.content !== t.text)
    .forEach((t) => {
      deps.writeFile(t.path, t.content);
      io.stdout.write(`${PREFIX}: cite ${safeLabel(t.file)}: ${t.rewrites} rewrites\n`);
    });
  return EXIT_OK;
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
  if (args.verb === 'cite') return citeAll(args.files, io, resolved);
  const table = args.chosen === null ? { entries: new Map() } : parseTable(args.chosen, resolved);
  if (table.reason) return fail(io, table.reason);
  const dir = resolve(resolved.cwd(), args.dir);
  const adrs = listAdrs(dir, resolved);
  const unknown = [...table.entries.keys()].find((id) => !adrs.some((a) => a.id === id));
  if (unknown !== undefined) return fail(io, `--chosen names unknown id ${unknown}`);
  return report(selfCheck(deriveAll(adrs, dir, table.entries, resolved)), io);
}
