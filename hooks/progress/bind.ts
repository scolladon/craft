import { projectProgress } from '../../engine/src/run-progress.js'
import type {
  Envelope,
  LedgerGate,
  LocateMiss,
  ProgressState,
  ProgressView,
  RunsDir,
} from './state'
import { DONE_LABEL, completedCount, statusLine } from './status-line'

export const LOCATE_TIMEOUT_MS = 5_000
export const DIR_TIMEOUT_MS = 5_000
export const POINTER_SUFFIX = '.pointer'
export const LEDGER_SUFFIX = '.md'
const LEDGER_SCRIPT = 'scripts/run-ledger.sh'
const LOG_PLUGIN = 'craft'
const RUN_KEY_SEPARATOR = ' '
// The pointer lands one tool call before the transcript holds its run-key, so a new
// pointer set earns one retry before its miss is trusted.
const MAX_LOCATE_ATTEMPTS = 2
// `kill -0` on 0 or 1 addresses the caller's process group or init and always succeeds.
const MIN_PROBED_PID = 2
export const KILL_PROBE_TIMEOUT_MS = 2_000
export const WORKING = 'working'
export const WAITING_ON_YOU = 'waiting on you'
export const WAITING_ON_BACKGROUND = 'waiting on background'
export const CLOSED = 'closed'

export type Patch = Partial<ProgressState>
export const UNBOUND: Patch = {
  binding: null,
  gate: null,
  view: null,
  attention: '',
}

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
    exists: (path: string) => Promise<boolean>
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

function logDebug($: Host, text: string): void {
  $.ui.log(`${LOG_PLUGIN}: ${text}`, { to: 'debug' })
}

async function resolveRunsDir($: Host, cwd: string): Promise<RunsDir> {
  const result = await $.process.run(ledgerArgv($, 'dir'), {
    cwd,
    timeoutMs: DIR_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) return { kind: 'unavailable' }
  return { kind: 'known', path: result.stdout.trim() }
}

async function listRuns($: Host, runsDir: string): Promise<Entry[]> {
  if (!(await $.fs.exists(runsDir))) return []
  return $.fs.list(runsDir)
}

function pointerSignature(entries: readonly Entry[]): string {
  return entries
    .filter(entry => entry.name.endsWith(POINTER_SUFFIX) && !entry.isLink)
    .map(entry => `${entry.name}@${entry.mtimeMs}`)
    .sort()
    .join(',')
}

function isExhausted(miss: LocateMiss | null, signature: string): boolean {
  return miss?.signature === signature && miss.attempts >= MAX_LOCATE_ATTEMPTS
}

function nextMiss(miss: LocateMiss | null, signature: string): LocateMiss {
  const attempts = miss?.signature === signature ? miss.attempts : 0
  return { signature, attempts: attempts + 1 }
}

async function locate($: Host, envelope: Envelope): Promise<string | null> {
  const argv = ledgerArgv($, 'locate', '--transcript', envelope.transcriptPath)
  const result = await $.process.run(argv, {
    cwd: envelope.cwd,
    timeoutMs: LOCATE_TIMEOUT_MS,
  })
  const line = result.stdout.trim()
  const end = line.indexOf(RUN_KEY_SEPARATOR)
  return end > 0 ? line.slice(0, end) : null
}

function ledgerName(runId: string): string {
  return `${runId}${LEDGER_SUFFIX}`
}

function currentPhase(view: ProgressView): string {
  return view.inFlight[0] ?? view.next ?? DONE_LABEL
}

function legacyStatusLine(
  runId: string,
  view: ProgressView,
  attention: string,
): string {
  const line = `craft ${runId} · ${currentPhase(view)} · ${completedCount(view)}/${view.items.length}`
  return attention === '' ? line : `${line} · ${attention}`
}

export function statusText(state: ProgressState): string | undefined {
  const { binding, view } = state
  if (binding === null || view === null) return undefined
  if (view.source === 'effective') return statusLine(view, state.attention)
  return legacyStatusLine(binding.runId, view, state.attention)
}

function sameGate(entry: Entry, gate: LedgerGate | null): boolean {
  return gate?.mtimeMs === entry.mtimeMs && gate.size === entry.size
}

function closedPatch(state: ProgressState): Patch {
  return state.attention === CLOSED ? {} : { attention: CLOSED }
}

function refuseLink($: Host, entries: readonly Entry[]): Patch {
  logDebug($, 'ledger entry is a link, refusing to read it')
  const signature = pointerSignature(entries)
  return { ...UNBOUND, locateMiss: { signature, attempts: MAX_LOCATE_ATTEMPTS } }
}

async function readLedger(
  $: Host,
  path: string,
  runId: string,
  gate: LedgerGate,
): Promise<Patch> {
  const text = await $.fs.read(path)
  if (typeof text !== 'string') {
    logDebug($, `ledger of ${runId} is not text, keeping the previous view`)
    return { gate }
  }
  const view = projectProgress(text.split('\n'), runId) as ProgressView
  return { view, gate }
}

export async function refresh($: Host, state: ProgressState): Promise<Patch> {
  const { binding, runsDir } = state
  if (binding === null || runsDir.kind !== 'known') return {}
  const entries = await listRuns($, runsDir.path)
  const name = ledgerName(binding.runId)
  const entry = entries.find(candidate => candidate.name === name)
  if (entry === undefined) return closedPatch(state)
  if (entry.isLink) return refuseLink($, entries)
  if (sameGate(entry, state.gate)) return {}
  const gate = { mtimeMs: entry.mtimeMs, size: entry.size }
  return readLedger($, `${runsDir.path}/${name}`, binding.runId, gate)
}

async function runsDirPatch(
  $: Host,
  state: ProgressState,
  cwd: string,
): Promise<{ runsDir?: RunsDir }> {
  if (state.runsDir.kind !== 'unknown') return {}
  return { runsDir: await resolveRunsDir($, cwd) }
}

async function locatePatch(
  $: Host,
  state: ProgressState,
  envelope: Envelope,
  signature: string,
): Promise<Patch> {
  const runId = await locate($, envelope)
  if (runId === null) return { locateMiss: nextMiss(state.locateMiss, signature) }
  return { binding: { runId }, locateMiss: null }
}

export async function bind($: Host, state: ProgressState): Promise<Patch> {
  const { envelope } = state
  if (state.binding !== null || envelope === null) return {}
  const resolved = await runsDirPatch($, state, envelope.cwd)
  const runsDir = resolved.runsDir ?? state.runsDir
  if (runsDir.kind !== 'known') return resolved
  const signature = pointerSignature(await listRuns($, runsDir.path))
  if (signature === '' || isExhausted(state.locateMiss, signature)) {
    return resolved
  }
  return { ...resolved, ...(await locatePatch($, state, envelope, signature)) }
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
    logDebug($, `${event}: ${message}`)
  }
}

function isProbeablePid(pid: number): boolean {
  return Number.isSafeInteger(pid) && pid >= MIN_PROBED_PID
}

async function isAlive($: Host, pid: number): Promise<boolean> {
  if (!isProbeablePid(pid)) return false
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
