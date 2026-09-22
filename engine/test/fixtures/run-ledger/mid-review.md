# craft run record (append-only)
demo resolve RESOLVE: none
demo resolve AWAITING(propose): validation
demo workspace PHASE-START(workspace): 2026-09-22T10:00:00Z
demo workspace PHASE-DONE(workspace): ok
demo design PHASE-START(design): 2026-09-22T10:05:00Z
demo design PHASE-DONE(design): ok
demo decisions auto-skip: decisions — evaluated unnecessary (no decision candidates)
demo planning PHASE-START(planning): 2026-09-22T10:10:00Z
demo planning GATE(planning): green
demo planning PHASE-DONE(planning): ok
demo implementation PHASE-START(implementation): 2026-09-22T10:15:00Z
demo implementation PART(1): abc1234 size=pure-module outcome=pass
demo implementation GATE(implementation): green
demo implementation PHASE-DONE(implementation): ok
demo review PHASE-START(review): 2026-09-22T10:40:00Z
demo review FINDINGS(code): c1 /tmp/craft-review.fixture/code.c1.json n=3
