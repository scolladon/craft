'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'readme-drift.sh');

const README_PATH = path.join(ROOT, 'README.md');
const PIPELINE_PATH = path.join(ROOT, 'pipeline', 'default.yml');
const REPORT_PATH = path.join(ROOT, 'docs', 'contributing', 'metrics-baseline.report.json');

function runDrift(rootArg) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, rootArg], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return {
      status: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

/**
 * Copy the three real drift-guard inputs into a fresh throwaway root, let
 * `mutateFn` corrupt exactly one of them, run the guard against the copy,
 * then always clean up — even when an assertion inside `mutateFn` throws.
 * @param {(paths: {readmePath: string, pipelinePath: string, reportPath: string}) => void} mutateFn
 */
function withMutatedCopy(mutateFn) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-drift-'));
  try {
    fs.mkdirSync(path.join(tmpRoot, 'pipeline'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'docs', 'contributing'), { recursive: true });
    const paths = {
      readmePath: path.join(tmpRoot, 'README.md'),
      pipelinePath: path.join(tmpRoot, 'pipeline', 'default.yml'),
      reportPath: path.join(tmpRoot, 'docs', 'contributing', 'metrics-baseline.report.json'),
    };
    fs.copyFileSync(README_PATH, paths.readmePath);
    fs.copyFileSync(PIPELINE_PATH, paths.pipelinePath);
    fs.copyFileSync(REPORT_PATH, paths.reportPath);

    mutateFn(paths);

    return runDrift(tmpRoot);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function renameEnabledPhaseId({ pipelinePath }) {
  const original = fs.readFileSync(pipelinePath, 'utf8');
  const mutated = original.replace('- id: review\n', '- id: review-renamed\n');
  assert.notStrictEqual(mutated, original, 'fixture must still contain "- id: review"');
  fs.writeFileSync(pipelinePath, mutated);
}

function injectUnknownReadmeManifestKey({ readmePath }) {
  const original = fs.readFileSync(readmePath, 'utf8');
  const mutated = original.replace('```yaml\npipeline:', '```yaml\nunknown-key: true\npipeline:');
  assert.notStrictEqual(mutated, original, 'fixture must still contain the README yaml block');
  fs.writeFileSync(readmePath, mutated);
}

/** The run contributing the upper of the two central order statistics for an
 * even-sized, duration-bearing hours sample — mirrors the median math in
 * `telemetry-claims.js` so the mutation reliably shifts the rounded median. */
function upperMedianRun(report) {
  const totalHours = (run) => run.groups.reduce((total, group) => total + group.durationMs, 0) / 3_600_000;
  const pairs = report.runs
    .map((run) => ({ run, hours: totalHours(run) }))
    .filter((pair) => pair.hours > 0)
    .sort((a, b) => a.hours - b.hours);
  return pairs[Math.floor(pairs.length / 2)].run;
}

function bumpTelemetryDuration({ reportPath }) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const targetRun = upperMedianRun(report);
  const largestGroup = targetRun.groups.reduce((a, b) => (a.durationMs > b.durationMs ? a : b));
  largestGroup.durationMs = Math.floor(largestGroup.durationMs / 1000);
  fs.writeFileSync(reportPath, JSON.stringify(report));
}

// ---------------------------------------------------------------------------
// Live-tree pass
// ---------------------------------------------------------------------------

test(
  'Given the live repo tree, when readme-drift runs, then it exits 0 with no findings',
  () => {
    const result = runDrift(ROOT);
    assert.strictEqual(result.status, 0, `Expected clean exit, got:\n${result.output}`);
  },
);

// ---------------------------------------------------------------------------
// Mutated-copy failures
// ---------------------------------------------------------------------------

test(
  'Given an enabled phase id renamed in pipeline/default.yml, when readme-drift runs, then it exits non-zero and reports a phase-names drift',
  () => {
    const result = withMutatedCopy(renameEnabledPhaseId);
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.output.includes('phase-names'), `Expected 'phase-names' in output:\n${result.output}`);
  },
);

test(
  'Given an unknown key injected into the README yaml block, when readme-drift runs, then it exits non-zero and reports a manifest-snippet drift',
  () => {
    const result = withMutatedCopy(injectUnknownReadmeManifestKey);
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.output.includes('manifest-snippet'), `Expected 'manifest-snippet' in output:\n${result.output}`);
  },
);

test(
  'Given a bumped durationMs in the telemetry report, when readme-drift runs, then it exits non-zero and reports a telemetry drift',
  () => {
    const result = withMutatedCopy(bumpTelemetryDuration);
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.output.includes('telemetry'), `Expected 'telemetry' in output:\n${result.output}`);
  },
);
