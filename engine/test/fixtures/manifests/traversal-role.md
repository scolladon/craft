---
phases:
  implementation:
    role: craft:../agents/planner
---

# Repo workflow

This fixture carries a path-traversal role ref (craft:../agents/planner) that
escapes and re-enters agents/. roleExists must reject any ref whose name contains
a path separator BEFORE the existence probe — otherwise the traversal would falsely
satisfy the guard by resolving to a real file outside the intended bare-name space.
