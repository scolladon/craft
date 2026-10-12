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

const isPresent = value => (Array.isArray(value) ? value.length > 0 : Boolean(value))

const idViolations = (element, fileName, seenIds) => {
  if (element.id === undefined) return []
  const violations = []
  if (element.type === 'markdown') violations.push(`${fileName}: a markdown element cannot carry an id`)
  if (!ID_PATTERN.test(element.id)) violations.push(`${fileName}: invalid element id ${element.id}`)
  if (seenIds.has(element.id)) violations.push(`${fileName}: duplicate element id ${element.id}`)
  seenIds.add(element.id)
  return violations
}

const attributeViolations = (element, fileName) => {
  const attributes = element.attributes || {}
  return REQUIRED_ATTRIBUTES[element.type]
    .filter(attribute => !isPresent(attributes[attribute]))
    .map(attribute => `${fileName}: ${element.type} lacks attribute ${attribute}`)
}

const optionViolations = (element, fileName) => {
  const options = (element.attributes || {}).options
  if (element.type !== 'dropdown' || !Array.isArray(options)) return []
  return new Set(options).size === options.length ? [] : [`${fileName}: dropdown options are not distinct`]
}

const elementViolations = (element, fileName, seenIds) => {
  if (!ELEMENT_TYPES.includes(element.type)) {
    return [`${fileName}: unknown element type ${element.type}`]
  }
  return [
    ...idViolations(element, fileName, seenIds),
    ...attributeViolations(element, fileName),
    ...optionViolations(element, fileName),
  ]
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

const hasConfirmation = element =>
  element.type === 'checkboxes' &&
  element.attributes.options.some(
    option => option.required === true && option.label.includes(CONFIRMATION_PHRASE)
  )

const warnsFirst = first =>
  Boolean(first) && first.type === 'markdown' && String(first.attributes.value).includes(WARNING_PHRASE)

const securityFormViolations = form => {
  const body = form.body || []
  const checks = [
    [!body.some(element => FREE_TEXT_TYPES.includes(element.type)), 'no free-text element allowed'],
    [warnsFirst(body[0]), 'first element must be the markdown warning'],
    [body.some(hasConfirmation), 'a required no-details confirmation is missing'],
    [typeof form.title === 'string' && form.title !== '', 'title must be a non-empty string'],
  ]
  return checks.filter(([holds]) => !holds).map(([, message]) => `${SECURITY_FORM}: ${message}`)
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

  it('Given the adapter request form, when its element ids are read, then it asks for the runtime, headless execution, deny surface and subagent dispatch', () => {
    // Arrange
    const form = loadYaml(ADAPTER_FORM)

    // Act
    const sut = form.body.map(element => element.id)

    // Assert
    for (const id of ADAPTER_QUESTION_IDS) {
      assert.ok(sut.includes(id), `${ADAPTER_FORM}: missing element ${id}`)
    }
  })

  it('Given the chooser config, when validated, then blank issues are a boolean and one contact link points at the security policy', () => {
    // Arrange
    const config = loadYaml(CONFIG_FILE)

    // Act
    const sut = configViolations(config)

    // Assert
    assert.deepStrictEqual(sut, [])
    assert.ok(config.contact_links.some(link => link.url.endsWith(SECURITY_POLICY_SUFFIX)))
  })

  it('Given the security contact form, when validated, then it has no free-text field, warns first and requires the no-details confirmation', () => {
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

  const namesFile = (violations, fileName, fragment) =>
    violations.some(message => message.startsWith(fileName) && message.includes(fragment))

  it('Given a dropdown with no options, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body.push({ type: 'dropdown', attributes: { label: 'Pick', options: [] } })

    // Act
    const sut = formViolations(form, BUG_FORM)

    // Assert
    assert.ok(namesFile(sut, BUG_FORM, 'lacks attribute options'), sut.join('\n'))
  })

  it('Given an element id with a space, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body[0].id = 'a b'

    // Act
    const sut = formViolations(form, BUG_FORM)

    // Assert
    assert.ok(namesFile(sut, BUG_FORM, 'invalid element id'), sut.join('\n'))
  })

  it('Given two elements sharing an id, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body.push({ type: 'input', id: 'what', attributes: { label: 'Again' } })

    // Act
    const sut = formViolations(form, BUG_FORM)

    // Assert
    assert.ok(namesFile(sut, BUG_FORM, 'duplicate element id'), sut.join('\n'))
  })

  it('Given a textarea without a label, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    form.body.push({ type: 'textarea', attributes: {} })

    // Act
    const sut = formViolations(form, BUG_FORM)

    // Assert
    assert.ok(namesFile(sut, BUG_FORM, 'textarea lacks attribute label'), sut.join('\n'))
  })

  it('Given a form without a name, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    delete form.name

    // Act
    const sut = formViolations(form, FEATURE_FORM)

    // Assert
    assert.ok(namesFile(sut, FEATURE_FORM, 'missing name'), sut.join('\n'))
  })

  it('Given a form without a description, when validated, then the message names the file', () => {
    // Arrange
    const form = validForm()
    delete form.description

    // Act
    const sut = formViolations(form, FEATURE_FORM)

    // Assert
    assert.ok(namesFile(sut, FEATURE_FORM, 'missing description'), sut.join('\n'))
  })

  it('Given a form with an empty body, when validated, then the message names the file', () => {
    // Arrange
    const form = { ...validForm(), body: [] }

    // Act
    const sut = formViolations(form, FEATURE_FORM)

    // Assert
    assert.ok(namesFile(sut, FEATURE_FORM, 'non-empty array'), sut.join('\n'))
  })

  it('Given a contact link without an about text, when validated, then it is reported', () => {
    // Arrange
    const config = { blank_issues_enabled: true, contact_links: [{ name: 'n', url: 'https://example.com' }] }

    // Act
    const sut = configViolations(config)

    // Assert
    assert.deepStrictEqual(sut, [`${CONFIG_FILE}: contact link lacks about`])
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
    it('Given an input appended to the security form, when validated, then free text is reported', () => {
      // Act
      const sut = mutate(form => form.body.push({ type: 'input', attributes: { label: 'Details' } }))

      // Assert
      assert.deepStrictEqual(sut, [`${SECURITY_FORM}: no free-text element allowed`])
    })

    it('Given the security form without a title, when validated, then the missing title is reported', () => {
      // Act
      const sut = mutate(form => delete form.title)

      // Assert
      assert.deepStrictEqual(sut, [`${SECURITY_FORM}: title must be a non-empty string`])
    })
  })
})
