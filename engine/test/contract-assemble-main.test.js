import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/contract-assemble-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const manifestsDir = join(__dir, 'fixtures', 'manifests');
const contractsDir = join(__dir, '..', '..', 'contracts');

const tmpDirs = [];
function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'craft-ca-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => { for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true }); });

// ─── agent mode: core markers present ────────────────────────────────────────

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains core markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker "never commit on a red gate" must be present');
  assert.ok(io.stdout.joined().includes('Blocker protocol'), 'core marker "Blocker protocol" must be present');
  assert.ok(io.stdout.joined().includes('provenance'), 'core marker "provenance" must be present');
  assert.ok(io.stdout.joined().includes('suppression'), 'core marker "suppression" must be present');
  assert.ok(io.stdout.joined().includes('Bounded scope'), 'core marker "Bounded scope" must be present');
});

// ─── agent mode: producer markers present ────────────────────────────────────

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains producer markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('template'), 'producer marker "template" must be present');
  assert.ok(io.stdout.joined().includes('Decision-candidates'), 'producer marker "Decision-candidates" must be present');
  assert.ok(io.stdout.joined().includes('convergence'), 'producer marker "convergence" must be present');
  assert.ok(io.stdout.joined().includes('mktemp'), 'producer marker "mktemp" must be present');
});

// ─── agent mode: agent carve-outs (not the inline variants) ──────────────────

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains agent-mode carve-outs', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes('the agent commit is the handoff'),
    'agent-mode artifact-handoff must be present',
  );
  assert.ok(
    io.stdout.joined().includes('the role model resolved'),
    'agent-mode model-resolution must be present',
  );
});

// ─── inline mode: inline carve-out variant present ───────────────────────────

test('Given --descriptor-id design --inline, when main runs, then stdout contains "the session model"', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--inline'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('the session model'), 'inline carve-out "the session model" must be present');
  assert.ok(
    !io.stdout.joined().includes('the role model resolved'),
    'inline mode must NOT also emit the agent-mode model variant',
  );
});

test('Given --descriptor-id design --inline, when main runs, then stdout contains inline commit handoff', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--inline'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes('the commit is the handoff (no agent context to lose)'),
    'inline artifact-handoff carve-out must be present',
  );
  assert.ok(
    !io.stdout.joined().includes('the agent commit is the handoff'),
    'inline mode must NOT also emit the agent-mode handoff variant',
  );
});

// ─── contract:[] descriptor (workspace): core only, still exits 0 ────────────

test('Given --descriptor-id workspace (contract:[]), when main runs, then exits 0 with core markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'workspace'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present for a contract:[] phase');
  assert.ok(io.stdout.joined().includes('Bounded scope'), 'core marker "Bounded scope" must be present');
});

// ─── unknown descriptor-id → exit 2 ──────────────────────────────────────────

test('Given --descriptor-id nonexistent-phase, when main runs, then returns 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'nonexistent-phase'], io);

  assert.equal(result, 2, 'Unknown descriptor-id must return 2');
  assert.ok(io.stderr.joined().length > 0, 'stderr must contain an error message');
});

// ─── missing --descriptor-id → exit 2 ────────────────────────────────────────

test('Given no --descriptor-id argument, when main runs, then returns 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 2, 'Missing --descriptor-id must return 2');
  assert.match(io.stderr.joined(), /Usage: contract-assemble/);
});

// ─── flag-as-value: --manifest followed by another flag → exit 2 ─────────────

test('Given --manifest immediately followed by another flag, when main runs, then returns 2 naming --manifest', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--manifest', '--descriptor-id', 'design'], io);

  assert.equal(result, 2, 'a flag consumed as a value must return 2');
  assert.ok(io.stderr.joined().includes('--manifest'), `stderr should name the offending flag; got: ${io.stderr.joined()}`);
});

// ─── fenced manifest via --manifest: frontmatter-only parse ──────────────────

test('Given --descriptor-id design --manifest with-body.md, when main runs, then exits 0 with core markers', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut(['--descriptor-id', 'design', '--manifest', manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present');
});

// ─── manifest with context sentinels ─────────────────────────────────────────

test('Given --descriptor-id design --manifest with-context.md, when main runs, then context sentinels are injected and body sentinel absent', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-context.md');

  const result = sut(['--descriptor-id', 'design', '--manifest', manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('GLOBAL_CONTEXT_SENTINEL'), 'global context sentinel must be injected');
  assert.ok(io.stdout.joined().includes('DESIGN_CONTEXT_SENTINEL'), 'per-phase context sentinel must be injected for design descriptor');
  assert.ok(!io.stdout.joined().includes('BODY_SENTINEL'), 'body sentinel must NOT appear');
});

// ─── requirements descriptor (producer bundle) ───────────────────────────────

test('Given --descriptor-id requirements, when main runs, then exits 0 with producer markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'requirements'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('Decision-candidates'), 'producer marker "Decision-candidates" must be present');
  assert.ok(io.stdout.joined().includes('Fill the named template'), 'producer marker "Fill the named template" must be present');
  assert.ok(!io.stdout.joined().includes('triages findings'), 'harness-exec marker must NOT leak into the producer bundle');
});

// ─── architecture descriptor (harness-exec bundle) ───────────────────────────

test('Given --descriptor-id architecture, when main runs, then exits 0 with harness-exec markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'architecture'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('triages findings'), 'harness-exec marker "triages findings" must be present');
  assert.ok(io.stdout.joined().includes('Never weaken a test or rule to clear a finding'), 'harness-exec marker must be present');
  assert.ok(!io.stdout.joined().includes('Decision-candidates'), 'producer marker must NOT leak into the harness-exec bundle');
});

// ─── review descriptor (harness-read bundle) ─────────────────────────────────

test('Given --descriptor-id review, when main runs, then stdout contains harness-read markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'review'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('Read-only'), 'harness-read marker "Read-only" must be present');
  assert.ok(io.stdout.joined().includes('findings'), 'harness-read marker "findings" must be present');
  assert.ok(io.stdout.joined().includes('Zero findings'), 'harness-read marker "Zero findings" must be present');
});

// ─── --contracts-dir positive branch: explicit real dir resolves ─────────────

test('Given --contracts-dir pointing at the real contracts dir, when main runs, then it exits 0 with core markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--contracts-dir', contractsDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present');
});

// ─── --contracts-dir missing a fragment: loadFragments failure catch ─────────

test('Given --contracts-dir pointing at a dir missing fragments, when main runs, then it returns 2 and reports a fragment load failure', () => {
  const sut = main;
  const io = makeCaptureIo();
  const emptyDir = makeTmpDir();

  const result = sut(['--descriptor-id', 'design', '--contracts-dir', emptyDir], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to load contract fragments/);
});

// ─── malformed --manifest: manifest parse-failure catch ──────────────────────

test('Given a malformed --manifest, when main runs, then it returns 2 and reports a manifest parse failure', () => {
  const sut = main;
  const io = makeCaptureIo();
  const badManifest = join(makeTmpDir(), 'bad.md');
  writeFileSync(badManifest, '---\nkey:\n\tbroken\n---\nbody\n');

  const result = sut(['--descriptor-id', 'design', '--manifest', badManifest], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to parse manifest/);
});

// ─── takeValue: value === undefined guard → exit 2, no Usage fallthrough ─────
// Kills: ConditionalExpression(false) + LogicalOperator(&&) + ConditionalExpression(false||…)
// at contract-assemble-main.js:31, AND ConditionalExpression(false) at :42 (null-propagation
// for --descriptor-id). Both mutants allow the function to continue past the error, eventually
// printing "Usage:" which the strict absence assertion catches.

test('Given --descriptor-id at end of argv (no following value), when main runs, then returns 2 with option error only and no Usage message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /contract-assemble: option --descriptor-id requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear; only the option error should be written. got: ${io.stderr.joined()}`,
  );
});

// ─── takeValue: value.startsWith('--') guard → exit 2, no Usage fallthrough ──
// Kills: ConditionalExpression(false||…) → false and MethodExpression(endsWith) at :31.
// Also kills :42 null-propagation for --descriptor-id (same no-Usage assertion).

test('Given --descriptor-id followed by another --flag, when main runs, then returns 2 with option error only and no Usage message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', '--inline'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /contract-assemble: option --descriptor-id requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear; got: ${io.stderr.joined()}`,
  );
});

// ─── takeValue null propagation for --manifest ────────────────────────────────
// Kills: ConditionalExpression(false) at :42 and :47 — the null-check after takeValue.
// With mutant: takeValue still writes the option error and returns null, but the
// null-guard is suppressed so parseArgs continues, leaving manifestPath=null.
// After the loop, !descriptorId fires → Usage message is written to stderr too.
// Asserting the Usage message is absent distinguishes the two paths.

test('Given --manifest with no following value, when main runs, then returns 2 with option error only (no Usage message)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--manifest'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /contract-assemble: option --manifest requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear when parseArgs returns null early; got: ${io.stderr.joined()}`,
  );
});

// ─── takeValue null propagation for --contracts-dir ──────────────────────────
// Kills: ConditionalExpression(false) at :54 — the null-check after takeValue for --contracts-dir.
// The ConditionalExpression at :52 (arg === '--contracts-dir' → true) is killed separately
// by the "extra positional arg" test below. For :54: with mutant, parseArgs continues after
// the option error, leaving contractsDir at the default. !descriptorId fires → Usage written too.

test('Given --contracts-dir with no following value, when main runs, then returns 2 with option error only (no Usage message)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--contracts-dir'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /contract-assemble: option --contracts-dir requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear when parseArgs returns null early; got: ${io.stderr.joined()}`,
  );
});

// ─── else-if --contracts-dir guard: unknown positional arg is NOT treated as contracts-dir ──
// Kills: ConditionalExpression(arg === '--contracts-dir' → true) at :52.
// With mutant (else if true): any arg reaching that branch is treated as --contracts-dir;
// an extra trailing positional arg 'extra' consumes the next argv value as contractsDir,
// but since there is no next arg, takeValue writes the option error and returns null,
// making parseArgs return null → exit 2. Without mutant: 'extra' falls through all branches
// harmlessly and exit is 0.

test('Given --descriptor-id design with an extra trailing positional arg, when main runs, then returns 0 (unknown positional is silently ignored)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', 'extraarg'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── for-loop boundary: i < vs i <= argv.length ──────────────────────────────
// Kills: EqualityOperator (<= at :38) which reads argv[argv.length] = undefined, treating the
// last arg as a flag-needing-a-value and triggering a spurious error even on valid argv.

test('Given exactly one valid arg pair (--descriptor-id design), when main runs, then returns 0 not 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `boundary i<=length mutant would over-run and error; stderr: ${io.stderr.joined()}`);
});

// ─── unknown descriptor-id: full error message content ───────────────────────
// Kills: ConditionalExpression(!descriptor→false) + BlockStatement(empty) + both StringLiteral
// + ArrowFunction(()=>undefined) + join separator StringLiteral at :104-107.

test('Given --descriptor-id nonexistent-phase, when main runs, then stderr contains exact error format with known ids', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'nonexistent-phase'], io);

  assert.equal(result, 2);
  const stderr = io.stderr.joined();
  assert.match(stderr, /contract-assemble: unknown descriptor-id "nonexistent-phase"\./);
  assert.match(stderr, /Known ids: /);
  // The ids list uses ', ' separator — kills the join("") StringLiteral mutant.
  assert.ok(stderr.includes(', '), `Expected ", " separator in known-ids list; got: ${stderr}`);
  // The arrow d => d.id must return real ids, not undefined — kills ArrowFunction mutant.
  assert.ok(stderr.includes('design'), `Expected "design" in known ids; got: ${stderr}`);
  assert.ok(stderr.includes('planning'), `Expected "planning" in known ids; got: ${stderr}`);
  assert.ok(stderr.endsWith('\n'), 'Error message must end with newline');
});

// ─── stdout trailing newline: contract-assemble :141 ─────────────────────────
// Kills: StringLiteral('\n' → "") at :141.

test('Given --descriptor-id design, when main runs, then stdout output ends with a newline', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().endsWith('\n'), 'stdout must end with a trailing newline');
});

// ─── inline vs agent execution mode string ───────────────────────────────────
// Kills: StringLiteral('agent' → "") at :135 — without --inline the assembleContract
// call must receive execution:'agent', not execution:''.

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains agent-mode carve-out text', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  // "the role model resolved" is injected only when execution==='agent'; empty string → wrong branch.
  assert.ok(io.stdout.joined().includes('the role model resolved'), 'agent execution carve-out must be present for execution=agent');
});

// ─── inline mode does not produce agent carve-out (complementary side) ───────
// Confirms 'inline' execution string propagates correctly.

test('Given --descriptor-id design --inline, when main runs, then stdout does NOT contain agent-only carve-out text', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--inline'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('the role model resolved'), 'agent carve-out must be absent in inline mode');
});

// ─── --descriptor-json flag: registered id resolves, exits 0 with core + harness-exec markers ──

test('Given --descriptor-id bench --descriptor-json with bench descriptor (contract:[harness-exec]), when main runs, then exits 0 with core and harness-exec bundle markers', () => {
  const sut = main;
  const io = makeCaptureIo();
  const tmpDir = makeTmpDir();
  const jsonPath = join(tmpDir, 'descriptors.json');
  writeFileSync(jsonPath, JSON.stringify([
    { id: 'bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  ]));

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', jsonPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present');
  assert.ok(io.stdout.joined().includes('triages findings'), 'harness-exec marker must be present');
});

// ─── --descriptor-json flag: namespaced colon id accepted and matched ─────────

test('Given --descriptor-id acme:bench --descriptor-json with acme:bench descriptor, when main runs, then exits 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const tmpDir = makeTmpDir();
  const jsonPath = join(tmpDir, 'descriptors.json');
  writeFileSync(jsonPath, JSON.stringify([
    { id: 'acme:bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  ]));

  const result = sut(['--descriptor-id', 'acme:bench', '--descriptor-json', jsonPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present for namespaced id');
});

// ─── default path byte-unchanged: --descriptor-id design without --descriptor-json ──

test('Given --descriptor-id design WITHOUT --descriptor-json flag, when main runs, then exits 0 with core and producer markers (default path unchanged)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present on default path');
  assert.ok(io.stdout.joined().includes('Decision-candidates'), 'producer marker must be present on default path');
});

// ─── --descriptor-json flag: id in neither JSON set nor defaults → STOP ─────

test('Given --descriptor-id ghost --descriptor-json with no ghost descriptor, when main runs, then exits 2 with unknown descriptor-id error', () => {
  const sut = main;
  const io = makeCaptureIo();
  const tmpDir = makeTmpDir();
  const jsonPath = join(tmpDir, 'descriptors.json');
  writeFileSync(jsonPath, JSON.stringify([
    { id: 'bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  ]));

  const result = sut(['--descriptor-id', 'ghost', '--descriptor-json', jsonPath], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /unknown descriptor-id "ghost"/);
});

// ─── --descriptor-json: invalid JSON → exit 2, stderr names parse failure ────

test('Given --descriptor-json pointing at a file with invalid JSON, when main runs, then exits 2 with stderr matching /failed to parse --descriptor-json/', () => {
  const sut = main;
  const io = makeCaptureIo();
  const tmpDir = makeTmpDir();
  const jsonPath = join(tmpDir, 'bad.json');
  writeFileSync(jsonPath, '{not json');

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', jsonPath], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to parse --descriptor-json/);
});

// ─── --descriptor-json: nonexistent path → exit 2, stderr names read failure ─

test('Given --descriptor-json pointing at a nonexistent path, when main runs, then exits 2 with stderr matching /failed to read --descriptor-json/', () => {
  const sut = main;
  const io = makeCaptureIo();
  const nonexistentPath = join(tmpdir(), 'craft-no-such-file-' + Date.now() + '.json');

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', nonexistentPath], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to read --descriptor-json/);
});

// ─── --descriptor-json: null propagation for --descriptor-json flag ───────────
// Kills: ConditionalExpression(false) at contract-assemble-main.js:53 — the null-check
// after takeValue for --descriptor-json. With mutant, parseArgs continues after the
// option error, leaving descriptorJson=null, causing !descriptorId to fire → Usage written.

test('Given --descriptor-json with no following value, when main runs, then returns 2 with option error only (no Usage message)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-json'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /contract-assemble: option --descriptor-json requires a non-flag value/);
  assert.ok(
    !io.stderr.joined().includes('Usage:'),
    `Usage must not appear when parseArgs returns null early; got: ${io.stderr.joined()}`,
  );
});

// ─── readDescriptorJson: source !== '-' reads file content into a string ──────
// Kills: Survived StringLiteral at :94 (readFileSync(source, "") → returns Buffer).
// A test that uses the file path and asserts a content-dependent result kills the
// Buffer-vs-string distinction, because JSON.parse(Buffer) happens to work too.
// Instead: assert exit 0 and a SPECIFIC output content derived from the descriptor id.
// (The existing nonexistent-path test already hits the error path; this hits the success path
// and asserts that the id from the JSON is correctly matched and the contract is assembled.)

test('Given --descriptor-json pointing at a file with a valid descriptor, when main runs, then exits 0 and stdout contains the assembled contract', () => {
  const sut = main;
  const io = makeCaptureIo();
  const tmpDir = makeTmpDir();
  const jsonPath = join(tmpDir, 'valid.json');
  writeFileSync(jsonPath, JSON.stringify([
    { id: 'bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  ]));

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', jsonPath], io);

  assert.equal(result, 0, `expected exit 0; stderr: ${io.stderr.joined()}`);
  // The harness-exec bundle contains "triages findings" — content-dependent assertion
  assert.ok(io.stdout.joined().includes('triages findings'), 'harness-exec content must appear in stdout');
});

// ─── --descriptor-json: a single descriptor OBJECT (not an array) is wrapped and matched ──
// Kills the ArrayDeclaration mutant at contract-assemble-main.js:101 —
// `Array.isArray(parsed) ? parsed : [parsed]` → `: []`. A bare object must still resolve;
// `[]` would drop it and STOP "unknown descriptor-id". In-process via a temp FILE (the stdin
// twin lives in the child-process smoke file, which Stryker's perTest coverage cannot credit).
test('Given --descriptor-json pointing at a single descriptor object (not an array), when main runs, then it is wrapped and matched (exit 0)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const tmpDir = makeTmpDir();
  const jsonPath = join(tmpDir, 'single.json');
  writeFileSync(jsonPath, JSON.stringify(
    { id: 'bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  ));

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', jsonPath], io);

  assert.equal(result, 0, `single-object descriptor must resolve; stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('triages findings'), 'harness-exec content must appear in stdout');
});

// EQUIVALENT (mutation survivors) — readFileSync encoding `'utf8'` → `''` at
// contract-assemble-main.js:93:36 (stdin), :94:30 (file), :150:67 (default.yml).
// `readFileSync(path, '')` returns a Buffer; JSON.parse(Buffer) and js-yaml load(Buffer) both
// coerce the bytes to the identical string before parsing — no observable behaviour change, so
// no test can distinguish the mutant. (Verified: JSON.parse(Buffer.from('[{"id":"x"}]')) deep-equals
// JSON.parse('[{"id":"x"}]').)
