import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePipeline } from '../src/descriptor.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dir, 'fixtures', 'pipeline');

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

const VALID_ARCHETYPES = new Set([
  'setup', 'specification', 'construction', 'harness', 'refinement', 'delivery',
]);

// --- defaults ---

test('Given a minimal valid YAML entry, when parsePipeline runs, then enabled defaults to true', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
  produces: [workspace]
`;
  const result = parsePipeline(yaml);
  assert.equal(result[0].enabled, true);
});

test('Given a minimal valid entry without execution, when parsePipeline runs, then execution defaults to agent', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
  produces: [workspace]
`;
  const result = parsePipeline(yaml);
  assert.equal(result[0].execution, 'agent');
});

test('Given an entry without contract, when parsePipeline runs, then contract defaults to empty list', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
`;
  const result = parsePipeline(yaml);
  assert.deepEqual(result[0].contract, []);
});

test('Given an entry without consumes/produces/self_supply, when parsePipeline runs, then all default to empty list', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
`;
  const result = parsePipeline(yaml);
  assert.deepEqual(result[0].consumes, []);
  assert.deepEqual(result[0].produces, []);
  assert.deepEqual(result[0].self_supply, []);
});

test('Given a string contract field, when parsePipeline runs, then it is normalized to a list', () => {
  const yaml = `
- id: planning
  archetype: specification
  contract: producer
  procedure: forge:planning
`;
  const result = parsePipeline(yaml);
  assert.deepEqual(result[0].contract, ['producer']);
});

test('Given parsePipeline, when called, then it returns a frozen array', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: forge:workspace
`;
  const result = parsePipeline(yaml);
  assert.equal(Object.isFrozen(result), true);
});

// --- validation errors ---

test('Given an entry missing id, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- archetype: setup
  contract: []
  procedure: forge:workspace
`;
  assert.throws(() => parsePipeline(yaml), /id/);
});

test('Given an entry missing archetype, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- id: workspace
  contract: []
  procedure: forge:workspace
`;
  assert.throws(() => parsePipeline(yaml), /archetype/);
});

test('Given an entry missing procedure, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
`;
  assert.throws(() => parsePipeline(yaml), /procedure/);
});

test('Given an entry with unknown archetype, when parsePipeline runs, then it throws a descriptive error', () => {
  assert.throws(() => parsePipeline(readFixture('bad-archetype.yml')), /archetype/);
});

// --- golden test: 13-descriptor default list ---

const DEFAULT_YAML = readFixture('default.yml');
const EXPECTED_DESCRIPTORS = [
  {
    id: 'workspace',
    archetype: 'setup',
    enabled: true,
    contract: [],
    procedure: 'forge:workspace',
    role: undefined,
    consumes: [],
    self_supply: [],
    produces: ['workspace'],
  },
  {
    id: 'requirements',
    archetype: 'specification',
    enabled: false,
    contract: ['producer'],
    procedure: 'forge:requirements',
    role: 'forge:requirements-writer',
    consumes: ['workspace'],
    self_supply: [],
    produces: ['requirements'],
  },
  {
    id: 'design',
    archetype: 'specification',
    enabled: true,
    contract: ['producer'],
    procedure: 'forge:design',
    role: 'forge:designer',
    consumes: ['workspace', 'requirements'],
    self_supply: ['requirements'],
    produces: ['design'],
  },
  {
    id: 'decisions',
    archetype: 'specification',
    enabled: true,
    contract: [],
    procedure: 'forge:decisions',
    role: undefined,
    consumes: ['design'],
    self_supply: ['design'],
    produces: ['decisions'],
  },
  {
    id: 'planning',
    archetype: 'specification',
    enabled: true,
    contract: ['producer'],
    procedure: 'forge:planning',
    role: 'forge:planner',
    consumes: ['design', 'decisions'],
    self_supply: ['design', 'decisions'],
    produces: ['plan'],
  },
  {
    id: 'implementation',
    archetype: 'construction',
    enabled: true,
    contract: ['construction'],
    procedure: 'forge:implementation',
    role: 'forge:slice-implementer',
    consumes: ['workspace', 'plan'],
    self_supply: [],
    produces: ['change'],
  },
  {
    id: 'review',
    archetype: 'harness',
    enabled: true,
    contract: ['harness-read'],
    procedure: 'forge:review',
    role: 'forge:reviewer',
    consumes: ['change'],
    self_supply: [],
    produces: ['review-report'],
  },
  {
    id: 'refactoring',
    archetype: 'refinement',
    enabled: true,
    contract: [],
    procedure: 'forge:refactoring',
    role: 'forge:refactor-executor',
    consumes: ['change'],
    self_supply: [],
    produces: ['change'],
  },
  {
    id: 'validation',
    archetype: 'harness',
    enabled: true,
    contract: ['harness-exec'],
    procedure: 'forge:validation',
    role: 'forge:validation-triager',
    consumes: ['change'],
    self_supply: [],
    produces: ['validation-report'],
  },
  {
    id: 'architecture',
    archetype: 'harness',
    enabled: false,
    contract: ['harness-exec'],
    procedure: 'forge:architecture',
    role: 'forge:architecture-triager',
    consumes: ['change'],
    self_supply: [],
    produces: ['architecture-report'],
  },
  {
    id: 'documentation',
    archetype: 'delivery',
    enabled: true,
    contract: ['delivery'],
    procedure: 'forge:documentation',
    role: 'forge:docs-writer',
    consumes: ['design', 'change'],
    self_supply: [],
    produces: ['docs'],
  },
  {
    id: 'propose',
    archetype: 'delivery',
    enabled: true,
    contract: ['delivery'],
    procedure: 'forge:propose',
    role: undefined,
    consumes: ['change'],
    self_supply: [],
    produces: ['pr'],
  },
  {
    id: 'integrate',
    archetype: 'delivery',
    enabled: true,
    contract: ['delivery'],
    procedure: 'forge:integrate',
    role: undefined,
    consumes: ['pr'],
    self_supply: [],
    produces: [],
  },
];

const STRUCTURAL_FIELDS = [
  'id', 'archetype', 'enabled', 'contract', 'procedure',
  'role', 'consumes', 'self_supply', 'produces',
];

test('Given default.yml, when parsePipeline runs, then it yields exactly 13 descriptors', () => {
  const result = parsePipeline(DEFAULT_YAML);
  assert.equal(result.length, 13);
});

test('Given default.yml, when parsePipeline runs, then requirements and architecture are disabled', () => {
  const result = parsePipeline(DEFAULT_YAML);
  const ids = result.map(d => d.id);
  const reqIdx = ids.indexOf('requirements');
  const archIdx = ids.indexOf('architecture');
  assert.equal(result[reqIdx].enabled, false);
  assert.equal(result[archIdx].enabled, false);
});

test('Given default.yml, when parsePipeline runs, then all structural fields match the golden table', () => {
  const result = parsePipeline(DEFAULT_YAML);
  assert.equal(result.length, EXPECTED_DESCRIPTORS.length);

  for (let i = 0; i < EXPECTED_DESCRIPTORS.length; i++) {
    const expected = EXPECTED_DESCRIPTORS[i];
    const actual = result[i];
    for (const field of STRUCTURAL_FIELDS) {
      assert.deepEqual(
        actual[field],
        expected[field],
        `Descriptor[${i}].${field} (id=${actual.id}): expected ${JSON.stringify(expected[field])}, got ${JSON.stringify(actual[field])}`,
      );
    }
  }
});

test('Given default.yml, when parsePipeline runs, then no descriptor carries a model field', () => {
  const result = parsePipeline(DEFAULT_YAML);
  for (const d of result) {
    assert.equal(Object.hasOwn(d, 'model'), false, `Descriptor ${d.id} must not carry model`);
  }
});

test('Given default.yml, when parsePipeline runs, then all archetypes are within the valid enum', () => {
  const result = parsePipeline(DEFAULT_YAML);
  for (const d of result) {
    assert.ok(VALID_ARCHETYPES.has(d.archetype), `${d.id} has unknown archetype: ${d.archetype}`);
  }
});
