'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const SUITE_DIRS = [
  { label: 'engine', dir: path.join(ROOT, 'engine', 'test') },
  { label: 'adapters/pi', dir: path.join(ROOT, 'adapters', 'pi', 'test') },
  { label: 'adapters/opencode', dir: path.join(ROOT, 'adapters', 'opencode', 'test') },
  { label: 'adapters/copilot', dir: path.join(ROOT, 'adapters', 'copilot', 'test') },
  { label: 'adapters/codex', dir: path.join(ROOT, 'adapters', 'codex', 'test') },
  { label: 'process', dir: path.join(ROOT, 'test') },
];

// fixtures dirs hold deliberate negative material, never live suites
const EXCLUDED_DIR_NAMES = new Set(['fixtures']);

function enumerateTestFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join(dir, entry.name));
  const nested = entries
    .filter((entry) => entry.isDirectory() && !EXCLUDED_DIR_NAMES.has(entry.name))
    .flatMap((entry) => enumerateTestFiles(path.join(dir, entry.name)));
  return [...files, ...nested].sort();
}

const TEST_REGISTRATION_PATTERN = /\b(?:test|it|describe|suite)\s*\(/;
const COMMENT_PATTERN = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const STRING_LITERAL_PATTERN = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

function registersAtLeastOneTest(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const withoutCommentsAndStrings = source
    .replace(COMMENT_PATTERN, '')
    .replace(STRING_LITERAL_PATTERN, '');
  return TEST_REGISTRATION_PATTERN.test(withoutCommentsAndStrings);
}

for (const { label, dir } of SUITE_DIRS) {
  test(`Given the ${label} suite directory, when its *.test.js files are enumerated, then the set is non-empty`, () => {
    const files = enumerateTestFiles(dir);

    assert.ok(files.length > 0, `expected at least one *.test.js file under ${dir}`);
  });

  test(`Given every *.test.js file in the ${label} suite, when scanned for a test registration, then each one registers at least one test`, () => {
    const files = enumerateTestFiles(dir);
    const unregistered = files.filter((file) => !registersAtLeastOneTest(file));

    assert.strictEqual(
      unregistered.length,
      0,
      `expected every *.test.js file to register at least one test; offenders: ${unregistered.join(', ')}`
    );
  });
}

test('Given a synthetic empty *.test.js file, when scanned for a test registration, then the detector flags it as zero-registration', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-empty-test-file-'));
  const emptyFile = path.join(tmpDir, 'empty.test.js');
  try {
    fs.writeFileSync(emptyFile, "'use strict';\n// intentionally registers no tests\n");

    assert.strictEqual(
      registersAtLeastOneTest(emptyFile),
      false,
      'expected the detector to flag a synthetic empty test file as zero-registration'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Given a *.test.js file whose only registration tokens sit in comments and strings, when scanned, then the detector still flags it as zero-registration', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hollow-test-file-'));
  const hollowFile = path.join(tmpDir, 'hollow.test.js');
  try {
    fs.writeFileSync(
      hollowFile,
      "'use strict';\n// test( was removed here\nconst label = 'it(';\nconst doc = `describe( in a template`;\n/* suite( in a block comment */\n"
    );

    assert.strictEqual(
      registersAtLeastOneTest(hollowFile),
      false,
      'expected registration tokens inside comments or string literals not to count'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
