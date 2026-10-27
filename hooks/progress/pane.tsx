import type { ProgressChild, ProgressItem, ProgressView } from './state'

export const PANE = 'craft-progress'
export const PANE_TITLE = 'craft run'
const GLYPHS: Record<string, string> = {
  completed: '✓',
  in_progress: '▸',
  pending: '·',
}
const CHILD_INDENT = '  '
const LEDGER_ONLY = 'ledger-only'
const NO_PIPELINE = 'pipeline list unavailable'

type Row = { label: string; status: string; note: string }
type Elements = {
  Box: (props: { flexDirection?: 'column' | 'row'; width?: number; children?: unknown }) => unknown
  Text: (props: { dimColor?: boolean; children?: unknown }) => unknown
}

function glyph(status: string): string {
  return GLYPHS[status] ?? GLYPHS.pending
}

function row({ Box, Text }: Elements, indent: string, entry: Row) {
  return (
    <Box flexDirection="row">
      <Text>{`${indent}${glyph(entry.status)} ${entry.label}`}</Text>
      {entry.note === '' ? null : <Text dimColor>{` ${entry.note}`}</Text>}
    </Box>
  )
}

function itemRows(ui: Elements, item: ProgressItem) {
  const children = item.children.map((child: ProgressChild) =>
    row(ui, CHILD_INDENT, child),
  )
  return [row(ui, '', { ...item, label: item.id }), ...children]
}

function footerLines(view: ProgressView): string[] {
  const warnings =
    view.warnings.length > 0 ? [`${view.warnings.length} warning(s)`] : []
  return view.source === LEDGER_ONLY ? [...warnings, NO_PIPELINE] : warnings
}

export function progressPane(ui: Elements, view: ProgressView, columns: number) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" width={columns}>
      {view.items.flatMap(item => itemRows(ui, item))}
      {footerLines(view).map(line => (
        <Text dimColor>{line}</Text>
      ))}
    </Box>
  )
}
