import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePipeline } from '../src/descriptor.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dir, 'fixtures', 'pipeline');
const canonicalDefaultPath = join(__dir, '..', '..', 'pipeline', 'default.yml');

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
  procedure: craft:workspace
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
  procedure: craft:workspace
  produces: [workspace]
`;
  const result = parsePipeline(yaml);
  assert.equal(result[0].execution, 'agent');
});

test('Given an explicit empty contract, when parsePipeline runs, then it stays an empty list', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
`;
  const result = parsePipeline(yaml);
  assert.deepEqual(result[0].contract, []);
});

test('Given an entry without consumes/produces/self_supply, when parsePipeline runs, then all default to empty list', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
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
  procedure: craft:planning
`;
  const result = parsePipeline(yaml);
  assert.deepEqual(result[0].contract, ['producer']);
});

test('Given parsePipeline, when called, then it returns a deeply frozen array', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  produces: [workspace]
`;
  const result = parsePipeline(yaml);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
  assert.equal(Object.isFrozen(result[0].produces), true);
});

// --- turn_budget ---

test('Given a pipeline entry declaring turn_budget: 150, when parsePipeline runs, then the normalized descriptor carries turn_budget: 150', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  turn_budget: 150
`;
  const result = parsePipeline(yaml);
  assert.equal(result[0].turn_budget, 150);
});

test('Given an entry with no turn_budget, when parsePipeline runs, then the descriptor carries turn_budget: null', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
`;
  const result = parsePipeline(yaml);
  assert.equal(Object.hasOwn(result[0], 'turn_budget'), true);
  assert.equal(result[0].turn_budget, null);
});

test('Given an entry with turn_budget explicitly null, when parsePipeline runs, then the descriptor carries turn_budget: null', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  turn_budget: null
`;
  const result = parsePipeline(yaml);
  assert.equal(result[0].turn_budget, null);
});

test('Given an invalid turn_budget, when parsePipeline runs, then it throws an error naming the index, id, and the positive-integer requirement', () => {
  const invalidValues = [0, -5, 1.5, '150'];
  for (const value of invalidValues) {
    const yaml = `
- id: planning
  archetype: specification
  contract: []
  procedure: craft:planning
  turn_budget: ${JSON.stringify(value)}
`;
    assert.throws(
      () => parsePipeline(yaml),
      /Descriptor at index 0 \(id="planning"\).*turn_budget.*Must be a positive integer\./s,
      `expected a throw for turn_budget=${JSON.stringify(value)}`,
    );
  }
});

// --- validation errors ---

test('Given an entry missing id, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- archetype: setup
  contract: []
  procedure: craft:workspace
`;
  assert.throws(() => parsePipeline(yaml), /id/);
});

test('Given an entry missing archetype, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- id: workspace
  contract: []
  procedure: craft:workspace
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

test('Given an entry missing contract, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- id: workspace
  archetype: setup
  procedure: craft:workspace
`;
  assert.throws(() => parsePipeline(yaml), /contract/);
});

test('Given an entry with an invalid execution mode, when parsePipeline runs, then it throws a descriptive error', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  execution: turbo
`;
  assert.throws(() => parsePipeline(yaml), /execution/);
});

test('Given an entry with unknown archetype, when parsePipeline runs, then it throws a descriptive error', () => {
  assert.throws(() => parsePipeline(readFixture('bad-archetype.yml')), /archetype/);
});

// --- golden test: 13-descriptor default list ---

const DEFAULT_YAML = readFileSync(canonicalDefaultPath, 'utf8');
const EXPECTED_DESCRIPTORS = [
  {
    id: 'workspace',
    archetype: 'setup',
    enabled: true,
    contract: [],
    procedure: 'craft:workspace',
    role: undefined,
    consumes: [],
    self_supply: [],
    produces: ['workspace'],
    turn_budget: null,
  },
  {
    id: 'requirements',
    archetype: 'specification',
    enabled: false,
    contract: ['producer'],
    procedure: 'craft:requirements',
    role: 'craft:requirements-writer',
    consumes: ['workspace'],
    self_supply: [],
    produces: ['requirements'],
    turn_budget: null,
  },
  {
    id: 'design',
    archetype: 'specification',
    enabled: true,
    contract: ['producer'],
    procedure: 'craft:design',
    role: 'craft:designer',
    consumes: ['workspace', 'requirements'],
    self_supply: ['requirements'],
    produces: ['design'],
    turn_budget: null,
  },
  {
    id: 'decisions',
    archetype: 'specification',
    enabled: true,
    contract: [],
    procedure: 'craft:decisions',
    role: undefined,
    consumes: ['design'],
    self_supply: ['design'],
    produces: ['decisions'],
    turn_budget: null,
  },
  {
    id: 'planning',
    archetype: 'specification',
    enabled: true,
    contract: ['producer'],
    procedure: 'craft:planning',
    role: 'craft:planner',
    consumes: ['design', 'decisions'],
    self_supply: ['design', 'decisions'],
    produces: ['plan'],
    turn_budget: null,
  },
  {
    id: 'implementation',
    archetype: 'construction',
    enabled: true,
    contract: ['construction'],
    procedure: 'craft:implementation',
    role: 'craft:part-implementer',
    consumes: ['workspace', 'plan'],
    self_supply: [],
    produces: ['change'],
    turn_budget: null,
  },
  {
    id: 'review',
    archetype: 'harness',
    enabled: true,
    contract: ['harness-read'],
    procedure: 'craft:review',
    role: 'craft:reviewer',
    consumes: ['change'],
    self_supply: [],
    produces: ['review-report'],
    turn_budget: null,
  },
  {
    id: 'refactoring',
    archetype: 'refinement',
    enabled: true,
    contract: ['refinement'],
    procedure: 'craft:refactoring',
    role: 'craft:refactor-executor',
    consumes: ['change'],
    self_supply: [],
    produces: ['change'],
    turn_budget: null,
  },
  {
    id: 'validation',
    archetype: 'harness',
    enabled: true,
    contract: ['harness-exec'],
    procedure: 'craft:validation',
    role: 'craft:harness-triager',
    consumes: ['change'],
    self_supply: [],
    produces: ['validation-report'],
    turn_budget: null,
  },
  {
    id: 'architecture',
    archetype: 'harness',
    enabled: false,
    contract: ['harness-exec'],
    procedure: 'craft:architecture',
    role: 'craft:harness-triager',
    consumes: ['change'],
    self_supply: [],
    produces: ['architecture-report'],
    turn_budget: null,
  },
  {
    id: 'documentation',
    archetype: 'delivery',
    enabled: true,
    contract: ['delivery'],
    procedure: 'craft:documentation',
    role: 'craft:docs-writer',
    consumes: ['design', 'change'],
    self_supply: [],
    produces: ['docs'],
    turn_budget: null,
  },
  {
    id: 'propose',
    archetype: 'delivery',
    enabled: true,
    contract: ['delivery'],
    procedure: 'craft:propose',
    role: undefined,
    consumes: ['change'],
    self_supply: [],
    produces: ['pr'],
    turn_budget: null,
  },
  {
    id: 'integrate',
    archetype: 'delivery',
    enabled: true,
    contract: ['delivery'],
    procedure: 'craft:integrate',
    role: undefined,
    consumes: ['pr'],
    self_supply: [],
    produces: [],
    turn_budget: null,
  },
];

const STRUCTURAL_FIELDS = [
  'id', 'archetype', 'enabled', 'contract', 'procedure',
  'role', 'consumes', 'self_supply', 'produces', 'turn_budget',
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

test('Given default.yml, when parsePipeline runs, then every descriptor has execution agent', () => {
  const result = parsePipeline(DEFAULT_YAML);
  for (const d of result) {
    assert.equal(d.execution, 'agent', `${d.id} should default execution to agent`);
  }
});

test('Given default.yml, when parsePipeline runs, then role-bearing phases carry their seeded model tier and role-less phases carry no model field', () => {
  const result = parsePipeline(DEFAULT_YAML);
  const byId = Object.fromEntries(result.map(d => [d.id, d]));

  const ROLE_TIERS = {
    requirements: 'opus',
    design: 'opus',
    planning: 'opus',
    implementation: 'sonnet',
    review: 'opus',
    refactoring: 'sonnet',
    validation: 'sonnet',
    architecture: 'opus',
    documentation: 'sonnet',
  };
  for (const [id, tier] of Object.entries(ROLE_TIERS)) {
    assert.equal(byId[id].model, tier, `Descriptor ${id} must carry model "${tier}"`);
  }

  const ROLE_LESS_IDS = ['workspace', 'decisions', 'propose', 'integrate'];
  for (const id of ROLE_LESS_IDS) {
    assert.equal(Object.hasOwn(byId[id], 'model'), false, `Descriptor ${id} must not carry model`);
  }
});

test('Given default.yml, when parsePipeline runs, then all archetypes are within the valid enum', () => {
  const result = parsePipeline(DEFAULT_YAML);
  for (const d of result) {
    assert.ok(VALID_ARCHETYPES.has(d.archetype), `${d.id} has unknown archetype: ${d.archetype}`);
  }
});

// --- null model field is dropped (mutation-kill: :95 ConditionalExpression) ---

test('Given an entry with model: null, when parsePipeline runs, then model field is absent from the descriptor', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  produces: [workspace]
  model: null
`;
  const result = parsePipeline(yaml);
  assert.equal(Object.hasOwn(result[0], 'model'), false);
});
