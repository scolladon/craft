import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePipeline } from '../src/descriptor.js';
import { validatePipeline } from '../src/graph.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dir, 'fixtures', 'pipeline');

function readAndParse(name) {
  return parsePipeline(readFileSync(join(fixturesDir, name), 'utf8'));
}

// --- default pipeline ---

test('Given default.yml, when validatePipeline runs, then ok is true with no errors', () => {
  const sut = readAndParse('default.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors.join('; ')}`);
  assert.deepEqual(result.errors, []);
});

test('Given default.yml with requirements and architecture default-off, when validatePipeline runs, then self_supply exemption lets it pass', () => {
  // This is the key SC1 data anchor: disabled producers are absorbed by self_supply
  const sut = readAndParse('default.yml');
  const reqOff = sut.find(d => d.id === 'requirements');
  const archOff = sut.find(d => d.id === 'architecture');
  assert.equal(reqOff.enabled, false);
  assert.equal(archOff.enabled, false);
  const result = validatePipeline(sut);
  assert.equal(result.ok, true);
});

// --- invalid fixtures ---

test('Given cycle.yml, when validatePipeline runs, then ok is false', () => {
  const sut = readAndParse('cycle.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('Given dangling-consume.yml, when validatePipeline runs, then ok is false with a dangling error', () => {
  const sut = readAndParse('dangling-consume.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('Given disabled-producer-absorbed.yml, when validatePipeline runs, then ok is true', () => {
  const sut = readAndParse('disabled-producer-absorbed.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors.join('; ')}`);
});

test('Given selfsupply-not-subset.yml, when validatePipeline runs, then ok is false', () => {
  const sut = readAndParse('selfsupply-not-subset.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /self_supply/.test(e)));
});

// --- inline duplicate id ---

test('Given descriptors with duplicate ids, when validatePipeline runs, then ok is false', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
  produces: [workspace]
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
  produces: [workspace]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /duplicate/i.test(e) || /unique/i.test(e)));
});

// --- bundle vocab ---

test('Given a descriptor with an unknown bundle name in contract, when validatePipeline runs, then ok is false', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: [unknown-bundle]
  procedure: forge:workspace
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /bundle/i.test(e) || /contract/i.test(e) || /unknown-bundle/.test(e)));
});

test('Given descriptors with valid bundle names, when validatePipeline runs, then ok is true', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: [core]
  procedure: forge:workspace
  produces: [workspace]
- id: planning
  archetype: specification
  contract: [producer]
  procedure: forge:planning
  consumes: [workspace]
  self_supply: []
  produces: [plan]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got: ${result.errors.join('; ')}`);
});
