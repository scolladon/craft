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
