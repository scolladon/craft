import type { ProgressItem, ProgressView } from './state'

const STATUS_LINE_CELLS = 80
const PREFIX = 'craft'
const SEPARATOR = ' · '
const PARALLEL = ' ∥ '
const PHASE_MARK = '▸ '
const NEXT_LABEL = 'next '
export const DONE_LABEL = 'done'
const REVIEW = 'review'
const CYCLE_LABEL = /^cycle (\d+)$/
const COMPLETED: ProgressItem['status'] = 'completed'
const IN_PROGRESS: ProgressItem['status'] = 'in_progress'
const PENDING: ProgressItem['status'] = 'pending'
const BAR_GLYPHS: Record<ProgressItem['status'], string> = {
  completed: '■',
  in_progress: '▶',
  pending: '□',
}

export function completedCount(view: ProgressView): number {
  return view.items.filter(item => item.status === COMPLETED).length
}

function bar(items: ProgressItem[]): string {
  return items.map(item => BAR_GLYPHS[item.status]).join('')
}

function cycleNumber(view: ProgressView): string | null {
  const review = view.items.find(item => item.id === REVIEW)
  const running = review?.children.find(child => child.status === IN_PROGRESS)
  return running?.label.match(CYCLE_LABEL)?.[1] ?? null
}

function phaseToken(view: ProgressView, id: string): string {
  if (id !== REVIEW) return id
  const cycle = cycleNumber(view)
  return cycle === null ? id : `${id} c${cycle}`
}

function namedPhases(view: ProgressView): string[] {
  return view.inFlight.length > 0 ? view.inFlight : [view.next ?? DONE_LABEL]
}

function phaseSegment(view: ProgressView): string {
  const tokens = namedPhases(view).map(id => phaseToken(view, id))
  return PHASE_MARK + tokens.join(PARALLEL)
}

function nextSegment(view: ProgressView): string | null {
  const named = namedPhases(view)
  const upcoming = view.items.find(
    item => item.status === PENDING && !named.includes(item.id),
  )
  return upcoming === undefined ? null : NEXT_LABEL + upcoming.id
}

function cells(text: string): number {
  return [...text].length
}

function join(segments: (string | null)[]): string {
  return segments.filter(segment => segment !== null && segment !== '').join(SEPARATOR)
}

function forms(view: ProgressView, attention: string): string[] {
  const count = `${completedCount(view)}/${view.items.length}`
  const withBar = `${PREFIX} ${bar(view.items)} ${count}`
  const phase = phaseSegment(view)
  return [
    join([withBar, phase, nextSegment(view), attention]),
    join([withBar, phase, attention]),
    join([`${PREFIX} ${count}`, phase, attention]),
  ]
}

export function statusLine(view: ProgressView, attention: string): string {
  const candidates = forms(view, attention)
  return (
    candidates.find(form => cells(form) <= STATUS_LINE_CELLS) ??
    candidates[candidates.length - 1]
  )
}
