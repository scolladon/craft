import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const RUNS = '/runs'
const LEDGER = `${RUNS}/demo.md`
const ENVELOPE = { transcript_path: '/t/demo.jsonl', cwd: '/work' }
const POINTER = { name: 'demo.pointer', kind: 'file', size: 1, mtimeMs: 1, isLink: false }
const ENTRY = { name: 'demo.md', kind: 'file', size: 100, mtimeMs: 10, isLink: false }
const LINKED_ENTRY = { ...ENTRY, isLink: true }
const LEDGER_LINES = [
  '# craft run record (append-only)',
  'demo resolve EFFECTIVE: workspace,planning,implementation',
  'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
  'demo workspace PHASE-DONE(workspace): worktree',
  'demo planning PHASE-START(planning): 2026-10-27T09:10:00Z',
]
const PANE = {
  plugin: 'craft',
  component: 'Pane',
  requestId: 'craft-progress',
  surface: 'terminal',
  props: {
    title: 'craft run',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const BAND = {
  plugin: 'craft',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 } },
} as const
const docked = (isFullscreen: boolean) => ({ columns: 200, rows: 50, isFullscreen })
const result = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

type Rig = {
  spawned: string[][]
  statuses: (string | undefined)[]
  logs: string[]
  reads: number
  registered: string[]
  opened: string[]
}

function rig(on: On, entries: () => unknown[], readFails: () => boolean = () => false) {
  const state: Rig = { spawned: [], statuses: [], logs: [], reads: 0, registered: [], opened: [] }
  on('process.run', (_, e) => {
    state.spawned.push([...e.argv])
    return result(0, e.argv[2] === 'dir' ? `${RUNS}\n` : `demo ${LEDGER}\n`)
  })
  on('fs.exists', () => ({ value: true }))
  on('fs.list', () => ({ value: entries() }))
  on('fs.read', () => {
    state.reads += 1
    return readFails() ? { deny: 'read exploded' } : { value: LEDGER_LINES.join('\n') }
  })
  on('ui.status', (_, e) => { state.statuses.push(e.text); return { value: undefined } })
  on('ui.log', (_, e) => { state.logs.push(`${e.to}|${e.text}`); return { value: undefined } })
  on('command.register', (_, e) => { state.registered.push(e.name); return { value: { command: e.name } } })
  on('ui.open', (_, e) => { state.opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('classic.SessionStart', (_, e) => e)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('classic.PostToolUse', (_, e) => e)
  on('session.compact', (_, e) => ({ messages: e.messages }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  return state
}

const bash = () => ({ ...ENVELOPE, tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'u' })
const turnStart = () => ({ text: 'go', turnId: 't1' })
const compact = () => ({ trigger: 'manual', messages: [{ role: 'user', text: 'x', toolUses: [] }] })
const end = (reason: string) => ({ reason, sessionId: 's1', resume: { id: 's1' } })
const spawnedLocates = (sut: Rig) => sut.spawned.filter(argv => argv[2] === 'locate').length

test('Given a bound session and an unchanged ledger entry, when session.compact runs, then the ledger is re-read and re-projected', async ($, on) => {
  const sut = rig(on, () => [POINTER, ENTRY])
  await $.classic.PostToolUse(bash() as never)

  await $.session.compact(compact() as never)

  expect(sut.reads).toBe(2)
  expect(sut.statuses.at(-1)).toBe('craft ■▶□ 1/3 · ▸ planning · next implementation')
})

test('Given session.end, when it runs, then the status line is cleared and the next trigger re-runs locate', async ($, on) => {
  const sut = rig(on, () => [POINTER, ENTRY])
  await $.classic.PostToolUse(bash() as never)

  await $.session.end(end('clear') as never)
  await $.classic.PostToolUse(bash() as never)

  expect(sut.statuses).toContain(undefined)
  expect(spawnedLocates(sut)).toBe(2)
})

test('Given a bound session whose ledger entry is gone from the listing, when a trigger runs, then the status shows closed, and at the next turn.start the session unbinds', async ($, on) => {
  let entries: unknown[] = [POINTER, ENTRY]
  const sut = rig(on, () => entries)
  await $.classic.PostToolUse(bash() as never)
  entries = [POINTER]

  await $.classic.PostToolUse(bash() as never)
  const closed = sut.statuses.at(-1)
  await $.turn.start(turnStart() as never)

  expect(closed).toBe('craft ■▶□ 1/3 · ▸ planning · next implementation · closed')
  expect(sut.statuses.at(-1)).toBeUndefined()
})

test('Given the ledger entry is a link, when a trigger runs, then it is not read, the session unbinds and a debug line is logged', async ($, on) => {
  let entries: unknown[] = [POINTER, ENTRY]
  const sut = rig(on, () => entries)
  await $.classic.PostToolUse(bash() as never)
  entries = [POINTER, { ...LINKED_ENTRY, mtimeMs: 11 }]

  await $.classic.PostToolUse(bash() as never)

  expect(sut.reads).toBe(1)
  expect(sut.statuses.at(-1)).toBeUndefined()
  expect(sut.logs.some(line => line.startsWith('debug|'))).toBe(true)
})

test('Given the ledger read is refused, when a trigger runs, then the previous view stays and a debug line is logged', async ($, on) => {
  let entries: unknown[] = [POINTER, ENTRY]
  let fails = false
  const sut = rig(on, () => entries, () => fails)
  await $.classic.PostToolUse(bash() as never)
  entries = [POINTER, { ...ENTRY, mtimeMs: 11 }]
  fails = true

  await $.classic.PostToolUse(bash() as never)

  expect(sut.statuses.at(-1)).toBe('craft ■▶□ 1/3 · ▸ planning · next implementation')
  expect(sut.logs.some(line => line.startsWith('debug|'))).toBe(true)
})

test('Given the ledger entry is a link, when later triggers run, then locate is not spawned again', async ($, on) => {
  let entries: unknown[] = [POINTER, ENTRY]
  const sut = rig(on, () => entries)
  await $.classic.PostToolUse(bash() as never)
  entries = [POINTER, { ...LINKED_ENTRY, mtimeMs: 11 }]
  await $.classic.PostToolUse(bash() as never)

  await $.classic.PostToolUse(bash() as never)
  await $.classic.PostToolUse(bash() as never)

  expect(spawnedLocates(sut)).toBe(1)
})

test('Given a session start, when it runs, then no command is registered', async ($, on) => {
  const sut = rig(on, () => [POINTER, ENTRY])

  await $.classic.SessionStart({ ...ENVELOPE, source: 'startup' } as never)

  expect(sut.registered).toEqual([])
})

test('Given a fullscreen AbovePrompt band was drawn, when the session binds, then no pane is opened', async ($, on) => {
  const sut = rig(on, () => [POINTER, ENTRY])
  const band = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: docked(true) } as never)

  await $.classic.PostToolUse(bash() as never)

  expect(sut.opened).toEqual([])
  await band.unmount()
})

test('Given a fullscreen band, when it mounts, then neither a status nor a pane is pushed by the mount', async ($, on) => {
  const sut = rig(on, () => [POINTER, ENTRY])

  const band = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: docked(true) } as never)

  expect(sut.statuses).toEqual([])
  expect(sut.opened).toEqual([])
  await band.unmount()
})

test('Given a bound session, when the craft-progress Pane is mounted, then the engine own content renders', async ($, on) => {
  rig(on, () => [POINTER, ENTRY])
  await $.classic.PostToolUse(bash() as never)

  const sut = await $.ui.mount(PANE)

  expect(await sut.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await sut.unmount()
})
