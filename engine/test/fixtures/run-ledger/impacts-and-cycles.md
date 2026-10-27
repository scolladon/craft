# craft run record (append-only)
demo resolve RESOLVE: none
demo resolve EFFECTIVE: workspace,planning,implementation,review,impact-triage,propose
demo resolve AWAITING(propose): none
demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z
demo workspace PHASE-DONE(workspace): ok
demo planning PHASE-START(planning): 2026-10-27T09:05:00Z
demo planning DEFERRED(engine/src/x.js): I1 stale guard
demo planning PHASE-DONE(planning): ok
demo implementation PHASE-START(implementation): 2026-10-27T09:10:00Z
demo implementation PART(1): abc1234 size=pure-module outcome=pass
demo implementation PART(2): def5678 size=wiring outcome=blocked
demo implementation PART(2): 0a1b2c3 size=wiring outcome=pass
demo implementation PHASE-DONE(implementation): ok
demo review PHASE-START(review): 2026-10-27T09:40:00Z
demo review FINDINGS(code): c1 /tmp/craft-review.fixture/code.c1.json n=3
demo review FINDINGS(security): c1 /tmp/craft-review.fixture/security.c1.json n=2
demo review FINDINGS(code): c2 /tmp/craft-review.fixture/code.c2.json n=0
demo review PHASE-DONE(review): ok
demo impact-triage PHASE-START(impact-triage): 2026-10-27T10:00:00Z
demo impact-triage TRIAGED(I1): file — outside the change perimeter
demo impact-triage FILED(BACKLOG.md): I1 stale guard — not folded: outside the change perimeter
