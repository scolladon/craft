/**
 * `doctrine-lint` — the doctrine file gate: entry form, citation resolution against the
 * rulings register, and orphan `DOCTRINE(D-<n>)` adoption bases inside the register.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDoctrine } from './doctrine.js';
import { parseRegister } from './rulings.js';
import { isRegularFile } from './cli-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const USAGE = 'usage: doctrine-lint <doctrine-file> <register-file>\n';
const PREFIX = 'doctrine-lint';
const DOCTRINE_CITATION = /DOCTRINE\(D-(\d+)\)/g;
const SUPERSEDED_KIND = 'superseded';

const DEFAULT_DEPS = {
  readFile: (p) => readFileSync(p, 'utf8'),
  isFile: isRegularFile,
  cwd: () => process.cwd(),
};

function missingInput(args, deps) {
  const absent = args.find((arg) => !deps.isFile(resolve(deps.cwd(), arg)));
  return absent === undefined ? null : `no such file ${absent}`;
}

function lintFindings(doctrineArg, registerArg, deps) {
  const doctrine = parseDoctrine(deps.readFile(resolve(deps.cwd(), doctrineArg)));
  const { rulings, errors } = parseRegister(deps.readFile(resolve(deps.cwd(), registerArg)));
  const rulingsById = groupById(rulings);
  const findings = [
    ...doctrine.errors.map((error) => formatFinding(`${doctrineArg}:${error.line}`, error.message)),
    ...errors.map((error) => formatFinding(`${registerArg}:${error.line}`, error.message)),
    ...citationFindings(doctrine.entries, doctrineArg, rulingsById),
    ...orphanFindings(rulings, doctrine.entries, registerArg),
  ];
  return { findings, doctrine };
}

function formatFinding(label, message) {
  return `${PREFIX}: ${label}: ${message}\n`;
}

function groupById(rulings) {
  const byId = new Map();
  for (const ruling of rulings) byId.set(ruling.id, [...(byId.get(ruling.id) ?? []), ruling]);
  return byId;
}

function citationProblem(id, rulingsById) {
  const matches = rulingsById.get(Number(id)) ?? [];
  if (matches.length === 0) return `R-${id} does not resolve`;
  if (matches.length > 1) return `R-${id} is ambiguous`;
  const [ruling] = matches;
  return ruling.status?.kind === SUPERSEDED_KIND ? `R-${id} is superseded` : null;
}

function entryFindings(entry, label, rulingsById) {
  return [...entry.evidence, ...entry.counterCases]
    .map((id) => citationProblem(id, rulingsById))
    .filter((problem) => problem !== null)
    .map((problem) => formatFinding(label, `D-${entry.id}: ${problem}`));
}

function citationFindings(entries, label, rulingsById) {
  return entries.flatMap((entry) => entryFindings(entry, `${label}:${entry.line}`, rulingsById));
}

function orphanFindings(rulings, entries, registerArg) {
  const known = new Set(entries.map(({ id }) => id));
  return rulings.flatMap((ruling) => [...(ruling.adopted ?? '').matchAll(DOCTRINE_CITATION)]
    .filter((match) => !known.has(Number(match[1])))
    .map((match) => formatFinding(`${registerArg}:${ruling.line}`, `DOCTRINE(D-${match[1]}) names no entry`)));
}

function citationCount(entries) {
  return entries.reduce((sum, { evidence, counterCases }) => sum + evidence.length + counterCases.length, 0);
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {Partial<typeof DEFAULT_DEPS>} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const resolved = { ...DEFAULT_DEPS, ...deps };
  if (argv.length !== 2) {
    io.stderr.write(USAGE);
    return EXIT_INVALID;
  }
  const [doctrineArg, registerArg] = argv;
  const missing = missingInput(argv, resolved);
  if (missing) {
    io.stdout.write(`${PREFIX}: ${missing}\n`);
    return EXIT_INVALID;
  }
  const { findings, doctrine } = lintFindings(doctrineArg, registerArg, resolved);
  for (const finding of findings) io.stdout.write(finding);
  if (findings.length > 0) return EXIT_INVALID;
  io.stdout.write(`${PREFIX}: ${doctrine.entries.length} entries, ${citationCount(doctrine.entries)} ruling citations — OK\n`);
  return EXIT_OK;
}
