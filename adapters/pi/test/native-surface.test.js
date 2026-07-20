import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON_PATH = join(ADAPTER_DIR, 'package.json');
const SETTINGS_TEMPLATE_PATH = join(ADAPTER_DIR, 'settings.template.json');
const PROMPTS_DIR = join(ADAPTER_DIR, 'prompts');
const EXTENSION_PATH = join(ADAPTER_DIR, 'extensions', 'craft-guard', 'index.ts');

const PHASES = ['run', 'review', 'validation', 'init'];
const SHELL_INJECTION_PATTERN = /!`[^`]*`/;
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

function readSettingsTemplate() {
  return JSON.parse(readFileSync(SETTINGS_TEMPLATE_PATH, 'utf8'));
}

/** Split a `---\n…\n---` frontmatter block into top-level attrs + body. No yaml dep. */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    throw new Error('missing opening frontmatter fence');
  }
  const closeIndex = lines.indexOf('---', 1);
  if (closeIndex === -1) {
    throw new Error('missing closing frontmatter fence');
  }

  const attrs = {};
  for (const line of lines.slice(1, closeIndex)) {
    const match = /^([a-zA-Z_-]+):\s?(.*)$/.exec(line);
    if (match) {
      attrs[match[1]] = match[2].trim();
    }
  }

  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { attrs, body };
}

function readPromptDef(phase) {
  const filePath = join(PROMPTS_DIR, `craft-${phase}.md`);
  const content = readFileSync(filePath, 'utf8');
  return parseFrontmatter(content);
}

function readExtensionText() {
  return readFileSync(EXTENSION_PATH, 'utf8');
}

describe('package.json — pi manifest contract', () => {
  it('Given the shipped package.json, when read, then it parses as JSON', () => {
    const sut = readPackageJson;

    const result = sut();

    assert.equal(typeof result, 'object');
  });

  it('Given the parsed package.json, when checking the pi manifest, then extensions lists craft-guard', () => {
    const sut = readPackageJson();

    const result = sut.pi?.extensions;

    assert.ok(Array.isArray(result));
    assert.ok(result.includes('extensions/craft-guard'));
  });

  it('Given the parsed package.json, when checking the pi manifest, then prompts lists the prompts dir', () => {
    const sut = readPackageJson();

    const result = sut.pi?.prompts;

    assert.ok(Array.isArray(result));
    assert.ok(result.includes('prompts'));
  });

  it('Given the parsed package.json, when checking the pi manifest, then skills is present as an array', () => {
    const sut = readPackageJson();

    const result = sut.pi?.skills;

    assert.ok(Array.isArray(result));
  });

  it('Given the parsed package.json, when checking keywords, then it includes "pi-package"', () => {
    const sut = readPackageJson();

    const result = sut.keywords;

    assert.ok(Array.isArray(result));
    assert.ok(result.includes('pi-package'));
  });

  it('Given the parsed package.json, when checking the name field, then it is unchanged', () => {
    const sut = readPackageJson();

    const result = sut.name;

    assert.equal(result, '@craft/adapter-pi');
  });

  it('Given the parsed package.json, when checking the type field, then it is unchanged', () => {
    const sut = readPackageJson();

    const result = sut.type;

    assert.equal(result, 'module');
  });

  it('Given the parsed package.json, when checking private, then it is unchanged', () => {
    const sut = readPackageJson();

    const result = sut.private;

    assert.equal(result, true);
  });

  it('Given the parsed package.json, when checking the test script, then it is unchanged', () => {
    const sut = readPackageJson();

    const result = sut.scripts?.test;

    assert.equal(result, "node --test 'test/**/*.test.js'");
  });

  it('Given the parsed package.json, when checking bin, then craft-pi still points at src/cli.js', () => {
    const sut = readPackageJson();

    const result = sut.bin?.['craft-pi'];

    assert.equal(result, 'src/cli.js');
  });
});

describe('package.json — pi manifest resource existence', () => {
  const manifest = readPackageJson().pi ?? {};
  const declaredPaths = [...(manifest.extensions ?? []), ...(manifest.prompts ?? []), ...(manifest.skills ?? [])];

  for (const declaredPath of declaredPaths) {
    it(`Given the pi manifest, when resolving declared path "${declaredPath}", then it exists on disk`, () => {
      const sut = join(ADAPTER_DIR, declaredPath);

      const result = existsSync(sut);

      assert.ok(result, `${declaredPath} declared in package.json.pi but missing on disk`);
    });
  }
});

describe('settings.template.json — provider-neutral settings contract', () => {
  it('Given the shipped settings template, when read, then it parses as JSON', () => {
    const sut = readSettingsTemplate;

    const result = sut();

    assert.equal(typeof result, 'object');
  });

  it('Given the parsed settings template, when checking skills, then it is an array', () => {
    const sut = readSettingsTemplate();

    const result = sut.skills;

    assert.ok(Array.isArray(result));
  });

  it('Given the parsed settings template, when checking prompts, then it is an array', () => {
    const sut = readSettingsTemplate();

    const result = sut.prompts;

    assert.ok(Array.isArray(result));
  });

  it('Given the parsed settings template, when checking extensions, then it is an array', () => {
    const sut = readSettingsTemplate();

    const result = sut.extensions;

    assert.ok(Array.isArray(result));
  });

  it('Given the parsed settings template, when checking defaultProjectTrust, then it is present', () => {
    const sut = readSettingsTemplate();

    const result = sut.defaultProjectTrust;

    assert.ok(result !== undefined);
  });

  it('Given the parsed settings template, when checking provider/model, then neither key is present', () => {
    const sut = readSettingsTemplate();

    assert.equal(sut.provider, undefined);
    assert.equal(sut.model, undefined);
  });
});

describe('prompts/craft-<phase>.md — file existence', () => {
  for (const phase of PHASES) {
    it(`Given phase "${phase}", when reading prompts/craft-${phase}.md, then the file exists`, () => {
      const sut = readPromptDef;

      const result = () => sut(phase);

      assert.doesNotThrow(result);
    });
  }
});

describe('prompts/craft-<phase>.md — frontmatter contract', () => {
  for (const phase of PHASES) {
    it(`Given craft-${phase}.md, when frontmatter is parsed, then description is non-empty`, () => {
      const sut = readPromptDef(phase);

      const result = sut.attrs.description;

      assert.ok(result && result.length > 0);
    });
  }
});

describe('prompts/craft-<phase>.md — body templating contract', () => {
  for (const phase of PHASES) {
    it(`Given craft-${phase}.md, when the body is scanned, then it carries the $ARGUMENTS token`, () => {
      const sut = readPromptDef(phase);

      const result = sut.body;

      assert.ok(result.includes('$ARGUMENTS'));
    });

    it(`Given craft-${phase}.md, when the body is scanned, then it instructs loading a craft skill`, () => {
      const sut = readPromptDef(phase);

      const result = sut.body;

      assert.match(result, /skills\//);
    });

    it(`Given craft-${phase}.md, when the body is scanned, then it carries no shell-injection expansion`, () => {
      const sut = readPromptDef(phase);

      const result = sut.body;

      assert.doesNotMatch(result, SHELL_INJECTION_PATTERN);
    });

    it(`Given craft-${phase}.md, when the full file is scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = readFileSync(join(PROMPTS_DIR, `craft-${phase}.md`), 'utf8');

      assert.doesNotMatch(sut, PROVENANCE_REF);
    });
  }
});

describe('extensions/craft-guard/index.ts — thin wrapper structure', () => {
  it('Given the extension entry, when checked, then the file exists', () => {
    const sut = () => statSync(EXTENSION_PATH);

    assert.doesNotThrow(sut);
  });

  it('Given the extension text, when scanned, then it imports the tested tool-call-hook seam', () => {
    const sut = readExtensionText();

    assert.match(sut, /\.\.\/\.\.\/src\/tool-call-hook\.js/);
  });

  it('Given the extension text, when scanned, then it imports the tested craft-root seam', () => {
    const sut = readExtensionText();

    assert.match(sut, /\.\.\/\.\.\/src\/craft-root\.js/);
    assert.match(sut, /resolveCraftRoot/);
  });

  it('Given the extension text, when scanned, then it registers the tool_call event', () => {
    const sut = readExtensionText();

    assert.match(sut, /pi\.on\(\s*['"]tool_call['"]/);
  });

  it('Given the extension text, when scanned, then it registers a craft flag', () => {
    const sut = readExtensionText();

    assert.match(sut, /registerFlag/);
  });

  it('Given the extension text, when scanned, then it sets process.env.CRAFT_ROOT', () => {
    const sut = readExtensionText();

    assert.match(sut, /process\.env\.CRAFT_ROOT/);
  });

  it('Given the extension text, when scanned, then it carries no phase/ADR/backlog reference', () => {
    const sut = readExtensionText();

    assert.doesNotMatch(sut, PROVENANCE_REF);
  });
});

describe('README.md — presence', () => {
  it('Given the adapter directory, when checking README.md, then the file exists', () => {
    const sut = () => statSync(join(ADAPTER_DIR, 'README.md'));

    assert.doesNotThrow(sut);
  });

  it('Given the README, when scanned, then it carries no phase/ADR/backlog reference', () => {
    const sut = readFileSync(join(ADAPTER_DIR, 'README.md'), 'utf8');

    assert.doesNotMatch(sut, PROVENANCE_REF);
  });
});
