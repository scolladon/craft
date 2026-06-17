import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandProfile, applyProfileToArchetype } from '../src/profile.js';

// ─── expandProfile: lean ────────────────────────────────────────────────────

test('Given profile name lean, when expandProfile runs, then setup maps to inline', () => {
  const sut = expandProfile;

  const result = sut('lean');

  assert.equal(result['setup'], 'inline');
});

test('Given profile name lean, when expandProfile runs, then specification maps to inline', () => {
  const sut = expandProfile;

  const result = sut('lean');

  assert.equal(result['specification'], 'inline');
});

test('Given profile name lean, when expandProfile runs, then construction maps to agent', () => {
  const sut = expandProfile;

  const result = sut('lean');

  assert.equal(result['construction'], 'agent');
});

test('Given profile name lean, when expandProfile runs, then harness maps to agent', () => {
  const sut = expandProfile;

  const result = sut('lean');

  assert.equal(result['harness'], 'agent');
});

test('Given profile name lean, when expandProfile runs, then refinement maps to agent', () => {
  const sut = expandProfile;

  const result = sut('lean');

  assert.equal(result['refinement'], 'agent');
});

test('Given profile name lean, when expandProfile runs, then delivery maps to inline', () => {
  const sut = expandProfile;

  const result = sut('lean');

  assert.equal(result['delivery'], 'inline');
});

// ─── expandProfile: typo throw ───────────────────────────────────────────────

test('Given unknown profile name, when expandProfile runs, then throws naming the offender and listing solo full lean', () => {
  const sut = expandProfile;

  assert.throws(
    () => sut('bogus'),
    (err) => {
      assert.ok(err.message.includes('bogus'), `message must name the offending profile; got: ${err.message}`);
      assert.ok(err.message.includes('solo, full, lean'), `message must list solo, full, lean; got: ${err.message}`);
      return true;
    },
  );
});

// ─── applyProfileToArchetype ─────────────────────────────────────────────────

test('Given lean profile and harness archetype, when applyProfileToArchetype runs, then returns agent unconditionally', () => {
  const profile = expandProfile('lean');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'harness');

  assert.equal(result, 'agent');
});

test('Given lean profile and construction archetype, when applyProfileToArchetype runs, then returns agent', () => {
  const profile = expandProfile('lean');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'construction');

  assert.equal(result, 'agent');
});

test('Given lean profile and specification archetype, when applyProfileToArchetype runs, then returns inline', () => {
  const profile = expandProfile('lean');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'specification');

  assert.equal(result, 'inline');
});

test('Given full profile and harness archetype, when applyProfileToArchetype runs, then returns agent unconditionally', () => {
  const profile = expandProfile('full');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'harness');

  assert.equal(result, 'agent');
});

test('Given solo profile and harness archetype, when applyProfileToArchetype runs, then returns agent unconditionally', () => {
  const profile = expandProfile('solo');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'harness');

  assert.equal(result, 'agent');
});

test('Given solo profile and construction archetype, when applyProfileToArchetype runs, then returns inline', () => {
  const profile = expandProfile('solo');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'construction');

  assert.equal(result, 'inline');
});

test('Given lean profile and refinement archetype, when applyProfileToArchetype runs, then returns agent', () => {
  const profile = expandProfile('lean');
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'refinement');

  assert.equal(result, 'agent');
});

test('Given a profile map that mis-sets harness to inline, when applyProfileToArchetype runs, then the guard still returns agent', () => {
  const profile = { ...expandProfile('lean'), harness: 'inline' };
  const sut = applyProfileToArchetype;

  const result = sut(profile, 'harness');

  assert.equal(result, 'agent');
});
