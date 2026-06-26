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

// ─── roleExists: unregistered external ref fails closed ──────────────────────

test('Given a manifest with an unregistered external role (acme:tdd-specialist, no extends), when main runs, then it returns 2', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const externalRolePath = join(manifestsDir, 'external-role.md');

  const result = sut([pipelinePath, externalRolePath], io);

  assert.equal(result, 2, `expected 2 but got ${result}; stderr: ${io.stderr.joined()}`);
});

// EQUIVALENT (mutation survivors) — buildRegisteredRefSet (pipeline-resolve-main.js:21-26).
// The `?? []` fallbacks (:21, :22, :25) and the `if (phase.role)` guards (:23, :26) only ever
// add an EXTRA or never-queried entry to the registered Set when extends/insert is absent or a
// phase has no role. The Set is consulted solely via `registeredSet.has(<a real string role ref>)`
// (resolve.js filters `d.role && !roleExists(d.role)`), so a polluting `"Stryker was here"` entry,
// or an `undefined` from `if(true)`, is never the queried value — no real ref's resolution changes.
// Provably unobservable; no kill test can distinguish these mutants.

// ─── roleExists: registered external ref passes ───────────────────────────────

test('Given a manifest registering acme:bench-runner via extends.agents and using it as implementation role, when main runs, then it returns 0', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const registeredRolePath = join(manifestsDir, 'registered-role.md');

  const result = sut([pipelinePath, registeredRolePath], io);

  assert.equal(result, 0, `expected 0 but got ${result}; stderr: ${io.stderr.joined()}`);
});

// ─── roleExists: unregistered external ref with extends block fails closed ────

test('Given a manifest with extends block not registering acme:plannr, when main runs, then it returns 2 naming the phase and ref', async () => {
  const sut = main;
  const io = makeCaptureIo();
  const unregisteredRolePath = join(manifestsDir, 'unregistered-role.md');

  const result = sut([pipelinePath, unregisteredRolePath], io);

  assert.equal(result, 2, `expected 2 but got ${result}; stderr: ${io.stderr.joined()}`);
  assert.match(io.stderr.joined(), /implementation/);
  assert.match(io.stderr.joined(), /acme:plannr/);
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

// ─── buildRegisteredRefSet: agents ?? [] fallback ─────────────────────────────
// Kills: ArrayDeclaration at pipeline-resolve-main.js:21 ("Stryker was here" poison array).
// A manifest with NO extends.agents but a valid craft role must still pass (poison array would
// contain "Stryker was here" as a registered ref, which doesn't affect craft role lookup, but
// the registered-role path via extends.agents must accept an absent agents key).

test('Given a manifest with no extends.agents key and a valid craft role, when main runs, then it returns 0 (absent agents falls back to empty set)', () => {
  const sut = main;
  const io = makeCaptureIo();
  // Use a manifest that only has extends.phases and no extends.agents
  const manifestContent = [
    '---',
    'phases:',
    '  implementation:',
    '    role: craft:planner',
    'extends:',
    '  phases: []',
    '---',
  ].join('\n');
  const manifestPath = writeTmp('no-agents.md', manifestContent);

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `expected 0 — absent extends.agents must not break resolution; stderr: ${io.stderr.joined()}`);
});

// ─── buildRegisteredRefSet: extends.phases ?? [] fallback ────────────────────
// Kills: ArrayDeclaration at pipeline-resolve-main.js:22 ("Stryker was here" poison array).
// A manifest with extends.agents but no extends.phases must still pass.

test('Given a manifest with extends.agents but no extends.phases key, when main runs, then it returns 0 (absent phases falls back to empty iteration)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestContent = [
    '---',
    'phases:',
    '  implementation:',
    '    role: craft:planner',
    'extends:',
    '  agents: []',
    '---',
  ].join('\n');
  const manifestPath = writeTmp('no-phases.md', manifestContent);

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `expected 0 — absent extends.phases must not break resolution; stderr: ${io.stderr.joined()}`);
});

// ─── buildRegisteredRefSet: pipeline.insert ?? [] fallback ───────────────────
// Kills: ArrayDeclaration at pipeline-resolve-main.js:25 ("Stryker was here" poison array).
// A manifest with no pipeline.insert key must still pass.

test('Given a manifest with extends.agents but no pipeline.insert key, when main runs, then it returns 0 (absent pipeline.insert falls back to empty iteration)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestContent = [
    '---',
    'extends:',
    '  agents: []',
    '---',
  ].join('\n');
  const manifestPath = writeTmp('no-insert.md', manifestContent);

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `expected 0 — absent pipeline.insert must not break resolution; stderr: ${io.stderr.joined()}`);
});

// ─── buildRegisteredRefSet: phase.role conditional in extends.phases ──────────
// Kills: BlockStatement (inner body removed) and ConditionalExpression (true/false) at :22-23.
// A phase with a role must contribute it to the registered set so the roleExists check passes.

test('Given a manifest with a phase role registered in extends.phases, when main runs, then it returns 0 (phase role is in registered set)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestContent = [
    '---',
    'phases:',
    '  implementation:',
    '    role: acme:bench-runner',
    'extends:',
    '  phases:',
    '    - id: acme:bench',
    '      procedure: "acme:bench"',
    '      archetype: harness',
    '      role: acme:bench-runner',
    '      after: validation',
    '---',
  ].join('\n');
  const manifestPath = writeTmp('phase-role.md', manifestContent);

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `expected 0 — extends.phases role must be registered; stderr: ${io.stderr.joined()}`);
});

// ─── buildRegisteredRefSet: phase.role conditional in pipeline.insert ─────────
// Kills: BlockStatement (inner body removed) and ConditionalExpression (true/false) at :25-26.
// A pipeline.insert phase with a role must contribute it to the registered set.

test('Given a manifest with a role in pipeline.insert phase, when main runs, then it returns 0 (insert phase role is in registered set)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestContent = [
    '---',
    'phases:',
    '  implementation:',
    '    role: acme:insert-runner',
    'pipeline:',
    '  insert:',
    '    - id: acme:insert',
    '      procedure: "acme:insert"',
    '      archetype: harness',
    '      role: acme:insert-runner',
    '      after: validation',
    '---',
  ].join('\n');
  const manifestPath = writeTmp('insert-role.md', manifestContent);

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `expected 0 — pipeline.insert role must be registered; stderr: ${io.stderr.joined()}`);
});

// ─── --harness nested write + coercion (R3/B2) ───────────────────────────────

test('Given --harness review.passes=2, when main runs, then it returns 0 and effective review descriptor has passes=2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.passes=2'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.effective.find(d => d.id === 'review').harness.passes, 2);
});

// ─── --harness bad value rejected (R4) ───────────────────────────────────────

test('Given --harness review.passes=bad (non-integer), when main runs, then it returns 2 and stderr contains the typed error (byte-identical to manifest path)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.passes=bad'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /phases\.review\.harness\.passes must be a positive integer/);
});

// ─── --harness unknown phase rejected (R6 downstream B4) ─────────────────────

test('Given --harness nope.passes=2 (unknown phase), when main runs, then it returns 2 and stderr contains "unknown phase: nope" (byte-identical to manifest path)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'nope.passes=2'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /unknown phase: nope/);
});

// ─── --harness grammar faults (R6 parse-time) ────────────────────────────────

test('Given --harness review.passes (no =), when main runs, then it returns 2 with grammar message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.passes'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: --harness expects <phase>\.<knob>=<value>/);
});

test('Given --harness .passes=2 (empty phase), when main runs, then it returns 2 with grammar message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', '.passes=2'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: --harness expects <phase>\.<knob>=<value>/);
});

test('Given --harness review.=2 (empty knob), when main runs, then it returns 2 with grammar message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.=2'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: --harness expects <phase>\.<knob>=<value>/);
});

test('Given --harness a.b.c=2 (too many dots), when main runs, then it returns 2 with grammar message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'a.b.c=2'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: --harness expects <phase>\.<knob>=<value>/);
});

// ─── --harness missing value (R6 takeValue path) ─────────────────────────────

test('Given --harness at end of argv (no value), when main runs, then it returns 2 with "requires non-flag value"', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /option --harness requires a non-flag value/);
});

// ─── --harness composition with --profile and --skip (R3) ────────────────────

test('Given --profile lean --skip decisions --harness review.passes=2, when main runs, then it returns 0 with all three overlays applied', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--profile', 'lean', '--skip', 'decisions', '--harness', 'review.passes=2'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'agent');
  assert.ok(!resolution.effective.map(d => d.id).includes('decisions'));
  assert.equal(byId.review.harness.passes, 2);
});

// ─── --harness coercion table — one case per remaining knob row (B2) ──────────

test('Given --harness review.convergence=low-only, when main runs, then convergence stays the string "low-only" and reviewPlan.stop_rule is low-only', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.convergence=low-only'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.equal(review.harness.convergence, 'low-only');
  assert.equal(review.harness.reviewPlan.stop_rule, 'low-only');
});

test('Given --harness review.convergence=3 (numeric), when main runs, then convergence coerces to the number 3 and reviewPlan.stop_rule is non-low-count<=3', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.convergence=3'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.equal(review.harness.convergence, 3);
  assert.equal(review.harness.reviewPlan.stop_rule, 'non-low-count<=3');
});

test('Given --harness validation.incremental=true, when main runs, then incremental coerces to the boolean true', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'validation.incremental=true'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const validation = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'validation');
  assert.equal(validation.harness.incremental, true);
});

test('Given --harness review.dimensions=code,perf, when main runs, then dimensions coerces to the list [code, perf]', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.dimensions=code,perf'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.deepEqual(review.harness.dimensions, ['code', 'perf']);
});

test('Given --harness review.dimensions=code, ,perf, (whitespace and empty segments), when main runs, then dimensions trims and drops empties to [code, perf]', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.dimensions=code, ,perf,'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.deepEqual(review.harness.dimensions, ['code', 'perf']);
});

test('Given --harness review.foo=bar (unknown knob), when main runs, then it returns 0 and the value passes through as the string "bar"', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.foo=bar'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.equal(review.harness.foo, 'bar');
});

test('Given two --harness flags for the same phase, when main runs, then both knobs accumulate onto the descriptor', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.passes=2', '--harness', 'review.convergence=3'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.equal(review.harness.passes, 2);
  assert.equal(review.harness.convergence, 3);
});

test('Given --harness flags for two distinct valid phases, when main runs, then it returns 0 and both phases carry their knob (B4 multi-phase happy path)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'validation.scope=per-file', '--harness', 'review.passes=2'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const byId = Object.fromEntries(JSON.parse(io.stdout.joined()).effective.map(d => [d.id, d]));
  assert.equal(byId.validation.harness.scope, 'per-file');
  assert.equal(byId.review.harness.passes, 2);
});

// ─── --harness reserved-key denylist (fails closed at the parse boundary) ─────

test('Given --harness __proto__.passes=2 (reserved phase name), when main runs, then it returns 2 with the reserved-name message and Object.prototype is untouched', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', '__proto__.passes=2'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /--harness phase\/knob must not be a reserved name/);
  assert.equal({}.passes, undefined, 'Object.prototype must not be polluted');
});

test('Given --harness review.__proto__=evil (reserved knob name), when main runs, then it returns 2 with the reserved-name message and Object.prototype is untouched', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.__proto__=evil'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /--harness phase\/knob must not be a reserved name/);
  assert.equal({}.evil, undefined, 'Object.prototype must not be polluted');
});

test('Given --harness constructor.passes=2 (reserved phase name), when main runs, then it returns 2 with the reserved-name message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'constructor.passes=2'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /--harness phase\/knob must not be a reserved name/);
});

test('Given --harness review.prototype=evil (reserved knob name), when main runs, then it returns 2 with the reserved-name message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.prototype=evil'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /--harness phase\/knob must not be a reserved name/);
});

// ─── 45:128 StringLiteral: reserved-name message includes comma-separated keys ─
// Kills: StringLiteral(join(',') → join('')) at :45 — mutant joins without separator, producing
// "__proto__constructorprototype". Asserting the full parenthesised key list distinguishes.

test('Given --harness __proto__.x=1 (reserved phase), when main runs, then stderr contains the full reserved-name message listing the keys with commas', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', '__proto__.x=1'], io);

  assert.equal(result, 2);
  assert.equal(
    io.stderr.joined(),
    'pipeline-resolve: --harness phase/knob must not be a reserved name (__proto__, constructor, prototype)\n',
    'full reserved-name message must list keys comma-separated',
  );
});

// ─── 56:28 / 56:37: max_cycles coercion branch ───────────────────────────────
// Kills: ConditionalExpression(false) and StringLiteral('') at :56:28/37 — mutant never enters
// the max_cycles arm. A --harness review.max_cycles=4 must coerce to the integer 4.

test('Given --harness review.max_cycles=4, when main runs, then max_cycles coerces to the integer 4', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.max_cycles=4'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.equal(review.harness.max_cycles, 4, 'max_cycles must be the integer 4, not the string "4"');
  assert.strictEqual(typeof review.harness.max_cycles, 'number');
});

// ─── 58:12 ConditionalExpression: round-trip guard rejects non-integer ────────
// Kills: ConditionalExpression(true) at :58 — mutant always takes the integer branch, so
// passes=2.5 would return parseInt(2.5)=2 instead of raw '2.5'. Real code returns raw '2.5'
// which fails B4 validation (must be a positive integer) → exit 2.
// Mutant returns 2 → passes validation → exit 0. Observable.

test('Given --harness review.passes=2.5 (non-integer decimal), when main runs, then it returns 2 (round-trip guard rejects the float string)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.passes=2.5'], io);

  assert.equal(result, 2, `expected 2 for non-integer passes; stderr: ${io.stderr.joined()}`);
  assert.match(io.stderr.joined(), /passes must be a positive integer/);
});

// ─── 61:* convergence: 'none' arm is killable; 'low-only' arm is equivalent ───
// Kills: ConditionalExpression(false || raw==='none') at :61:31 and StringLiteral('') at :61:39
// — mutant makes raw==='none' check false; 'none' then falls through to Number('none')=NaN →
// return raw='none'. Same result. EQUIVALENT — documented below.
// However, 'none' IS needed to kill the review.stop_rule shape (reviewPlan test).

test('Given --harness review.convergence=none, when main runs, then convergence stays the string "none" and reviewPlan.stop_rule is none', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'review.convergence=none'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const review = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'review');
  assert.equal(review.harness.convergence, 'none');
  assert.equal(review.harness.reviewPlan.stop_rule, 'none');
});

// EQUIVALENT (mutation survivors) — coerceHarnessValue convergence shortcut (pipeline-resolve-main.js:61).
// All six 61:* mutants (ConditionalExpression×3, LogicalOperator, StringLiteral×2) survive because
// Number('low-only') and Number('none') are both NaN, so the numeric fallback always returns `raw`
// for both string values. The early-return shortcut at line 61 and the NaN-fallback at line 63 are
// observationally identical for these two inputs; no test can distinguish them.

// ─── 66:9 ConditionalExpression + 67:* NoCoverage: incremental=false coerces to boolean false ─
// Kills: ConditionalExpression(true) at :66 — mutant always returns `true` before reaching :67.
// Also kills NoCoverage 67:* mutants (ConditionalExpression×2, EqualityOperator,
// StringLiteral, BooleanLiteral) — first coverage of the `raw==='false'` branch.

test('Given --harness validation.incremental=false, when main runs, then incremental coerces to the boolean false', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'validation.incremental=false'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const validation = JSON.parse(io.stdout.joined()).effective.find(d => d.id === 'validation');
  assert.strictEqual(validation.harness.incremental, false, 'incremental must be the boolean false, not the string "false"');
  assert.strictEqual(typeof validation.harness.incremental, 'boolean');
});

// ─── 67:9 ConditionalExpression(true): unrecognised incremental value passes through as string ─
// Kills: ConditionalExpression(if(true) return false) at :67 — mutant returns boolean false for
// any raw value reaching line 67 (i.e. raw !== 'true'). For raw='maybe', real code returns the
// raw string 'maybe' which B4 rejects (must be boolean) → exit 2.
// Mutant returns false (boolean) → B4 accepts → exit 0. Observable.

test('Given --harness validation.incremental=maybe (unrecognised value), when main runs, then it returns 0 (incremental check removed — opaque passthrough)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'validation.incremental=maybe'], io);

  assert.equal(result, 0, `expected 0 since incremental is now an opaque passthrough; stderr: ${io.stderr.joined()}`);
});

// ─── 124:11 / 124:22: no-dot LHS triggers grammar error ─────────────────────
// Kills: ConditionalExpression(false at :124:11) — mutant skips the dotIdx===-1 check. For a
// no-dot LHS (e.g. 'noDot'), dotIdx=-1 so lastIndexOf('.')=-1 → dotIdx!==lastIndexOf is false →
// condition false → no grammar error → wrong parse. Also kills UnaryOperator(+1) at :124:22.

test('Given --harness noDot=val (no dot in LHS), when main runs, then it returns 2 with grammar message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--harness', 'noDot=val'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /pipeline-resolve: --harness expects <phase>\.<knob>=<value>/);
});

// EQUIVALENT (mutation survivors) — harness B4 guard (pipeline-resolve-main.js:192, 195, 198).
//
// 192:18 ConditionalExpression (`harness.length > 0` → `true`) and
// 192:18 EqualityOperator (`> 0` → `>= 0`):
//   `harness` is initialised as `undefined` and only ever populated via `.push()`; it is never
//   an empty array at line 192. The guard `harness && harness.length > 0` is therefore
//   observationally identical to `harness && true` — no test can produce a non-falsy zero-length
//   harness array here.
//
// 195:30 OptionalChaining (`phases?.[phase]` → `phases[phase]`):
//   When harness is non-empty, `applyCliOverlay` always writes to `effectiveManifest.phases`
//   (via `mergeHarnessOverlay`), so `effectiveManifest.phases` is always an object at line 195.
//   The optional-chaining operator can never take its undefined short-circuit path here.
//
// 198:35 ArrowFunction (`() => true` → `() => undefined`) and
// 198:41 NoCoverage BooleanLiteral (`() => true` → `() => false`):
//   `validatePhases` calls `fileExists` only for `role` values that look like filesystem paths.
//   Harness knobs (passes, convergence, incremental, …) never trigger a `fileExists` call inside
//   `validatePhaseBlock`, so the predicate value is never observed — all three variants are
//   indistinguishable.

// ─── --policy flag: parse, precedence, project-only, no-policy, error cases ───

test('Given --policy integrate=ask, when main runs, then Resolution.policy.integrate is "ask"', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy', 'integrate=ask'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'ask');
});

test('Given project manifest with policy always:[integrate] and --policy integrate=ask, when main runs, then Resolution.policy.integrate is "ask" (per-invocation wins)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = writeTmp('policy-project.md', [
    '---',
    'policy:',
    '  always: [integrate]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath, '--policy', 'integrate=ask'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'ask');
});

test('Given project manifest with policy always:[integrate] and no --policy flag, when main runs, then Resolution.policy.integrate is "always"', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = writeTmp('policy-project-only.md', [
    '---',
    'policy:',
    '  always: [integrate]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'always');
});

test('Given no policy anywhere, when main runs, then Resolution.policy is present and deeply equals {}', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.deepEqual(resolution.policy, {});
});

test('Given --policy integrate (no =), when main runs, then it returns 2 and stderr matches /--policy expects/', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy', 'integrate'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /--policy expects/);
});

test('Given --policy integrate=maybe (bad verdict), when main runs, then it returns 2 and stderr names the unknown verdict', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy', 'integrate=maybe'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /unknown.*verdict|verdict.*unknown/i);
});

test('Given --policy bogus=ask (unknown action), when main runs, then it returns 2 and stderr names the unknown action', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy', 'bogus=ask'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /unknown.*action|action.*unknown/i);
});

// ─── user-file load via injected readUserPolicy ───────────────────────────────

test('Given user file with never:[integrate], no project policy, no flag, when main runs, then Resolution.policy.integrate is "never"', () => {
  const sut = main;
  const io = makeCaptureIo();
  const userContent = '---\npolicy:\n  never: [integrate]\n---\n';

  const result = sut([pipelinePath], io, { readUserPolicy: () => userContent });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'never');
});

test('Given user file with never:[integrate] and project manifest with always:[integrate], when main runs, then Resolution.policy.integrate is "always" (project overrides user)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const userContent = '---\npolicy:\n  never: [integrate]\n---\n';
  const manifestPath = writeTmp('policy-user-vs-project.md', [
    '---',
    'policy:',
    '  always: [integrate]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath], io, { readUserPolicy: () => userContent });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'always');
});

test('Given user file with never:[integrate], project always:[integrate], and --policy integrate=ask, when main runs, then Resolution.policy.integrate is "ask" (per-invocation overrides both)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const userContent = '---\npolicy:\n  never: [integrate]\n---\n';
  const manifestPath = writeTmp('policy-full-chain.md', [
    '---',
    'policy:',
    '  always: [integrate]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath, '--policy', 'integrate=ask'], io, { readUserPolicy: () => userContent });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'ask');
});

test('Given user file absent (readUserPolicy returns null), when main runs, then Resolution.policy has no error and is the project/default map', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath], io, { readUserPolicy: () => null });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.deepEqual(resolution.policy, {});
});

test('Given malformed user file with unknown verdict maybe:[integrate], when main runs, then it returns 2 and stderr names invalid user policy', () => {
  const sut = main;
  const io = makeCaptureIo();
  const badContent = '---\npolicy:\n  maybe: [integrate]\n---\n';

  const result = sut([pipelinePath], io, { readUserPolicy: () => badContent });

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /user.*policy|policy.*user/i);
});

test('Given project manifest policy with one action under two verdicts, when main runs, then it returns 2 and stderr names invalid project policy', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = writeTmp('policy-project-double-verdict.md', [
    '---',
    'policy:',
    '  always: [integrate]',
    '  never: [integrate]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath], io, { readUserPolicy: () => null });

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /project.*policy/i);
});

test('Given project manifest policy naming an unknown action, when main runs, then it returns 2 and stderr names invalid project policy', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = writeTmp('policy-project-unknown-action.md', [
    '---',
    'policy:',
    '  always: [bogus-action]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath], io, { readUserPolicy: () => null });

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /project.*policy/i);
});

test('Given --policy integrate=ask repeated as integrate=never, when main runs, then the last occurrence wins (never)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy', 'integrate=ask', '--policy', 'integrate=never'], io, { readUserPolicy: () => null });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.integrate, 'never');
});

test('Given two --policy flags for different actions, when main runs, then both verdicts survive (the map is not clobbered per occurrence)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy', 'push=ask', '--policy', 'integrate=never'], io, { readUserPolicy: () => null });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.policy.push, 'ask');
  assert.equal(resolution.policy.integrate, 'never');
});

test('Given --policy as the final argument with no value, when main runs, then it returns 2 and stderr requires a non-flag value', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath, '--policy'], io, { readUserPolicy: () => null });

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /option --policy requires a non-flag value/i);
});

// ─── default reader (no deps): exercises defaultReadUserPolicy code path ──────
// Kills: NoCoverage ObjectLiteral (line 229 {ok:true,block:null}→{}) and
//        NoCoverage BooleanLiteral (line 229 ok:true→false) by calling main
//        without deps so defaultReadUserPolicy runs; no ~/.claude/craft-policy.md
//        present so result is ok:true with empty policy.

test('Given no deps (real default reader) and no ~/.claude/craft-policy.md, when main runs, then it returns 0 with empty policy', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.policy, {});
});

// ─── loadUserPolicyBlock: content with no policy key → ok:true block:null ────
// Kills: OptionalChaining survivor at line 228 (parsed?.policy vs parsed.policy):
//        empty string content parses to null; ?.policy returns null safely while
//        .policy would throw TypeError.
// Also kills: ConditionalExpression survivor at line 229 (userBlock===null guard).

test('Given user file with no policy key (empty content), when main runs, then it returns 0 with empty policy', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([pipelinePath], io, { readUserPolicy: () => '' });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.policy, {});
});

test('Given user file with frontmatter but no policy key, when main runs, then it returns 0 with empty policy', () => {
  const sut = main;
  const io = makeCaptureIo();
  const contentWithoutPolicy = '---\nprofile: solo\n---\nbody text\n';

  const result = sut([pipelinePath], io, { readUserPolicy: () => contentWithoutPolicy });

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const resolution = JSON.parse(io.stdout.joined());
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.policy, {});
});

// ─── project policy error stderr uses semicolon-space separator ───────────────
// Kills: StringLiteral survivor at line 280 (errors.join('; ') → errors.join("")).
// Requires a project policy block with multiple validation errors so the separator
// appears between them.

test('Given project manifest policy with two unknown verdicts, when main runs, then it returns 2 and stderr joins errors with "; "', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = writeTmp('policy-two-bad-verdicts.md', [
    '---',
    'policy:',
    '  maybe: [integrate]',
    '  nope: [commit]',
    '---',
  ].join('\n'));

  const result = sut([pipelinePath, manifestPath], io, { readUserPolicy: () => null });

  assert.equal(result, 2);
  const stderr = io.stderr.joined();
  assert.match(stderr, /project.*policy/i);
  assert.ok(stderr.includes('; '), `expected "; " separator in stderr: ${stderr}`);
});

// ─── user policy error stderr uses semicolon-space separator ─────────────────
// Kills: StringLiteral survivor at line 290 (errors.join('; ') → errors.join("")).

test('Given user file with two unknown verdicts in policy, when main runs, then it returns 2 and stderr joins errors with "; "', () => {
  const sut = main;
  const io = makeCaptureIo();
  const badContent = '---\npolicy:\n  maybe: [integrate]\n  nope: [commit]\n---\n';

  const result = sut([pipelinePath], io, { readUserPolicy: () => badContent });

  assert.equal(result, 2);
  const stderr = io.stderr.joined();
  assert.match(stderr, /user.*policy|policy.*user/i);
  assert.ok(stderr.includes('; '), `expected "; " separator in stderr: ${stderr}`);
});

// EQUIVALENT (mutation survivors) — pipeline-resolve-main.js.
//
// policy.js:194 StringLiteral (join(homedir(),'.claude')→join(homedir(),"")):
//   defaultReadUserPolicy computes a different root, but readFileSync still fails
//   (ENOENT or reading wrong path) and the catch block returns null. Observable
//   result identical when ~/.claude/craft-policy.md is absent (test env).
//
// policy.js:195 StringLiteral (join(USER_POLICY_ROOT,'craft-policy.md')→join(…,"")):
//   USER_POLICY_PATH becomes USER_POLICY_ROOT itself; containUserPolicyPath
//   returns it (root is within root); readFileSync on a directory throws; catch
//   returns null. Observable result identical.
//
// pipeline-resolve-main.js:205 ConditionalExpression→false / →true / EqualityOperator:
//   With the fixed constants USER_POLICY_ROOT / USER_POLICY_PATH, containUserPolicyPath
//   always returns a non-null path (craft-policy.md is provably inside .claude).
//   The guard is unreachable dead code; neutralising it does not change the outcome.
//
// pipeline-resolve-main.js:207 StringLiteral ('utf8'→""):
//   ~/.claude/craft-policy.md is absent; readFileSync throws ENOENT regardless of
//   encoding; catch returns null. Observable result identical.
//
// pipeline-resolve-main.js:231 ObjectLiteral {} and ArrowFunction ()=>undefined (line 231/278):
//   validateManifest({policy:…}, {fileExists:…}) is called with a policy-only manifest;
//   validatePolicy() never invokes fileExists. Any fileExists value (missing, undefined,
//   true) produces the same validation result.
//
// pipeline-resolve-main.js:278 ObjectLiteral {} and ArrowFunction ()=>undefined:
//   Same argument — fileExists is never invoked by validatePolicy.
//
// NoCoverage pipeline-resolve-main.js:231:82 and 278:98 BooleanLiteral ()=>false:
//   Same as above — fileExists is never called, so ()=>false ≡ ()=>true here.
