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
const ALLOWED_PAYLOAD = bashPayload('git status');
// Every form ESM links before the body runs — `import … from`, a bare `import 'x'`, `export … from` —
// while skipping `import(`, `import.meta` and comment lines (they start with ` * ` or `//`).
const STATIC_IMPORT_LINE = /^\s*(?:import(?!\s*[(.])|export\b[^;\n]*\bfrom\b)/m;
const THROWING_STDIN_LISTENER =
  "process.stdin.once('data', () => { throw new RangeError('Invalid string length'); });";
const UNPRINTABLE_MESSAGE_THROW =
  "process.stdin.once('data', () => { throw { message: Symbol('unprintable') }; });";
const THROWING_MESSAGE_GETTER =
  "process.stdin.once('data', () => { throw { get message() { throw new Error('getter'); } }; });";
const NEVER_ENDING_STDIN = 'process.stdin.destroy();';
const FLOATING_REJECTION = "Promise.reject(new Error('floating rejection'));";

// Copies hooks/ and src/ into a throwaway root; breakTree then removes or stubs one piece.
function withGuardCopy(breakTree, nodeArgs = []) {
  const root = mkdtempSync(join(tmpdir(), 'copilot-guard-crash-'));
  try {
    const adapterCopy = join(root, 'adapters', 'copilot');
    for (const dir of ['hooks', 'src']) {
      cpSync(join(ADAPTER_DIR, dir), join(adapterCopy, dir), { recursive: true });
    }
    breakTree({ root, adapterCopy });
    const guard = join(adapterCopy, 'hooks', 'craft-guard.js');
    return spawnSync(process.execPath, [...nodeArgs, guard], { input: ALLOWED_PAYLOAD, encoding: 'utf8' });
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

// Spawns OUR hook script under `node`, never the real `copilot` binary.
function run(payload) {
  return spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
}

function bashPayload(command) {
  return toolPayload('bash', { command });
}

function toolPayload(toolName, toolArgs) {
  return JSON.stringify({ sessionId: 's', timestamp: 0, cwd: WORKING_DIR, toolName, toolArgs });
}

function denialOf(sut) {
  assert.equal(sut.status, 0);
  assert.equal(sut.stdout.endsWith('\n'), true);
  assert.equal(sut.stdout.trimEnd().includes('\n'), false);
  return JSON.parse(sut.stdout);
}

describe('craft-guard hook — verdict channel', () => {
  it('Given a git push payload, when the hook process runs, then it exits 0 with one JSON deny line on stdout', () => {
    const sut = run(bashPayload('git push'));

    const result = denialOf(sut);
    assert.equal(result.permissionDecision, 'deny');
    assert.match(result.permissionDecisionReason, /destructive git \(push\)/);
  });

  it('Given a git diff payload without --no-ext-diff, when the hook process runs, then the deny reason names the flag', () => {
    const sut = run(bashPayload('git diff'));

    const result = denialOf(sut);
    assert.match(result.permissionDecisionReason, /--no-ext-diff/);
  });

  it('Given an out-of-tree create payload, when the hook process runs, then the deny reason is the fail-closed default', () => {
    const sut = run(toolPayload('create', { path: '/etc/passwd', file_text: 'x' }));

    const result = denialOf(sut);
    assert.equal(result.permissionDecisionReason, 'denied (fail-closed)');
  });

  it('Given a blocking payload, when the hook process runs, then the audit line is on stderr under the guard prefix', () => {
    const sut = run(bashPayload('git push'));

    assert.match(sut.stderr, /^craft-guard: \{/m);
  });

  it('Given an allowed payload, when the hook process runs, then the audit line is on stderr under the guard prefix', () => {
    const sut = run(bashPayload('git status'));

    assert.match(sut.stderr, /^craft-guard: \{/m);
  });

  it('Given a git status payload, when the hook process runs, then it exits 0 with empty stdout', () => {
    const sut = run(bashPayload('git status'));

    assert.equal(sut.status, 0);
    assert.equal(sut.stdout, '');
  });
});

function assertDeniedOnStderr(sut, stderrPattern) {
  assert.equal(sut.status, 2);
  assert.match(sut.stderr, stderrPattern);
  assert.equal(sut.stdout, '');
}

describe('craft-guard hook — a crash still denies', () => {
  it('Given a payload that is not valid JSON, when the hook process runs, then it exits 2 with a guard stderr line', () => {
    const sut = run('{not json');

    assertDeniedOnStderr(sut, /^craft-guard: /m);
  });

  it('Given empty stdin, when the hook process runs, then it exits 2 with a guard stderr line', () => {
    const sut = run('');

    assertDeniedOnStderr(sut, /^craft-guard: /m);
  });

  it('Given the hook source text, when scanned, then it has no static import statement', () => {
    const sourceText = readFileSync(HOOK, 'utf8');

    assert.doesNotMatch(sourceText, STATIC_IMPORT_LINE);
  });

  it('Given the hook source text, when scanned, then it contains no finally block', () => {
    const sourceText = readFileSync(HOOK, 'utf8');

    assert.doesNotMatch(sourceText, /\bfinally\b/);
  });

  it('Given a guard copy whose engine guards cannot be resolved, when the hook process runs, then it exits 2 naming the missing module on stderr', () => {
    const sut = withGuardCopy(withoutEngineSources);

    assertDeniedOnStderr(sut, /^craft-guard: .*engine\/src\/guards\//m);
  });

  it('Given a guard copy whose stdin listener throws, when the hook process runs, then it exits 2 with the error on stderr', () => {
    const sut = withGuardCopy(stubbedCraftRoot(THROWING_STDIN_LISTENER));

    assertDeniedOnStderr(sut, /^craft-guard: Invalid string length$/m);
  });

  it('Given a guard copy whose stdin listener throws a value with an unprintable message, when the hook process runs, then it exits 2 with the fail-closed reason', () => {
    const sut = withGuardCopy(stubbedCraftRoot(UNPRINTABLE_MESSAGE_THROW));

    assertDeniedOnStderr(sut, /^craft-guard: denied \(fail-closed\)$/m);
  });

  it('Given a guard copy whose stdin listener throws a value whose message getter throws, when the hook process runs, then it exits 2 with the fail-closed reason', () => {
    const sut = withGuardCopy(stubbedCraftRoot(THROWING_MESSAGE_GETTER));

    assertDeniedOnStderr(sut, /^craft-guard: denied \(fail-closed\)$/m);
  });

  it('Given a guard copy that leaves a promise rejection unhandled under the warn rejection mode, when the hook process runs, then it exits 2 with the rejection on stderr', () => {
    const sut = withGuardCopy(stubbedCraftRoot(FLOATING_REJECTION), ['--unhandled-rejections=warn']);

    assertDeniedOnStderr(sut, /^craft-guard: floating rejection$/m);
  });

  it('Given a guard copy whose stdin never ends, when the event loop drains, then it exits 2 with the fail-closed reason', () => {
    const sut = withGuardCopy(stubbedCraftRoot(NEVER_ENDING_STDIN));

    assertDeniedOnStderr(sut, /^craft-guard: denied \(fail-closed\)$/m);
  });
});
