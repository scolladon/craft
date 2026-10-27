import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const RUNS = '/runs'
const LEDGER = `${RUNS}/demo.md`
const ENVELOPE = { transcript_path: '/t/demo.jsonl', cwd: '/work' }
const POINTER = { name: 'demo.pointer', kind: 'file', size: 1, mtimeMs: 1, isLink: false }
const ENTRY = { name: 'demo.md', kind: 'file', size: 100, mtimeMs: 10, isLink: false }
const REVIEW_LEDGER = [
  '# craft run record (append-only)',
  'demo resolve EFFECTIVE: workspace,review,propose',
  'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
  'demo workspace PHASE-DONE(workspace): worktree',
  'demo review PHASE-START(review): 2026-10-27T09:40:00Z',
  'demo review FINDINGS(code): c1 /tmp/x/code.c1.json n=5',
  'demo review FINDINGS(code): c2 /tmp/x/code.c2.json n=0',
]
const LEDGER_ONLY = [
  '# craft run record (append-only)',
  'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
  'demo workspace PHASE-DONE(workspace): worktree',
  'demo workspace PHASE-DONE(workspace): twice',
]
const PANE_ID = 'craft-progress'
const PANE = {
  plugin: 'craft',
  component: 'Pane',
  requestId: PANE_ID,
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
const result = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

type Opens = { opened: string[]; registered: string[] }

function rig(on: On, ledger: string[]): Opens {
  const seen: Opens = { opened: [], registered: [] }
  on('command.register', (_, e) => { seen.registered.push(e.name); return { value: { command: e.name } } })
  on('ui.open', (_, e) => { seen.opened.push(e.id); return { value: { isPlaced: true } } })
  on('classic.SessionStart', (_, e) => e)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('process.run', (_, e) => result(0, e.argv[2] === 'dir' ? `${RUNS}\n` : `demo ${LEDGER}\n`))
  on('fs.list', () => ({ value: [POINTER, ENTRY] }))
  on('fs.read', () => ({ value: ledger.join('\n') }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('classic.PostToolUse', (_, e) => e)
  return seen
}

const bash = () => ({ ...ENVELOPE, tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'u' })

test('Given a bound session in review with two cycles, when the craft-progress pane renders, then it lists every item with its glyph and nests the cycles', async ($, on) => {
  rig(on, REVIEW_LEDGER)
  await $.classic.PostToolUse(bash() as never)

  const sut = await $.ui.mount(PANE)

  expect((await sut.find({ type: 'Text', text: /✓ workspace/ }))?.text).toContain('✓ workspace')
  expect((await sut.find({ type: 'Text', text: /▸ review/ }))?.text).toContain('▸ review')
  expect((await sut.find({ type: 'Text', text: /· propose/ }))?.text).toContain('· propose')
  expect((await sut.find({ type: 'Text', text: /^ {2}✓ cycle 1/ }))?.text).toContain('cycle 1')
  expect((await sut.find({ type: 'Text', text: /^ {2}▸ cycle 2/ }))?.text).toContain('cycle 2')
  await sut.unmount()
})

test('Given a ledger-only view with one warning, when the pane renders, then the footer shows the warning count and pipeline list unavailable', async ($, on) => {
  rig(on, LEDGER_ONLY)
  await $.classic.PostToolUse(bash() as never)

  const sut = await $.ui.mount(PANE)

  expect((await sut.find({ type: 'Text', text: /1 warning/ }))?.text).toContain('1 warning')
  expect((await sut.find({ type: 'Text', text: /pipeline list unavailable/ }))?.text).toContain('pipeline list unavailable')
  await sut.unmount()
})

const BAND = {
  plugin: 'craft',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 } },
} as const
const docked = (isFullscreen: boolean) => ({ columns: 200, rows: 50, isFullscreen })

test('Given a session start, when it runs, then the craft-progress command is registered, and running it opens the craft-progress pane', async ($, on) => {
  const sut = rig(on, REVIEW_LEDGER)
  on('command.run', (_, e) => ({ text: e.command }))

  await $.classic.SessionStart({ ...ENVELOPE, source: 'startup' } as never)
  await $.command.run({ command: 'craft-progress' } as never)

  expect(sut.registered).toEqual(['craft-progress'])
  expect(sut.opened).toEqual([PANE_ID])
})

test('Given a docked surface, when the session binds, then the pane opens once and not again on the next trigger', async ($, on) => {
  const sut = rig(on, REVIEW_LEDGER)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: docked(true) } as never)


  await $.classic.PostToolUse(bash() as never)
  await $.classic.PostToolUse(bash() as never)

  expect(sut.opened).toEqual([PANE_ID])
})

test('Given a surface that does not dock panes, when the session binds, then the pane stays closed', async ($, on) => {
  const sut = rig(on, REVIEW_LEDGER)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: docked(false) } as never)


  await $.classic.PostToolUse(bash() as never)

  expect(sut.opened).toEqual([])
})
