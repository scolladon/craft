# @craft/adapter-pi

Install the craft workflow for [pi](https://github.com/earendil-works/pi) as a native
pi package — pi discovers this adapter's extensions, skills, and prompts directly from
this directory; nothing is copied.

## Install

```
pi install ./adapters/pi        # user scope
pi install ./adapters/pi -l     # project scope
```

The local-path install adds `adapters/pi` to your pi settings and registers the three
resource kinds declared in `package.json`'s `pi` manifest: the `craft-guard` extension,
the `/craft-*` prompt templates, and (once populated) craft skills.

## Trust

craft's native run is non-interactive-capable, so project-local resources and the
`craft-guard` extension only load once pi's project trust is satisfied. Pick one:

- pass `--approve` on a one-off run (the smoke path), or
- set `defaultProjectTrust: "always"` in `.pi/settings.json` for a repo you already trust
  (the committed-repo path).

Leaving trust at pi's `ask`/`never` default silently drops `craft-guard`, so a trusted
repo should set `defaultProjectTrust` explicitly rather than rely on the default.

## Settings

Merge `settings.template.json` into `.pi/settings.json` (project or user scope):

```
cat adapters/pi/settings.template.json
```

It points `skills`/`prompts`/`extensions` at this package's resources and documents the
`defaultProjectTrust` guidance above. It carries no `provider`/`model` — pi model
selection stays with pi's own config; the craft model tier map is provider-neutral and
resolves tiers independently of this settings file.

## Usage

Once installed and trusted, run any of the four dispatcher prompts:

```
/craft-run <backlog-id | file | description>
/craft-review
/craft-validation
/craft-init
```

Each prompt is a thin dispatcher that loads the matching craft skill
(`skills/<phase>/SKILL.md`) and runs that phase — the skill body is the single source of
the procedure, not the prompt template.

## Headless

The package also ships a headless `craft-pi` bin (`src/cli.js`) for running phases
outside pi's interactive surface — unaffected by, and additive to, the native package
surface above.
