'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const ROOT = path.join(__dirname, '..')
const yaml = createRequire(path.join(ROOT, 'engine', 'package.json'))('js-yaml')

const IMAGE_PATTERN = /^mcr\.microsoft\.com\/devcontainers\/javascript-node:(\d+)$/
const CLAUDE_FEATURE = 'ghcr.io/anthropics/devcontainer-features/claude-code:1'
const CODESPACES_URL = 'https://codespaces.new/scolladon/craft'
const SMOKE_HEADING = '## Devcontainer cold-start smoke — not CI-gated'
const DEVCONTAINER_LINK = '](.devcontainer/devcontainer.json)'
const POST_CREATE_COMMAND = 'bash scripts/install-dev-tools.sh && npm --prefix engine ci'
const CODESPACES_BADGE = /^\[!\[[^\]]*\]\(https:\/\/img\.shields\.io\/[^)]+\)\]\(https:\/\/codespaces\.new\/scolladon\/craft\)$/

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function ciNodeMajor() {
  const ci = yaml.load(read('.github/workflows/ci.yml'))
  const step = ci.jobs.ci.steps.find(s => String(s.uses).startsWith('actions/setup-node'))
  return Number(step.with['node-version'])
}

test('Given the devcontainer definition, when parsed, then it uses the CI Node major, adds the Claude Code feature and runs the shared install then the engine install', () => {
  // Arrange
  const text = read('.devcontainer/devcontainer.json')

  // Act
  const sut = JSON.parse(text)

  // Assert
  const image = IMAGE_PATTERN.exec(sut.image)
  assert.ok(image, `image ${sut.image} does not match ${IMAGE_PATTERN}`)
  assert.strictEqual(Number(image[1]), ciNodeMajor())
  assert.ok(CLAUDE_FEATURE in sut.features)
  assert.strictEqual(sut.postCreateCommand, POST_CREATE_COMMAND)
})

test('Given README.md, when its Codespace lines are read, then it carries a Codespaces badge and its Codespace prose states no duration', () => {
  // Arrange
  const lines = read('README.md').split('\n')

  // Act
  const sut = lines.filter(l => l.includes('Codespace') && !l.startsWith('[!['))

  // Assert
  assert.ok(lines.some(l => CODESPACES_BADGE.test(l)), `no shields badge linking ${CODESPACES_URL}`)
  assert.ok(sut.length > 0)
  for (const line of sut) assert.ok(!/\d/.test(line), `duration-like digit in: ${line}`)
})

test('Given the maintainer smokes, when their headings are read, then the devcontainer cold start has a not-CI-gated smoke', () => {
  // Arrange
  const lines = read('docs/contributing/maintainer-smokes.md').split('\n')

  // Act
  const sut = lines.includes(SMOKE_HEADING)

  // Assert
  assert.ok(sut)
})

test('Given CONTRIBUTING.md, when read, then its set-up section offers the devcontainer', () => {
  // Arrange
  const text = read('CONTRIBUTING.md')

  // Act
  const sut = text.includes(DEVCONTAINER_LINK)

  // Assert
  assert.ok(sut)
})
