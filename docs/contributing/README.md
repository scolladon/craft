# docs/contributing/

A map of craft's own contributor-facing trees — how the pipeline's own history is recorded,
and where a craft run writes its own artifacts.

| Path | Holds |
|---|---|
| [`adr/`](adr/) | accepted architecture decision records |
| [`design/`](design/) | feature design docs |
| [`plan/`](plan/) | parted TDD implementation plans |
| [`specs/`](specs/) | port contract specs, together with the proof-of-concept records that grounded them |
| [`archive/`](archive/) | closed, dated program docs |
| [`prd/`](prd/) | legacy product/design/plan docs absorbed from craft's early history |
| [`DOD.md`](DOD.md) | craft's own Definition of Done |
| [`metrics-baseline.report.json`](metrics-baseline.report.json) | committed telemetry baseline compared against on each run |

`.claude/workflow.md` declares `paths.design`, `paths.adr`, `paths.plan`, and `paths.dod`
pointing at the trees above, so a craft run on this repository writes its own new design
docs, decisions, and plans directly into them.
