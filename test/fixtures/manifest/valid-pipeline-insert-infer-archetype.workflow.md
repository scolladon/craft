---
pipeline:
  insert:
    - after: validation
      id: smoke
      procedure: "echo smoke"
      gate: "echo ok"
---

# Archetype-inference flat-insert fixture

A flat insert entry carrying gate and no produces — the resolver must infer
archetype: harness (reason: gate with no produces).
No explicit archetype, no produces key, gate present → infers harness.
