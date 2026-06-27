import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStrandedConsumers } from '../src/strand.js';

function makeDescriptor(id, { enabled = true, produces = [], consumes = [], self_supply = [] } = {}) {
  return { id, enabled, produces, consumes, self_supply };
}

// --- producer-later and producer-disabled case ---

test('Given a strand where the artifact has a later-enabled and a disabled other producer, when checkStrandedConsumers, then message contains position annotation and disabled annotation', () => {
  const defaults = [
    makeDescriptor('alpha', { produces: ['x'] }),
    makeDescriptor('consumer', { consumes: ['x'] }),
  ];
  const skipSet = new Set(['alpha']);
  // effective: alpha is removed; disabled-prod(0) is disabled; consumer(1) consumes x; later-prod(2) is enabled but after consumer
  const effective = [
    makeDescriptor('disabled-prod', { enabled: false, produces: ['x'] }),
    makeDescriptor('consumer', { consumes: ['x'] }),
    makeDescriptor('later-prod', { produces: ['x'] }),
  ];

  const result = checkStrandedConsumers(defaults, skipSet, effective);

  assert.equal(result.length, 1, `Expected exactly one strand error, got: ${result.join('; ')}`);
  const msg = result[0];
  assert.match(msg, /Strand/, 'Message must contain "Strand"');
  assert.match(msg, /alpha/, 'Message must name the skipped id');
  assert.match(msg, /consumer/, 'Message must name the consumer id');
  assert.match(msg, /"x"/, 'Message must name the artifact');
  assert.match(msg, /disabled-prod \(disabled\)/, 'Disabled producer must be annotated as (disabled)');
  assert.match(msg, /later-prod \(position 2, after "consumer"\)/, 'Later producer must carry position annotation');
  // Survivors 1 & 2: assert comma-space join and trailing period in the formatted list
  assert.match(msg, /disabled-prod \(disabled\), later-prod/, 'Multiple producers must be joined with ", "');
  assert.match(msg, /later-prod \(position 2, after "consumer"\)\./, 'Producer list must end with "."');
});

test('Given a strand where the artifact has other producers, when checkStrandedConsumers, then message includes all three suggestion arms', () => {
  const defaults = [
    makeDescriptor('alpha', { produces: ['x'] }),
    makeDescriptor('consumer', { consumes: ['x'] }),
  ];
  const skipSet = new Set(['alpha']);
  const effective = [
    makeDescriptor('consumer', { consumes: ['x'] }),
    makeDescriptor('later-prod', { produces: ['x'] }),
  ];

  const result = checkStrandedConsumers(defaults, skipSet, effective);

  assert.equal(result.length, 1);
  const msg = result[0];
  assert.match(msg, /keep "alpha"/, 'Message must include keep arm');
  assert.match(msg, /produces: \["x"\]/, 'Message must include produces: arm');
  assert.match(msg, /self_supply: \["x"\] on "consumer"/, 'Message must include self_supply: arm');
});

// --- nothing-else case ---

test('Given a strand where nothing else produces the artifact, when checkStrandedConsumers, then message says nothing else in this pipeline', () => {
  const defaults = [
    makeDescriptor('alpha', { produces: ['z'] }),
    makeDescriptor('consumer', { consumes: ['z'] }),
  ];
  const skipSet = new Set(['alpha']);
  const effective = [
    makeDescriptor('consumer', { consumes: ['z'] }),
  ];

  const result = checkStrandedConsumers(defaults, skipSet, effective);

  assert.equal(result.length, 1, `Expected exactly one strand error, got: ${result.join('; ')}`);
  const msg = result[0];
  assert.match(msg, /nothing else in this pipeline\./, 'Message must say nothing else in this pipeline');
  assert.match(msg, /keep "alpha"/, 'Message must include keep arm');
  assert.match(msg, /produces: \["z"\]/, 'Message must include produces: arm');
  assert.match(msg, /self_supply: \["z"\] on "consumer"/, 'Message must include self_supply: arm');
});

// --- T1: skipped descriptor present as disabled in effective ---

test('Given effective includes the skipped descriptor as a disabled producer, when checkStrandedConsumers runs, then the skipped id does not appear in the "otherwise produced by" list', () => {
  const defaults = [
    makeDescriptor('skip-phase', { produces: ['x'] }),
    makeDescriptor('consumer', { consumes: ['x'] }),
  ];
  const skipSet = new Set(['skip-phase']);
  // Mirrors real wiring: skip-phase is disabled in effective (not removed),
  // so producersOf returns it; the .filter(p => p.id !== skippedId) must exclude it.
  const effective = [
    makeDescriptor('skip-phase', { enabled: false, produces: ['x'] }),
    makeDescriptor('consumer', { consumes: ['x'] }),
  ];

  const result = checkStrandedConsumers(defaults, skipSet, effective);

  assert.equal(result.length, 1, `Expected exactly one strand error, got: ${result.join('; ')}`);
  const msg = result[0];
  assert.match(msg, /nothing else in this pipeline\./, 'Message must say nothing else when no other producers exist');
  assert.doesNotMatch(msg, /skip-phase \(disabled\)/, 'Skipped id must not appear in the "otherwise produced by" list');
});
