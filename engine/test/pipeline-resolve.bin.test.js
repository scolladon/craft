import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dir, '..', 'bin', 'pipeline-resolve.js');
const pipelinePath = join(__dir, '..', '..', 'pipeline', 'default.yml');
const manifestsDir = join(__dir, 'fixtures', 'manifests');

function run(...args) {
  return spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8' });
}

// ─── --profile lean: construction & refinement agent, specification & delivery inline ───

test('Given --profile lean flag, when pipeline-resolve runs, then construction and refinement phases are agent and specification and delivery are inline', () => {
  const sut = run;

  const result = sut('--profile', 'lean', pipelinePath);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  // construction → agent
  assert.equal(byId.implementation.execution, 'agent');
  // refinement → agent
  assert.equal(byId.refactoring.execution, 'agent');
  // specification → inline
  assert.equal(byId.design.execution, 'inline');
  assert.equal(byId.planning.execution, 'inline');
  // delivery → inline
  assert.equal(byId.documentation.execution, 'inline');
});

// ─── --skip decisions: decisions absent from effective ────────────────────────

test('Given --skip decisions flag, when pipeline-resolve runs, then decisions is absent from effective', () => {
  const sut = run;

  const result = sut('--skip', 'decisions', pipelinePath);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.equal(resolution.ok, true);
  const ids = resolution.effective.map(d => d.id);
  assert.ok(!ids.includes('decisions'), `decisions should be absent; got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('planning'), `planning should remain; got: ${JSON.stringify(ids)}`);
});

// ─── --profile solo overrides manifest profile: full ─────────────────────────

test('Given a manifest with profile: full and --profile solo flag, when pipeline-resolve runs, then CLI profile wins', () => {
  const sut = run;
  const manifestPath = join(manifestsDir, 'profile-full.yml');

  const result = sut('--profile', 'solo', pipelinePath, manifestPath);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  // solo: construction → inline; full: construction → agent — CLI must win
  assert.equal(byId.implementation.execution, 'inline');
});

// ─── flags AFTER the positional pipeline path resolve identically (order-independent) ───

test('Given --profile lean placed after the pipeline path, when pipeline-resolve runs, then the profile still applies (construction agent)', () => {
  const sut = run;

  const result = sut(pipelinePath, '--profile', 'lean');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'agent', 'lean profile must apply regardless of flag position');
});

// ─── a real workflow.md (frontmatter + markdown body) resolves ───────────────

test('Given a manifest with YAML frontmatter and a markdown body, when pipeline-resolve runs, then it extracts the frontmatter and resolves the declared profile', () => {
  const sut = run;
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut(pipelinePath, manifestPath);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.equal(resolution.ok, true);
  const byId = Object.fromEntries(resolution.effective.map(d => [d.id, d]));
  assert.equal(byId.implementation.execution, 'agent', 'lean from frontmatter: construction agent');
  assert.equal(byId.design.execution, 'inline', 'lean from frontmatter: specification inline');
});

// ─── unknown flag is rejected loudly ─────────────────────────────────────────

test('Given an unknown --flag, when pipeline-resolve runs, then it exits 2 and names the option', () => {
  const sut = run;

  const result = sut(pipelinePath, '--bogus');

  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option --bogus/);
});

// ─── roleExists: craft: typo rejected ────────────────────────────────────────

test('Given a manifest with a misspelled craft role (craft:plannr), when pipeline-resolve runs, then it exits 2 naming the phase and ref', () => {
  const sut = run;
  const badRolePath = join(manifestsDir, 'bad-role.md');

  const result = sut(pipelinePath, badRolePath);

  assert.equal(result.status, 2, `expected exit 2 but got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /implementation/);
  assert.match(result.stderr, /craft:plannr/);
});

// ─── roleExists: valid craft role passes ─────────────────────────────────────
// (jointly load-bearing with the bad-role test above: exit 0 here discriminates a
//  resolvable craft ref from "always permissive" only in concert with bad-role's exit-2)

test('Given a manifest with a valid craft role (craft:planner), when pipeline-resolve runs, then it exits 0', () => {
  const sut = run;
  const goodRolePath = join(manifestsDir, 'good-role.md');

  const result = sut(pipelinePath, goodRolePath);

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}; stderr: ${result.stderr}`);
});

// ─── roleExists: unregistered external ref fails closed ──────────────────────
// (an external role that no extends registration names is rejected at resolution —
//  the child-process twin of the in-process fail-closed assertion; the permissive
//  external branch is gone)

test('Given a manifest with an unregistered external role (acme:tdd-specialist), when pipeline-resolve runs, then it exits 2 — fail-closed', () => {
  const sut = run;
  const externalRolePath = join(manifestsDir, 'external-role.md');

  const result = sut(pipelinePath, externalRolePath);

  assert.equal(result.status, 2, `expected exit 2 but got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /implementation/);
  assert.match(result.stderr, /acme:tdd-specialist/);
});

// ─── roleExists: path-traversal ref rejected before the existence probe ───────
// (craft:../agents/planner resolves to the real agents/planner.md via traversal;
//  WITHOUT the separator guard the existence probe would falsely satisfy it. The
//  guard must reject any craft: ref whose name carries a path separator.)

test('Given a manifest with a path-traversal craft role (craft:../agents/planner), when pipeline-resolve runs, then it exits 2 — the separator guard rejects it before the existence probe', () => {
  const sut = run;
  const traversalRolePath = join(manifestsDir, 'traversal-role.md');

  const result = sut(pipelinePath, traversalRolePath);

  assert.equal(result.status, 2, `expected exit 2 but got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /implementation/);
  assert.match(result.stderr, /craft:\.\.\/agents\/planner/);
});

// ─── requirements phase: agent resolves → effective includes requirements ─────

test('Given a manifest with requirements enabled, when pipeline-resolve runs, then it exits 0 and effective includes requirements', () => {
  const sut = run;

  const result = sut(pipelinePath, join(manifestsDir, 'enable-requirements.yml'));

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}; stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.ok(resolution.effective.map(d => d.id).includes('requirements'));
});

// ─── architecture phase: agent resolves → effective includes architecture ─────

test('Given a manifest with architecture enabled, when pipeline-resolve runs, then it exits 0 and effective includes architecture', () => {
  const sut = run;

  const result = sut(pipelinePath, join(manifestsDir, 'enable-architecture.yml'));

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}; stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  assert.ok(resolution.effective.map(d => d.id).includes('architecture'));
});

// ─── both phases enabled together: both agents resolve → effective includes both ─

test('Given a manifest with requirements and architecture both enabled, when pipeline-resolve runs, then it exits 0 and effective includes both', () => {
  const sut = run;

  const result = sut(pipelinePath, join(manifestsDir, 'enable-both.yml'));

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}; stderr: ${result.stderr}`);
  const ids = JSON.parse(result.stdout).effective.map(d => d.id);
  assert.ok(ids.includes('requirements'), `requirements should be present; got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('architecture'), `architecture should be present; got: ${JSON.stringify(ids)}`);
});

// ─── roleExists bin twins: registered-role → exit 0, unregistered-role → exit 2 ─

test('Given a manifest registering acme:bench-runner via extends.agents and using it as implementation role (registered-role.md), when pipeline-resolve runs, then it exits 0', () => {
  const sut = run;
  const registeredRolePath = join(manifestsDir, 'registered-role.md');

  const result = sut(pipelinePath, registeredRolePath);

  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}; stderr: ${result.stderr}`);
});

test('Given a manifest with extends block not registering acme:plannr (unregistered-role.md), when pipeline-resolve runs, then it exits 2 naming the phase and ref', () => {
  const sut = run;
  const unregisteredRolePath = join(manifestsDir, 'unregistered-role.md');

  const result = sut(pipelinePath, unregisteredRolePath);

  assert.equal(result.status, 2, `expected exit 2 but got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /implementation/);
  assert.match(result.stderr, /acme:plannr/);
});

// ─── end-to-end: --harness flows through Layer A+B ───────────────────────────

test('Given --harness review.passes=2, when pipeline-resolve runs, then effective review has passes=2 and reviewPlan.passes=2', () => {
  const sut = run;

  const result = sut(pipelinePath, '--harness', 'review.passes=2');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  const review = resolution.effective.find(d => d.id === 'review');
  assert.equal(review.harness.passes, 2);
  assert.equal(review.harness.reviewPlan.passes, 2);
});

test('Given --harness review.convergence=2, when pipeline-resolve runs, then effective review has reviewPlan.stop_rule="non-low-count<=2"', () => {
  const sut = run;

  const result = sut(pipelinePath, '--harness', 'review.convergence=2');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const resolution = JSON.parse(result.stdout);
  const review = resolution.effective.find(d => d.id === 'review');
  assert.equal(review.harness.reviewPlan.stop_rule, 'non-low-count<=2');
});
