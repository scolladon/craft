'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function grepQ(pattern, filePath) {
  try {
    execFileSync('grep', ['-qx', pattern, filePath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function grepQE(pattern, ...filePaths) {
  try {
    execFileSync('grep', ['-qE', pattern, ...filePaths], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function grepQ_plain(pattern, filePath) {
  try {
    execFileSync('grep', ['-q', pattern, filePath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test(
  'Given the requirements vertical is authored, when the requirements agent file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'agents/requirements-writer.md')),
      'agents/requirements-writer.md should exist',
    );
  },
);

test(
  'Given the architecture vertical is authored, when the architecture agent file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'agents/harness-triager.md')),
      'agents/harness-triager.md should exist',
    );
  },
);

test(
  'Given the requirements vertical is authored, when the requirements skill file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'skills/requirements/SKILL.md')),
      'skills/requirements/SKILL.md should exist',
    );
  },
);

test(
  'Given the architecture vertical is authored, when the architecture skill file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'skills/architecture/SKILL.md')),
      'skills/architecture/SKILL.md should exist',
    );
  },
);

test(
  'Given the requirements vertical is authored, when the requirements template file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'templates/requirements.md')),
      'templates/requirements.md should exist',
    );
  },
);

test(
  'Given the requirements skill file exists, when its heading is checked, then it contains the craft:requirements procedure heading',
  () => {
    assert.ok(
      grepQ('# craft:requirements', path.join(ROOT, 'skills/requirements/SKILL.md')),
      'Expected "# craft:requirements" heading in skills/requirements/SKILL.md',
    );
  },
);

test(
  'Given the architecture skill file exists, when its heading is checked, then it contains the craft:architecture procedure heading',
  () => {
    assert.ok(
      grepQ('# craft:architecture', path.join(ROOT, 'skills/architecture/SKILL.md')),
      'Expected "# craft:architecture" heading in skills/architecture/SKILL.md',
    );
  },
);

test(
  'Given the requirements-writer agent is thin, when it is checked for injected core invariants, then it does not restate them',
  () => {
    assert.ok(
      !grepQE(
        'Never commit on a red gate|No suppression directives',
        path.join(ROOT, 'agents/requirements-writer.md'),
      ),
      'requirements-writer.md should not contain injected core invariants',
    );
  },
);

test(
  'Given the harness-triager agent is thin, when it is checked for injected core invariants, then it does not restate them',
  () => {
    assert.ok(
      !grepQE(
        'Never commit on a red gate|No suppression directives',
        path.join(ROOT, 'agents/harness-triager.md'),
      ),
      'harness-triager.md should not contain injected core invariants',
    );
  },
);

test(
  'Given the architecture skill is synchronous, when it is checked for run-lock clones, then no run-lock of either name appears',
  () => {
    assert.ok(
      !grepQE(
        'craft-(mutation|validation)\\.lock',
        path.join(ROOT, 'skills/architecture/SKILL.md'),
      ),
      'skills/architecture/SKILL.md should not contain run-lock references',
    );
  },
);

test(
  'Given the loop recipe is authored, when the workflow file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'examples/loop/workflow.md')),
      'examples/loop/workflow.md should exist',
    );
  },
);

test(
  'Given the loop recipe is authored, when the DoD file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'examples/loop/DOD.md')),
      'examples/loop/DOD.md should exist',
    );
  },
);

test(
  'Given the loop recipe is authored, when the README file is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'examples/loop/README.md')),
      'examples/loop/README.md should exist',
    );
  },
);

test(
  'Given the loop recipe is catalog-indexed, when the GUIDE is checked, then it references examples/loop/',
  () => {
    assert.ok(
      grepQ_plain('examples/loop/', path.join(ROOT, 'docs/guides/customizing.md')),
      'docs/guides/customizing.md should reference examples/loop/',
    );
  },
);

test(
  'Given the loop recipe is catalog-indexed, when the examples README is checked, then it references loop/',
  () => {
    assert.ok(
      grepQ_plain('loop/', path.join(ROOT, 'examples/README.md')),
      'examples/README.md should reference loop/',
    );
  },
);

test(
  'Given the loop workflow file is provenance-clean, when it is checked for plan references, then no P21 or ADR tokens appear',
  () => {
    assert.ok(
      !grepQE('P21|ADR', path.join(ROOT, 'examples/loop/workflow.md')),
      'examples/loop/workflow.md should not contain P21 or ADR tokens',
    );
  },
);

test(
  'Given the loop DoD file is provenance-clean, when it is checked for plan references, then no P21 or ADR tokens appear',
  () => {
    assert.ok(
      !grepQE('P21|ADR', path.join(ROOT, 'examples/loop/DOD.md')),
      'examples/loop/DOD.md should not contain P21 or ADR tokens',
    );
  },
);
