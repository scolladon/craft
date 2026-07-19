import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PACKAGE_JSON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json'
);

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

describe('adapters/opencode package.json contract', () => {
  it('Given the package.json file, when read, then it parses as valid JSON', () => {
    const sut = readFileSync(PACKAGE_JSON_PATH, 'utf8');

    const result = JSON.parse(sut);

    assert.equal(typeof result, 'object');
  });

  it('Given the parsed package.json, when checking the type field, then it is "module"', () => {
    const sut = readPackageJson();

    const result = sut.type;

    assert.equal(result, 'module');
  });

  it('Given the parsed package.json, when checking the test script, then it runs the node --test glob command', () => {
    const sut = readPackageJson();

    const result = sut.scripts.test;

    assert.equal(result, "node --test 'test/**/*.test.js'");
  });

  it('Given the parsed package.json, when checking the name field, then it is "@craft/adapter-opencode"', () => {
    const sut = readPackageJson();

    const result = sut.name;

    assert.equal(result, '@craft/adapter-opencode');
  });
});
