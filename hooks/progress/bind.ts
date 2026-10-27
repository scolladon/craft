import { projectProgress } from '../../engine/src/run-progress.js'
import type {
  Binding,
  Envelope,
  LedgerGate,
  ProgressState,
  ProgressView,
  RunsDir,
} from './state'

export const LOCATE_TIMEOUT_MS = 5_000
export const DIR_TIMEOUT_MS = 5_000
export const POINTER_SUFFIX = '.pointer'
export const LEDGER_SUFFIX = '.md'
const LEDGER_SCRIPT = 'scripts/run-ledger.sh'
const LOG_PLUGIN = 'craft'
const DONE_LABEL = 'done'
export const KILL_PROBE_TIMEOUT_MS = 2_000
export const WORKING = 'working'
export const WAITING_ON_YOU = 'waiting on you'
export const WAITING_ON_BACKGROUND = 'waiting on background'
export const CLOSED = 'closed'

type Entry = { name: string; size: number; mtimeMs: number; isLink?: boolean }
export type Host = {
  plugin: { root: string }
  process: {
    run: (
      argv: readonly string[],
      init?: { cwd?: string; timeoutMs?: number },
    ) => Promise<{ exitCode: number; stdout: string }>
  }
  fs: {
    list: (path?: string) => Promise<Entry[]>
    read: (path: string) => Promise<string | { base64: string }>
  }
  ui: {
    status: (text: string | undefined) => void
    log: (text: string, options?: { to?: 'transcript' | 'debug' }) => void
  }
}

function ledgerArgv($: Host, ...args: string[]): string[] {
  return ['bash', `${$.plugin.root}/${LEDGER_SCRIPT}`, ...args]
}

export async function resolveRunsDir($: Host, cwd: string): Promise<RunsDir> {
  const result = await $.process.run(ledgerArgv($, 'dir'), {
    cwd,
    timeoutMs: DIR_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) return { kind: 'unavailable' }
  return { kind: 'known', path: result.stdout.trim() }
}

export function hasPointer(entries: readonly Entry[]): boolean {
  return entries.some(
    entry => entry.name.endsWith(POINTER_SUFFIX) && !entry.isLink,
  )
}

export async function locate(
  $: Host,
  envelope: Envelope,
): Promise<Binding | null> {
  const argv = ledgerArgv($, 'locate', '--transcript', envelope.transcriptPath)
  const result = await $.process.run(argv, {
    cwd: envelope.cwd,
    timeoutMs: LOCATE_TIMEOUT_MS,
  })
  const [runId, ledgerPath] = result.stdout.trim().split(/\s+/)
  if (!runId || !ledgerPath) return null
  return { runId, ledgerPath }
}

export function ledgerEntry(
  entries: readonly Entry[],
  runId: string,
): Entry | undefined {
  return entries.find(entry => entry.name === `${runId}${LEDGER_SUFFIX}`)
}

function currentPhase(view: ProgressView): string {
  return view.inFlight[0] ?? view.next ?? DONE_LABEL
}

function completedCount(view: ProgressView): number {
  return view.items.filter(item => item.status === 'completed').length
}

export function statusLine(
  runId: string,
  view: ProgressView,
  attention: string,
): string {
  const line = `craft ${runId} · ${currentPhase(view)} · ${completedCount(view)}/${view.items.length}`
  return attention === '' ? line : `${line} · ${attention}`
}

function sameGate(entry: Entry, gate: LedgerGate | null): boolean {
  return gate?.mtimeMs === entry.mtimeMs && gate.size === entry.size
}

export function unbind($: Host, state: ProgressState): ProgressState {
  $.ui.status(undefined)
  return {
    ...state,
    binding: null,
    gate: null,
    view: null,
    attention: '',
    isPaneOpened: false,
  }
}

function markClosed($: Host, state: ProgressState): ProgressState {
  const { binding, view } = state
  if (state.attention === CLOSED) return state
  if (binding !== null && view !== null) {
    $.ui.status(statusLine(binding.runId, view, CLOSED))
  }
  return { ...state, attention: CLOSED }
}

function refuseLink($: Host, state: ProgressState): ProgressState {
  $.ui.log(`${LOG_PLUGIN}: ledger entry is a link, refusing to read it`, {
    to: 'debug',
  })
  return unbind($, state)
}

export async function refresh(
  $: Host,
  state: ProgressState,
): Promise<ProgressState> {
  const { binding, runsDir } = state
  if (binding === null || runsDir.kind !== 'known') return state
  const entry = ledgerEntry(await $.fs.list(runsDir.path), binding.runId)
  if (entry === undefined) return markClosed($, state)
  if (entry.isLink) return refuseLink($, state)
  if (sameGate(entry, state.gate)) return state
  const text = await $.fs.read(binding.ledgerPath)
  if (typeof text !== 'string') return state
  const view = projectProgress(text.split('\n'), binding.runId) as ProgressView
  $.ui.status(statusLine(binding.runId, view, state.attention))
  return {
    ...state,
    view,
    gate: { mtimeMs: entry.mtimeMs, size: entry.size },
  }
}

async function withRunsDir($: Host, state: ProgressState, cwd: string) {
  if (state.runsDir.kind !== 'unknown') return state
  return { ...state, runsDir: await resolveRunsDir($, cwd) }
}

export async function bind(
  $: Host,
  state: ProgressState,
): Promise<ProgressState> {
  const { envelope } = state
  if (state.binding !== null || envelope === null) return state
  const resolved = await withRunsDir($, state, envelope.cwd)
  if (resolved.runsDir.kind !== 'known') return resolved
  const entries = await $.fs.list(resolved.runsDir.path)
  if (!hasPointer(entries)) return resolved
  return { ...resolved, binding: await locate($, envelope) }
}

export async function failOpen(
  $: Host,
  event: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    $.ui.log(`${LOG_PLUGIN}: ${event}: ${message}`, { to: 'debug' })
  }
}

async function isAlive($: Host, pid: number): Promise<boolean> {
  let alive = false
  await failOpen($, 'kill-probe', async () => {
    const probe = await $.process.run(['kill', '-0', String(pid)], {
      timeoutMs: KILL_PROBE_TIMEOUT_MS,
    })
    alive = probe.exitCode === 0
  })
  return alive
}

export function waitingOnYou(view: ProgressView): string {
  return `${WAITING_ON_YOU} — ${currentPhase(view)}`
}

export async function attentionAfterTurn(
  $: Host,
  view: ProgressView,
): Promise<string> {
  for (const { phase, pid } of view.background) {
    if (await isAlive($, pid)) return `${WAITING_ON_BACKGROUND} — ${phase}`
  }
  return waitingOnYou(view)
}

export function withAttention(
  $: Host,
  state: ProgressState,
  attention: string,
): ProgressState {
  const { binding, view } = state
  if (binding !== null && view !== null) {
    $.ui.status(statusLine(binding.runId, view, attention))
  }
  return { ...state, attention }
}
