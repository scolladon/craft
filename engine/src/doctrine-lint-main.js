/**
 * `doctrine-lint` — the doctrine file gate: entry form, citation resolution against the
 * ADR directory, and orphan `DOCTRINE(D-<n>)` citations inside ADRs.
 */

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDoctrine } from './doctrine.js';
import { isDirectoryPath, isRegularFile } from './cli-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const USAGE = 'usage: doctrine-lint <doctrine-file> <adr-dir>\n';
const PREFIX = 'doctrine-lint';
const ADR_EXTENSION = '.md';
const DOCTRINE_CITATION = /DOCTRINE\(D-(\d+)\)/g;
const SUPERSEDED_STATUS = '- **Status:** superseded';

const DEFAULT_DEPS = {
  readFile: (p) => readFileSync(p, 'utf8'),
  listDir: readdirSync,
  isFile: isRegularFile,
  isDirectory: isDirectoryPath,
  isRegularEntry: (p) => lstatSync(p).isFile(),
  cwd: () => process.cwd(),
};

function missingInput(doctrineArg, adrArg, deps) {
  if (!deps.isFile(resolve(deps.cwd(), doctrineArg))) return `no such file ${doctrineArg}`;
  if (!deps.isDirectory(resolve(deps.cwd(), adrArg))) return `no such directory ${adrArg}`;
  return null;
}

function lintFindings(doctrineArg, adrArg, deps) {
  const adrDir = resolve(deps.cwd(), adrArg);
  const names = deps.listDir(adrDir)
    .filter((name) => name.endsWith(ADR_EXTENSION) && deps.isRegularEntry(resolve(adrDir, name)))
    .sort();
  const readAdr = (name) => deps.readFile(resolve(adrDir, name));
  const doctrine = parseDoctrine(deps.readFile(resolve(deps.cwd(), doctrineArg)));
  const findings = [
    ...doctrine.errors.map((error) => formatFinding(`${doctrineArg}:${error.line}`, error.message)),
    ...citationFindings(doctrine.entries, doctrineArg, names, readAdr),
    ...orphanFindings(names, doctrine.entries, adrArg, readAdr),
  ];
  return { findings, doctrine };
}

function formatFinding(label, message) {
  return `${PREFIX}: ${label}: ${message}\n`;
}

function hasIdPrefix(name, id) {
  return name.startsWith(`${id}-`);
}

function isSuperseded(content) {
  return content.split('\n').some((line) => line.trim().startsWith(SUPERSEDED_STATUS));
}

function citationProblem(id, names, readAdr) {
  const matches = names.filter((name) => hasIdPrefix(name, id));
  if (matches.length !== 1) return `ADR-${id} does not resolve`;
  return isSuperseded(readAdr(matches[0])) ? `ADR-${id} is superseded` : null;
}

function entryFindings(entry, label, names, readAdr) {
  return [...entry.evidence, ...entry.counterCases]
    .map((id) => citationProblem(id, names, readAdr))
    .filter((problem) => problem !== null)
    .map((problem) => formatFinding(label, `D-${entry.id}: ${problem}`));
}

function citationFindings(entries, label, names, readAdr) {
  return entries.flatMap((entry) => entryFindings(entry, `${label}:${entry.line}`, names, readAdr));
}

function orphanFindings(names, entries, adrArg, readAdr) {
  const known = new Set(entries.map(({ id }) => id));
  return names.flatMap((name) => [...readAdr(name).matchAll(DOCTRINE_CITATION)]
    .filter((match) => !known.has(Number(match[1])))
    .map((match) => formatFinding(`${adrArg}/${name}`, `DOCTRINE(D-${match[1]}) names no entry`)));
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
  const [doctrineArg, adrArg] = argv;
  const missing = missingInput(doctrineArg, adrArg, resolved);
  if (missing) {
    io.stdout.write(`${PREFIX}: ${missing}\n`);
    return EXIT_INVALID;
  }
  const { findings, doctrine } = lintFindings(doctrineArg, adrArg, resolved);
  for (const finding of findings) io.stdout.write(finding);
  if (findings.length > 0) return EXIT_INVALID;
  io.stdout.write(`${PREFIX}: ${doctrine.entries.length} entries, ${citationCount(doctrine.entries)} ADR citations — OK\n`);
  return EXIT_OK;
}
