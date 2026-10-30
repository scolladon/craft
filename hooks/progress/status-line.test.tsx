import { expect, test } from 'claude-code/testing'
import { statusLine } from './status-line'

const sut = statusLine

type Status = 'pending' | 'in_progress' | 'completed'

const item = (
  id: string,
  status: Status,
  children: { label: string; status: string; note: string }[] = [],
) => ({ id, status, note: '', children })

const view = (
  items: ReturnType<typeof item>[],
  inFlight: string[],
  next: string | null,
) => ({
  run: 'demo',
  source: 'effective' as const,
  items,
  inFlight,
  next,
  background: [],
  warnings: [],
})

const done = (count: number) =>
  Array.from({ length: count }, (_, index) => item(`done${index}`, 'completed'))

const EIGHT_OF_TWELVE = view(
  [
    ...done(8),
    item('validation', 'in_progress'),
    item('documentation', 'in_progress'),
    item('lessons', 'pending'),
    item('propose', 'pending'),
  ],
  ['validation', 'documentation'],
  'lessons',
)

const VALIDATING = view(
  [
    item('workspace', 'completed'),
    item('validation', 'in_progress'),
    item('propose', 'pending'),
  ],
  ['validation'],
  'propose',
)

const padding = (count: number) => 'x'.repeat(count)

test('Given an effective view with a completed, an in-progress and a pending item, when the line renders, then it reads the bar, the phase, the next phase and the attention', () => {
  const input = view(
    [
      item('workspace', 'completed'),
      item('planning', 'in_progress'),
      item('implementation', 'pending'),
    ],
    ['planning'],
    'implementation',
  )

  const result = sut(input, 'working')

  expect(result).toBe('craft ■▶□ 1/3 · ▸ planning · next implementation · working')
})

test('Given two in-progress items among completed and pending ones, when the bar renders, then it holds one glyph per item in pipeline order', () => {
  const result = sut(EIGHT_OF_TWELVE, 'working')

  expect(result).toBe(
    'craft ■■■■■■■■▶▶□□ 8/12 · ▸ validation ∥ documentation · next lessons · working',
  )
})

test('Given nothing in flight and next implementation as the only pending item, when the line renders, then there is no next segment', () => {
  const input = view(
    [
      item('workspace', 'completed'),
      item('design', 'completed'),
      item('implementation', 'pending'),
    ],
    [],
    'implementation',
  )

  const result = sut(input, '')

  expect(result).toBe('craft ■■□ 2/3 · ▸ implementation')
})

test('Given every item completed and an empty attention, when the line renders, then it ends on done with no trailing separator', () => {
  const input = view(done(3), [], null)

  const result = sut(input, '')

  expect(result).toBe('craft ■■■ 3/3 · ▸ done')
})

const REVIEW_ITEMS = (status: Status, children: ReturnType<typeof item>['children']) => [
  item('workspace', 'completed'),
  item('design', 'completed'),
  item('decisions', 'completed'),
  item('planning', 'completed'),
  item('implementation', 'completed'),
  item('review', status, children),
  item('refactoring', 'pending'),
  item('validation', 'pending'),
  item('documentation', 'pending'),
  item('lessons', 'pending'),
  item('propose', 'pending'),
]

test('Given review in flight with cycle 1 completed and cycle 2 in progress, when the line renders, then the phase reads review c2', () => {
  const input = view(
    REVIEW_ITEMS('in_progress', [
      { label: 'cycle 1', status: 'completed', note: 'n=3' },
      { label: 'cycle 2', status: 'in_progress', note: 'n=1' },
    ]),
    ['review'],
    'refactoring',
  )

  const result = sut(input, 'working')

  expect(result).toBe(
    'craft ■■■■■▶□□□□□ 5/11 · ▸ review c2 · next refactoring · working',
  )
})

test('Given review in flight with no cycle child, when the line renders, then the phase reads review', () => {
  const input = view(REVIEW_ITEMS('in_progress', []), ['review'], 'refactoring')

  const result = sut(input, '')

  expect(result).toContain('▸ review ·')
})

test('Given review in flight with cycle 1 completed and no cycle in progress, when the line renders, then the phase reads review', () => {
  const input = view(
    REVIEW_ITEMS('in_progress', [
      { label: 'cycle 1', status: 'completed', note: 'n=3' },
    ]),
    ['review'],
    'refactoring',
  )

  const result = sut(input, '')

  expect(result).toContain('▸ review ·')
})

test('Given a full line of 81 cells whose form without next fits, when the line renders, then next is dropped', () => {
  const result = sut(VALIDATING, padding(35))

  expect(result).toBe(`craft ■▶□ 1/3 · ▸ validation · ${padding(35)}`)
})

test('Given a line without next of 81 cells, when the line renders, then the bar is dropped too', () => {
  const result = sut(VALIDATING, padding(50))

  expect(result).toBe(`craft 1/3 · ▸ validation · ${padding(50)}`)
})

test('Given a minimal form of 81 cells, when the line renders, then the minimal form is printed anyway', () => {
  const result = sut(VALIDATING, padding(54))

  expect(result).toBe(`craft 1/3 · ▸ validation · ${padding(54)}`)
})

test('Given a full line of exactly 80 cells, when the line renders, then it is kept whole', () => {
  const result = sut(VALIDATING, padding(34))

  expect(result).toBe(`craft ■▶□ 1/3 · ▸ validation · next propose · ${padding(34)}`)
})

test('Given a line without next of exactly 80 cells, when the line renders, then it is kept', () => {
  const result = sut(VALIDATING, padding(49))

  expect(result).toBe(`craft ■▶□ 1/3 · ▸ validation · ${padding(49)}`)
})

test('Given a 12-glyph bar and a full line of exactly 80 code points, when the line renders, then it is kept whole', () => {
  const result = sut(EIGHT_OF_TWELVE, 'working!')

  expect(result).toBe(
    'craft ■■■■■■■■▶▶□□ 8/12 · ▸ validation ∥ documentation · next lessons · working!',
  )
})
