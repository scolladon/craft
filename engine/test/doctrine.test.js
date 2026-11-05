import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { DOCTRINE_BULLETS, parseDoctrine } from '../src/doctrine.js'

const entry = (id, overrides = {}) => {
  const bullets = {
    Trigger: 'a trigger',
    Rule: 'a rule',
    Evidence: 'ADR-546 — why',
    'Counter-cases': 'none',
    ...overrides,
  }
  const lines = Object.entries(bullets).map(([k, v]) => `- **${k}:** ${v}`)
  return [`## D-${id} — Title ${id}`, ...lines].join('\n')
}

describe('parseDoctrine', () => {
  it('Given a one-entry doctrine, when parsed, then the entry carries id, title, bullets, evidence ids and heading line', () => {
    const sut = `# Doctrine\n\nprose\n\n${entry(1)}\n`

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.entries, [
      {
        id: 1,
        title: 'Title 1',
        trigger: 'a trigger',
        rule: 'a rule',
        evidence: ['546'],
        counterCases: [],
        line: 5,
      },
    ])
  })

  it('Given several entries, when parsed, then they are returned in order', () => {
    const sut = `${entry(1)}\n\n${entry(2)}\n`

    const result = parseDoctrine(sut)

    assert.deepEqual(
      result.entries.map(e => e.id),
      [1, 2],
    )
  })

  it('Given counter-cases none, when parsed, then counterCases is empty', () => {
    const sut = entry(1, { 'Counter-cases': 'none' })

    const result = parseDoctrine(sut)

    assert.deepEqual(result.entries[0].counterCases, [])
  })

  it('Given counter-cases with two ADR items, when parsed, then both ids are kept in order', () => {
    const sut = entry(1, { 'Counter-cases': 'ADR-546 — why; ADR-551 — why' })

    const result = parseDoctrine(sut)

    assert.deepEqual(result.entries[0].counterCases, ['546', '551'])
  })

  it('Given too-short and too-long ADR references in evidence, when parsed, then neither is an id', () => {
    const sut = entry(1, { Evidence: 'ADR-12 and ADR-1234 and ADR-321' })

    const result = parseDoctrine(sut)

    assert.deepEqual(result.entries[0].evidence, ['321'])
  })

  it('Given a heading without the em dash, when parsed, then it reports the heading error and returns no entry', () => {
    const sut = `# T\n\n## D-1 - Title\n- **Trigger:** x\n`

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [
      { line: 3, message: 'heading must be "## D-<n> — <title>"' },
    ])
    assert.deepEqual(result.entries, [])
  })

  it('Given a heading with a non-integer id, when parsed, then it reports the heading error', () => {
    const sut = '## D-x — Title\n'

    const result = parseDoctrine(sut)

    assert.equal(result.errors[0].message, 'heading must be "## D-<n> — <title>"')
  })

  it('Given duplicate ids, when parsed, then it reports the duplicate at the second heading', () => {
    const sut = `${entry(2)}\n\n${entry(2)}\n`

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [{ line: 7, message: 'duplicate id D-2' }])
  })

  it('Given D-3 after D-5, when parsed, then it reports D-3 out of order', () => {
    const sut = `${entry(5)}\n\n${entry(3)}\n`

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [{ line: 7, message: 'D-3 out of order' }])
  })

  it('Given D-1 then D-4, when parsed, then gaps raise no error', () => {
    const sut = `${entry(1)}\n\n${entry(4)}\n`

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [])
    assert.equal(result.entries.length, 2)
  })

  const BULLETS_ERROR =
    'D-1: bullets must be exactly, in order: Trigger, Rule, Evidence, Counter-cases'

  it('Given an entry missing a bullet, when parsed, then it reports the bullets error and drops the entry', () => {
    const sut = entry(1).split('\n').slice(0, 4).join('\n')

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [{ line: 1, message: BULLETS_ERROR }])
    assert.deepEqual(result.entries, [])
  })

  it('Given an entry with reordered bullets, when parsed, then it reports the bullets error', () => {
    const [heading, trigger, rule, ...rest] = entry(1).split('\n')
    const sut = [heading, rule, trigger, ...rest].join('\n')

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [{ line: 1, message: BULLETS_ERROR }])
    assert.deepEqual(result.entries, [])
  })

  it('Given an entry with an empty bullet value, when parsed, then it reports the bullets error', () => {
    const sut = entry(1, { Rule: '   ' })

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [{ line: 1, message: BULLETS_ERROR }])
    assert.deepEqual(result.entries, [])
  })

  it('Given an entry with an extra bullet, when parsed, then it reports the bullets error', () => {
    const sut = `${entry(1)}\n- **Extra:** more`

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [{ line: 1, message: BULLETS_ERROR }])
    assert.deepEqual(result.entries, [])
  })

  it('Given evidence without an ADR id, when parsed, then it reports evidence is empty', () => {
    const sut = entry(1, { Evidence: 'no ids here' })

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [
      { line: 1, message: 'D-1: evidence is empty' },
    ])
  })

  it('Given free-text counter-cases, when parsed, then it reports the counter-cases shape error', () => {
    const sut = entry(1, { 'Counter-cases': 'sometimes it fails' })

    const result = parseDoctrine(sut)

    assert.deepEqual(result.errors, [
      {
        line: 1,
        message: 'D-1: counter-cases must be none or ADR-NNN — <why> items',
      },
    ])
  })

  for (const fence of ['```', '~~~']) {
    it(`Given an entry heading inside a ${fence} fence, when parsed, then it is not an entry and raises no error`, () => {
      const sut = `# T\n\n${fence}\n## not a heading\n${entry(9)}\n${fence}\n\n${entry(1)}\n`

      const result = parseDoctrine(sut)

      assert.deepEqual(result.errors, [])
      assert.deepEqual(
        result.entries.map(e => e.id),
        [1],
      )
    })
  }

  it('Given the exported bullet labels, then they are the four in order and frozen', () => {
    const sut = DOCTRINE_BULLETS

    assert.deepEqual(sut, ['Trigger', 'Rule', 'Evidence', 'Counter-cases'])
    assert.ok(Object.isFrozen(sut))
  })
})
