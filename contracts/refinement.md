Behavior-preserving strictly: tests change only mechanically (moved/renamed/re-imported). No public-API behaviour change.
Bounded: touch only what the spec names. A tempting refactor outside a spec is reported in the final message, never executed.
One atomic refactor(<scope>): commit per spec; gate-green before each commit.
