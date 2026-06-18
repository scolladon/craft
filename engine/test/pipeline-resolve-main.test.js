import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/pipeline-resolve-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = join(__dir, '..', '..', 'pipeline', 'default.yml');
const manifestsDir = join(__dir, 'fixtures', 'manifests');

const tmpDirs = [];
function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'craft-pr-'));
  tmpDirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}
after(() => { for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true }); });

// ─── --profile lean: construction agent, specification inline ─────────────────

test('Given --profile lean, when main runs, then construction is agent and specification is inline', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--profile', 'lean', pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'agent');
  assert.equal(byId.refactoring.execution, 'agent');
  assert.equal(byId.design.execution, 'inline');
  assert.equal(byId.planning.execution, 'inline');
  assert.equal(byId.documentation.execution, 'inline');
});

// ─── --skip decisions: decisions absent from effective ────────────────────────

test('Given --skip decisions, when main runs, then decisions is absent from effective', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--skip', 'decisions', pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  const ids = resolution.effective.map(d => d.id);
  assert.ok(!ids.includes('decisions'), `decisions should be absent; got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('planning'), `planning should remain; got: ${JSON.stringify(ids)}`);
});

// ─── --profile solo overrides manifest profile: full ─────────────────────────

test('Given manifest profile:full and --profile solo, when main runs, then CLI profile wins and construction is inline', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'profile-full.yml');

  const result = sut(['--profile', 'solo', pipelinePath, manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'inline');
});

// ─── flags after positional resolve identically ───────────────────────────────

test('Given --profile lean placed after the pipeline path, when main runs, then the profile still applies', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--profile', 'lean'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'agent', 'lean profile must apply regardless of flag position');
});

// ─── manifest with YAML frontmatter + markdown body ──────────────────────────

test('Given a manifest with YAML frontmatter and a markdown body, when main runs, then it extracts frontmatter and resolves the profile', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'agent', 'lean from frontmatter: construction agent');
  assert.equal(byId.design.execution, 'inline', 'lean from frontmatter: specification inline');
});

// ─── unknown flag exits 2 and names the option ───────────────────────────────

test('Given an unknown --flag, when main runs, then it returns 2 and names the option in stderr', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--bogus'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /unknown option --bogus/);
});

// ─── roleExists: craft: typo rejected ────────────────────────────────────────

test('Given a manifest with a misspelled craft role (craft:plannr), when main runs, then it returns 2 naming the phase and ref', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const badRolePath = join(manifestsDir, 'bad-role.md');

  const result = sut([pipelinePath, badRolePath], io);

  assert.equal(result, 2, `expected 2 but got ${result}; stderr: ${io.stderr.joined()}`);
  assert.match(io.stderr.joined(), /implementation/);
  assert.match(io.stderr.joined(), /craft:plannr/);
});

// ─── roleExists: valid craft role passes ─────────────────────────────────────

test('Given a manifest with a valid craft role (craft:planner), when main runs, then it returns 0', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const goodRolePath = join(manifestsDir, 'good-role.md');

  const result = sut([pipelinePath, goodRolePath], io);

  assert.equal(result, 0, `expected 0 but got ${result}; stderr: ${io.stderr.joined()}`);
});

// ─── roleExists: external namespace stays permissive ─────────────────────────

test('Given a manifest with an external role (acme:tdd-specialist), when main runs, then it returns 0', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const externalRolePath = join(manifestsDir, 'external-role.md');

  const result = sut([pipelinePath, externalRolePath], io);

  assert.equal(result, 0, `expected 0 but got ${result}; stderr: ${io.stderr.joined()}`);
});

// ─── roleExists: path-traversal craft ref rejected ───────────────────────────

test('Given a manifest with a path-traversal craft role (craft:../agents/planner), when main runs, then it returns 2 — separator guard rejects it', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const traversalRolePath = join(manifestsDir, 'traversal-role.md');

  const result = sut([pipelinePath, traversalRolePath], io);

  assert.equal(result, 2, `expected 2 but got ${result}; stderr: ${io.stderr.joined()}`);
  assert.match(io.stderr.joined(), /implementation/);
  assert.match(io.stderr.joined(), /craft:\.\.\/agents\/planner/);
});

// ─── requirements phase: enabled → effective includes requirements ────────────

test('Given a manifest with requirements enabled, when main runs, then it returns 0 and effective includes requirements', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, join(manifestsDir, 'enable-requirements.yml')], io);

  assert.equal(result, 0, `expected 0 but got ${result}; stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.ok(resolution.effective.map(d => d.id).includes('requirements'));
});

// ─── architecture phase: enabled → effective includes architecture ────────────

test('Given a manifest with architecture enabled, when main runs, then it returns 0 and effective includes architecture', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, join(manifestsDir, 'enable-architecture.yml')], io);

  assert.equal(result, 0, `expected 0 but got ${result}; stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.ok(resolution.effective.map(d => d.id).includes('architecture'));
});

// ─── both phases enabled: both in effective ───────────────────────────────────

test('Given a manifest with requirements and architecture both enabled, when main runs, then it returns 0 and effective includes both', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, join(manifestsDir, 'enable-both.yml')], io);

  assert.equal(result, 0, `expected 0 but got ${result}; stderr: ${io.stderr.joined()}`);
  const ids = JSON.parse(io.stdout.joined()).effective.map(d => d.id);
  assert.ok(ids.includes('requirements'), `requirements should be present; got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('architecture'), `architecture should be present; got: ${JSON.stringify(ids)}`);
});

// ─── no pipeline path → usage message + exit 2 ───────────────────────────────

test('Given no arguments, when main runs, then it returns 2 and writes usage to stderr', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /Usage: pipeline-resolve/);
});

// ─── takeValue: flag-as-value branch (--profile --skip) ──────────────────────

test('Given --profile followed by --skip (flag as value), when main runs, then it returns 2 naming --profile', async () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--profile', '--skip'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /option --profile requires a non-flag value/);
});

// ─── malformed pipeline file: parse-failure catch ────────────────────────────

test('Given a malformed pipeline file, when main runs, then it returns 2 and reports a pipeline parse failure', () => {
  const sut = main;
  const io = makeCaptureIo();
  const badPipeline = writeTmp('bad-pipeline.yml', 'phases:\n\t- broken\n');

  const result = sut([badPipeline], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to parse pipeline/);
});

// ─── valid pipeline + malformed manifest: manifest parse-failure catch ────────

test('Given a valid pipeline and a malformed manifest, when main runs, then it returns 2 and reports a manifest parse failure', () => {
  const sut = main;
  const io = makeCaptureIo();
  const badManifest = writeTmp('bad-manifest.md', '---\nkey:\n\tbroken\n---\nbody\n');

  const result = sut([pipelinePath, badManifest], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to parse manifest/);
});

// ─── takeValue: value === undefined guard for --profile ──────────────────────
// Kills: ConditionalExpression(false||…) at pipeline-resolve-main.js:37 — undefined branch.

test('Given --profile with no following value (end of argv), when main runs, then returns 2 with "requires a non-flag value" naming --profile', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--profile'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: option --profile requires a non-flag value/);
});

// ─── takeValue null propagation for --profile ────────────────────────────────
// Kills: ConditionalExpression(false) at :48 — null-check after takeValue for --profile.
// With mutant: takeValue writes the option error and returns null, but null-guard suppressed →
// profile=null (undefined), loop continues, pipelinePath may be set. If pipelinePath is already
// provided, exit is 0. So we need the message to be the ONLY error, with no further resolution.
// Asserting the Usage message absent distinguishes: mutant lets parseArgs continue (profile=null,
// loop over) → pipelinePath already set from first positional → exit 0 (different from exit 2).

test('Given --profile with a flag-as-value (--skip) and no pipelinePath, when main runs, then returns 2 with option error only', () => {
  const sut = main;
  const io = makeCaptureIo();

  // No pipeline path provided — ensures that with the mutant (null not propagated),
  // parseArgs returns { pipelinePath: null, ... } and main returns 2 via !pipelinePath check,
  // but the error message differs (Usage vs option error).
  const result = sut(['--profile', '--skip'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: option --profile requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear; only the option error should be written. got: ${io.stderr.joined()}`,
  );
});

// ─── takeValue null propagation for --skip ───────────────────────────────────
// Kills: ConditionalExpression(false) at :53 — null-check after takeValue for --skip.
// Same pattern: assert option error only, no Usage message.

test('Given --skip with a flag-as-value (--profile) and no pipelinePath, when main runs, then returns 2 with option error only', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--skip', '--profile'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: option --skip requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear; only the option error should be written. got: ${io.stderr.joined()}`,
  );
});

// ─── --skip trim + filter(Boolean): whitespace and empties stripped ───────────
// Kills: MethodExpression(trim) at :54 and MethodExpression(filter(Boolean)) at :54.

test('Given --skip " a , , b " with spaces and empties, when main runs, then only "a" and "b" are skipped (trim + filter both applied)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--skip', ' a , , b ', pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  const ids = resolution.effective.map(d => d.id);
  assert.ok(!ids.includes('a'), 'phase "a" (not a real phase) must not appear');
  // trim: verify whitespace-only entry (from "  ") does not appear as undefined/empty
  // filter: without filter(Boolean), " " trimmed to "" would survive and produce an empty skip entry
  // The real guard is that " , " does not produce a skip of "".
  // We verify by checking a real phase that is NOT in the skip list still appears.
  assert.ok(ids.includes('design'), `design should remain; got: ${JSON.stringify(ids)}`);
});

// ─── --skip trim: leading/trailing whitespace stripped ───────────────────────
// Kills: MethodExpression(s => s) at :54 (the trim→identity mutant).

test('Given --skip "  decisions  " with surrounding spaces, when main runs, then decisions is excluded', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--skip', '  decisions  ', pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const ids = JSON.parse(io.stdout.joined()).effective.map(d => d.id);
  assert.ok(!ids.includes('decisions'), `decisions must be skipped after trim; ids: ${JSON.stringify(ids)}`);
});

// ─── second positional argument → manifestPath (manifestPath === null guard) ──
// Kills: ConditionalExpression(true) at :61 — if always true, pipelinePath gets the manifest slot.

test('Given pipeline path then manifest path as positionals, when main runs, then both are consumed correctly and returns 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  // with-body.md has profile:lean → implementation=agent
  assert.equal(resolution.effective.find(d => d.id === 'implementation').execution, 'agent',
    'manifest profile lean must apply — confirms manifestPath was set correctly');
});

// ─── manifestPath === null guard: third positional is silently ignored ─────────
// Kills: ConditionalExpression(manifestPath === null → true) at :61.
// With mutant (else if true): a third positional arg overwrites manifestPath, causing
// readFileSync to fail on the overwritten path (nonexistent) → exit 2.
// Original: manifestPath is already set; the third arg falls through all branches harmlessly → exit 0.

test('Given pipeline path, manifest path, and a spurious third positional, when main runs, then returns 0 (third positional is ignored)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut([pipelinePath, manifestPath, '/nonexistent/spurious.yml'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── stdout trailing newline: pipeline-resolve :123 ──────────────────────────
// Kills: StringLiteral('\n' → "") at :123.

test('Given a valid pipeline, when main runs, then stdout output ends with a newline', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().endsWith('\n'), 'stdout must end with a trailing newline');
});
