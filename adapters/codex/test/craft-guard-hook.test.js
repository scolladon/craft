import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'craft-guard.js');
const WORKING_DIR = '/repo';

const ADAPTER_DIR = join(dirname(HOOK), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const ALLOWED_PAYLOAD = execPayload('git diff --no-ext-diff');
// Skips `import(` and comment lines (they start with ` * ` or `//`).
const STATIC_IMPORT_LINE = /^\s*import\s[^(]/m;
const THROWING_STDIN_LISTENER =
  "process.stdin.once('data', () => { throw new RangeError('Invalid string length'); });";
const NEVER_ENDING_STDIN = 'process.stdin.destroy();';
const FLOATING_REJECTION = "Promise.reject(new Error('floating rejection'));";

// Copies hooks/ and src/ into a throwaway root; breakTree then removes or stubs one piece.
function withGuardCopy(breakTree, act, nodeArgs = []) {
  const root = mkdtempSync(join(tmpdir(), 'craft-guard-crash-'));
  try {
    const adapterCopy = join(root, 'adapters', 'codex');
    for (const dir of ['hooks', 'src']) {
      cpSync(join(ADAPTER_DIR, dir), join(adapterCopy, dir), { recursive: true });
    }
    breakTree({ root, adapterCopy });
    const guard = join(adapterCopy, 'hooks', 'craft-guard.js');
    return act(spawnSync(process.execPath, [...nodeArgs, guard], { input: ALLOWED_PAYLOAD, encoding: 'utf8' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// engine/bin present so resolveCraftRoot passes; engine/src absent so the predicate import fails.
function withoutEngineSources({ root }) {
  mkdirSync(join(root, 'engine', 'bin'), { recursive: true });
}

// Every import resolves through the symlinked engine; the stub runs `body` then returns a root.
function stubbedCraftRoot(body) {
  return ({ root, adapterCopy }) => {
    symlinkSync(join(REPO_ROOT, 'engine'), join(root, 'engine'));
    writeFileSync(
      join(adapterCopy, 'src', 'craft-root.js'),
      `export function resolveCraftRoot() { ${body} return '/'; }\n`,
    );
  };
}

// Spawns OUR hook script under `node`, never the real `codex` binary — the
// only permitted way to exercise a subprocess-exit-code contract.
function run(payload) {
  return spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
}

function execPayload(cmd) {
  return JSON.stringify({ cwd: WORKING_DIR, tool_name: 'exec_command', tool_input: { cmd } });
}

function patchPayload(...paths) {
  const lines = ['*** Begin Patch'];
  for (const path of paths) {
    lines.push(`*** Add File: ${path}`, '+x');
  }
  lines.push('*** End Patch');
  return JSON.stringify({
    cwd: WORKING_DIR,
    tool_name: 'apply_patch',
    tool_input: { input: lines.join('\n') },
  });
}

describe('craft-guard hook — enforcing exit-code contract', () => {
  it('Given a payload whose exec_command runs git diff, when the hook process runs, then it exits with code 2', () => {
    const sut = run(execPayload('git diff'));

    assert.equal(sut.status, 2);
  });

  it('Given a blocking payload, when the hook process runs, then the block reason appears on stderr and stdout is empty', () => {
    const sut = run(execPayload('git diff'));

    assert.match(sut.stderr, /--no-ext-diff/);
    assert.equal(sut.stdout, '');
  });

  it('Given a compliant payload, when the hook process runs, then it exits 0 and writes nothing to stdout', () => {
    const sut = run(execPayload('git diff --no-ext-diff'));

    assert.equal(sut.status, 0);
    assert.equal(sut.stdout, '');
  });

  it('Given a payload that is not valid JSON, when the hook process runs, then it exits 2', () => {
    const sut = run('{not json');

    assert.equal(sut.status, 2);
  });

  it('Given an apply_patch payload whose second hunk escapes the working dir, when the hook process runs, then it exits 2', () => {
    const sut = run(patchPayload(`${WORKING_DIR}/src/a.js`, '/etc/passwd'));

    assert.equal(sut.status, 2);
  });

  it('Given empty stdin, when the hook process runs, then it exits 2', () => {
    const sut = run('');

    assert.equal(sut.status, 2);
  });

  it('Given a blocking verdict carrying no reason, when the hook process runs, then stderr still carries a non-empty denial line', () => {
    const payload = JSON.stringify({
      cwd: WORKING_DIR,
      tool_name: 'apply_patch',
      tool_input: {},
    });

    const sut = run(payload);

    assert.equal(sut.status, 2);
    assert.match(sut.stderr, /craft-guard/);
    assert.notEqual(sut.stderr.trim(), '');
  });

  it('Given the hook source text, when scanned, then it contains no finally block', () => {
    const sourceText = readFileSync(HOOK, 'utf8');

    assert.doesNotMatch(sourceText, /\bfinally\b/);
  });
});

function assertDeniedOnStderr(sut, stderrPattern) {
  assert.equal(sut.status, 2);
  assert.match(sut.stderr, stderrPattern);
  assert.equal(sut.stdout, '');
}

describe('craft-guard hook — a crash still denies', () => {
  it('Given the hook source text, when scanned, then it has no static import statement', () => {
    const sourceText = readFileSync(HOOK, 'utf8');

    assert.doesNotMatch(sourceText, STATIC_IMPORT_LINE);
  });

  it('Given a guard copy whose engine predicate cannot be resolved, when the hook process runs, then it exits 2 naming the missing module on stderr', () => {
    const sut = withGuardCopy(withoutEngineSources, (result) => result);

    assertDeniedOnStderr(sut, /^craft-guard: .*tool-call-guard/m);
  });

  it('Given a guard copy whose stdin listener throws, when the hook process runs, then it exits 2 with the error on stderr', () => {
    const sut = withGuardCopy(stubbedCraftRoot(THROWING_STDIN_LISTENER), (result) => result);

    assertDeniedOnStderr(sut, /^craft-guard: Invalid string length$/m);
  });

  it('Given a guard copy that leaves a promise rejection unhandled under the warn rejection mode, when the hook process runs, then it exits 2 with the rejection on stderr', () => {
    const sut = withGuardCopy(stubbedCraftRoot(FLOATING_REJECTION), (result) => result, [
      '--unhandled-rejections=warn',
    ]);

    assertDeniedOnStderr(sut, /^craft-guard: floating rejection$/m);
  });

  it('Given a guard copy whose stdin never ends, when the event loop drains, then it exits 2 with the fail-closed reason', () => {
    const sut = withGuardCopy(stubbedCraftRoot(NEVER_ENDING_STDIN), (result) => result);

    assertDeniedOnStderr(sut, /^craft-guard: denied \(fail-closed\)$/m);
  });
});
