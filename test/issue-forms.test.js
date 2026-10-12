'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const FORMS_DIR = path.join(ROOT, '.github', 'ISSUE_TEMPLATE')
const yaml = require('node:module').createRequire(
  path.join(ROOT, 'engine', 'package.json')
)('js-yaml')

const BUG_FORM = 'bug-report.yml'
const FEATURE_FORM = 'feature-request.yml'
const ADAPTER_FORM = 'adapter-request.yml'
const SECURITY_FORM = 'security-contact.yml'
const CONFIG_FILE = 'config.yml'
const FORM_FILES = [BUG_FORM, FEATURE_FORM, ADAPTER_FORM, SECURITY_FORM]

// Snapshot of the repository's labels; a label missing here is silently dropped by the forge.
const KNOWN_LABELS = [
  'bug',
  'documentation',
  'duplicate',
  'enhancement',
  'good first issue',
  'help wanted',
  'invalid',
  'question',
  'wontfix',
]

const ELEMENT_TYPES = ['markdown', 'textarea', 'input', 'dropdown', 'checkboxes', 'upload']
const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const REQUIRED_ATTRIBUTES = Object.freeze({
  markdown: ['value'],
  textarea: ['label'],
  input: ['label'],
  dropdown: ['label', 'options'],
  checkboxes: ['label', 'options'],
  upload: ['label'],
})
const FREE_TEXT_TYPES = ['textarea', 'input']
const WARNING_PHRASE = 'Do not include vulnerability details'
const CONFIRMATION_PHRASE = 'no vulnerability details'
const SECURITY_POLICY_SUFFIX = '/SECURITY.md'
const ADAPTER_QUESTION_IDS = ['runtime', 'headless', 'deny-surface', 'subagents']

const loadYaml = fileName =>
  yaml.load(fs.readFileSync(path.join(FORMS_DIR, fileName), 'utf8'))

const loadForms = () =>
  Object.fromEntries(FORM_FILES.map(fileName => [fileName, loadYaml(fileName)]))

const elementViolations = (element, fileName, seenIds) => {
  if (!ELEMENT_TYPES.includes(element.type)) {
    return [`${fileName}: unknown element type ${element.type}`]
  }
  const violations = []
  if (element.id !== undefined) {
    if (element.type === 'markdown') {
      violations.push(`${fileName}: a markdown element cannot carry an id`)
    }
    if (!ID_PATTERN.test(element.id)) {
      violations.push(`${fileName}: invalid element id ${element.id}`)
    }
    if (seenIds.has(element.id)) {
      violations.push(`${fileName}: duplicate element id ${element.id}`)
    }
    seenIds.add(element.id)
  }
  const attributes = element.attributes || {}
  for (const attribute of REQUIRED_ATTRIBUTES[element.type]) {
    if (!attributes[attribute]) {
      violations.push(`${fileName}: ${element.type} lacks attribute ${attribute}`)
    }
  }
  if (Array.isArray(attributes.options) && element.type === 'dropdown') {
    if (new Set(attributes.options).size !== attributes.options.length) {
      violations.push(`${fileName}: dropdown options are not distinct`)
    }
  }
  return violations
}

const formViolations = (form, fileName) => {
  const violations = []
  for (const key of ['name', 'description']) {
    if (typeof form[key] !== 'string' || form[key] === '') {
      violations.push(`${fileName}: missing ${key}`)
    }
  }
  if (!Array.isArray(form.body) || form.body.length === 0) {
    return [...violations, `${fileName}: body must be a non-empty array`]
  }
  for (const label of form.labels || []) {
    if (!KNOWN_LABELS.includes(label)) {
      violations.push(`${fileName}: unknown label ${label}`)
    }
  }
  const seenIds = new Set()
  for (const element of form.body) {
    violations.push(...elementViolations(element, fileName, seenIds))
  }
  return violations
}

const formSetViolations = forms => {
  const names = Object.values(forms).map(form => form.name)
  return names
    .filter((name, index) => names.indexOf(name) !== index)
    .map(name => `issue forms: duplicate name ${name}`)
}

const configViolations = config => {
  const violations = []
  if (typeof config.blank_issues_enabled !== 'boolean') {
    violations.push(`${CONFIG_FILE}: blank_issues_enabled must be a boolean`)
  }
  for (const link of config.contact_links || []) {
    for (const key of ['name', 'url', 'about']) {
      if (typeof link[key] !== 'string' || link[key] === '') {
        violations.push(`${CONFIG_FILE}: contact link lacks ${key}`)
      }
    }
  }
  return violations
}

const securityFormViolations = form => {
  const violations = []
  const body = form.body || []
  if (body.some(element => FREE_TEXT_TYPES.includes(element.type))) {
    violations.push(`${SECURITY_FORM}: no free-text element allowed`)
  }
  const first = body[0]
  if (!first || first.type !== 'markdown' || !String(first.attributes.value).includes(WARNING_PHRASE)) {
    violations.push(`${SECURITY_FORM}: first element must be the markdown warning`)
  }
  const confirmed = body.some(
    element =>
      element.type === 'checkboxes' &&
      element.attributes.options.some(
        option => option.required === true && option.label.includes(CONFIRMATION_PHRASE)
      )
  )
  if (!confirmed) {
    violations.push(`${SECURITY_FORM}: a required no-details confirmation is missing`)
  }
  if (typeof form.title !== 'string' || form.title === '') {
    violations.push(`${SECURITY_FORM}: title must be a non-empty string`)
  }
  return violations
}

describe('issue forms', () => {
  it('Given the issue template directory, when listed, then it holds the bug, feature, adapter and security forms and the chooser config', () => {
    // Arrange
    const expected = [...FORM_FILES, CONFIG_FILE].sort()

    // Act
    const sut = fs.readdirSync(FORMS_DIR).sort()

    // Assert
    assert.deepStrictEqual(sut, expected)
  })

  it('Given each issue form, when validated against the form schema, then none has a violation, names are unique and labels are existing ones', () => {
    // Arrange
    const forms = loadForms()

    // Act
    const sut = [
      ...Object.entries(forms).flatMap(([fileName, form]) => formViolations(form, fileName)),
      ...formSetViolations(forms),
    ]

    // Assert
    assert.deepStrictEqual(sut, [])
  })

  it('Given the adapter request form, then it asks for the runtime, headless execution, deny surface and subagent dispatch', () => {
    // Arrange
    const form = loadYaml(ADAPTER_FORM)

    // Act
    const sut = form.body.map(element => element.id)

    // Assert
    for (const id of ADAPTER_QUESTION_IDS) {
      assert.ok(sut.includes(id), `${ADAPTER_FORM}: missing element ${id}`)
    }
  })

  it('Given the chooser config, then blank issues are a boolean and one contact link points at the security policy', () => {
    // Arrange
    const config = loadYaml(CONFIG_FILE)

    // Act
    const sut = configViolations(config)

    // Assert
    assert.deepStrictEqual(sut, [])
    assert.ok(config.contact_links.some(link => link.url.endsWith(SECURITY_POLICY_SUFFIX)))
  })

  it('Given the security contact form, then it has no free-text field, warns first and requires the no-details confirmation', () => {
    // Arrange
    const form = loadYaml(SECURITY_FORM)

    // Act
    const sut = securityFormViolations(form)

    // Assert
    assert.deepStrictEqual(sut, [])
  })
})

describe('issue form validators', () => {
  const validForm = () => ({
    name: 'Sample',
    description: 'Sample form',
    body: [{ type: 'textarea', id: 'what', attributes: { label: 'What' } }],
  })

  it('Given a markdown element carrying an id, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body.push({ type: 'markdown', id: 'note', attributes: { value: 'x' } })

    // Act
    const sut = formViolations(form, BUG_FORM)

    // Assert
    assert.ok(sut.some(message => message.startsWith(BUG_FORM) && message.includes('markdown')))
  })

  it('Given a dropdown with duplicate options, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body.push({ type: 'dropdown', attributes: { label: 'Pick', options: ['a', 'a'] } })

    // Act
    const sut = formViolations(form, BUG_FORM)

    // Assert
    assert.ok(sut.some(message => message.startsWith(BUG_FORM) && message.includes('distinct')))
  })

  it('Given a label absent from the snapshot, when validated, then the message names the file', () => {
    // Arrange
    const form = { ...validForm(), labels: ['adapter'] }

    // Act
    const sut = formViolations(form, ADAPTER_FORM)

    // Assert
    assert.ok(sut.some(message => message.startsWith(ADAPTER_FORM) && message.includes('adapter')))
  })

  it('Given an element of type select, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body.push({ type: 'select', attributes: { label: 'Pick', options: ['a'] } })

    // Act
    const sut = formViolations(form, FEATURE_FORM)

    // Assert
    assert.ok(sut.some(message => message.startsWith(FEATURE_FORM) && message.includes('select')))
  })

  it('Given two forms sharing a name, when validated as a set, then the duplicate is reported', () => {
    // Arrange
    const forms = { a: validForm(), b: validForm() }

    // Act
    const sut = formSetViolations(forms)

    // Assert
    assert.strictEqual(sut.length, 1)
  })

  it('Given a config with a non-boolean blank flag, when validated, then it is reported', () => {
    // Arrange
    const config = { blank_issues_enabled: 'yes', contact_links: [] }

    // Act
    const sut = configViolations(config)

    // Assert
    assert.strictEqual(sut.length, 1)
  })

  describe('security form mutations', () => {
    const mutate = change => {
      const form = loadYaml(SECURITY_FORM)
      change(form)
      return securityFormViolations(form)
    }

    it('Given a textarea appended to the security form, when validated, then the message names the file', () => {
      // Arrange
      const change = form => form.body.push({ type: 'textarea', attributes: { label: 'Details' } })

      // Act
      const sut = mutate(change)

      // Assert
      assert.ok(sut.length > 0 && sut.every(message => message.startsWith(SECURITY_FORM)))
    })

    it('Given the confirmation without required, when validated, then the message names the file', () => {
      // Arrange
      const change = form => delete form.body[1].attributes.options[0].required

      // Act
      const sut = mutate(change)

      // Assert
      assert.ok(sut.length > 0 && sut.every(message => message.startsWith(SECURITY_FORM)))
    })

    it('Given the markdown moved after the checkboxes, when validated, then the message names the file', () => {
      // Arrange
      const change = form => form.body.reverse()

      // Act
      const sut = mutate(change)

      // Assert
      assert.ok(sut.length > 0 && sut.every(message => message.startsWith(SECURITY_FORM)))
    })
  })
})
