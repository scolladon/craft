const recorded = (ok, record, blocker) =>
  Object.freeze(blocker ? { ok, record, blocker } : { ok, record });

const canPropose = ({ hasRemote, ghAvailable, ghAuthed }) =>
  hasRemote() && ghAvailable() && ghAuthed();

export async function workspace({ gitProbe }) {
  if (!gitProbe.isGitRepo()) {
    return recorded(false, '', { unit: 'workspace', reason: 'no git repository in checkout' });
  }
  return recorded(true, 'workspace: using current checkout (bin context)');
}

export async function decisions() {
  return recorded(true, 'decisions: no-op (headless) — no interactive user to ratify forks');
}

export async function propose(deps) {
  if (!canPropose(deps)) {
    return recorded(true, 'propose: no-op (no remote / no gh / not authed) — work stays on local branch');
  }
  try {
    await deps.gitPush();
    await deps.ghPrCreate();
    return recorded(true, 'propose: pushed + PR created');
  } catch (err) {
    return recorded(false, '', { unit: 'propose', reason: err.message });
  }
}

export async function integrate() {
  return recorded(true, 'integrate: stopped before merge — human merges (headless safety)');
}

export const rolelessSteps = { workspace, decisions, propose, integrate };
