---
# Injection point: paths.dod — point craft at a custom DoD location.
# Default probe is docs/DOD.md; override here when your checklist lives elsewhere.
paths:
  dod: dod-artifact/DOD.md
---

# Example — custom DoD artifact location (`paths.dod`)

The `validation` phase is **default-ON** and DoD-aware. It probes `docs/DOD.md`
by default; set `paths.dod` to override the location.

| Key | When absent | With this manifest |
|---|---|---|
| `paths.dod` | phase probes `docs/DOD.md`; absent → `NO-OP(verify): no DoD declared` | phase reads `dod-artifact/DOD.md` as the DoD |

**Absence is a warning, never a block.** When neither `paths.dod` nor `docs/DOD.md`
exists, the phase records a `NO-OP(verify): no DoD declared` line in the run record
and carries it into the PR body — `propose` is never blocked by a missing DoD alone.

**Declaring a path that does not exist is a lint error.** manifest-lint validates
`paths.dod` via the same file-ref check used for `context:` and `scripts:` — a typo
is caught before the run, not midway through it.

> In your real repo this file lives at the project root as `.claude/workflow.md`,
> and the DoD file resolves relative to the repo root.
