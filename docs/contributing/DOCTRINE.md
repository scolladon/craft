# Doctrine

Principles distilled from user-ratified decisions. The decisions phase cites an entry as
`DOCTRINE(D-<n>)` when it adopts a recommendation the entry covers.

## D-1 — An input the parser does not model fails closed
- **Trigger:** A guard or parser meets an input, construct or failure it does not model.
- **Rule:** Deny it with a fixed reason instead of guessing; each unmodelled class is closed by inverting the default, not by enumerating constructs.
- **Evidence:** ADR-582, ADR-594, ADR-684, ADR-691, ADR-693, ADR-694, ADR-695, ADR-698, ADR-519, ADR-535
- **Counter-cases:** ADR-546 — a fail-open the hook cannot observe or act on is documented, not fixed; ADR-551 — the same stall fail-open, documented because no hook-side fix exists

## D-2 — Close the class of a proven hole, not the vector; no compatibility fallback
- **Trigger:** A hole is proven and a fix patches one vector or keeps a fallback for the old behaviour.
- **Rule:** Remove the whole class, delete the fallback, and accept the breaking cost.
- **Evidence:** ADR-564, ADR-384, ADR-569
- **Counter-cases:** none

## D-3 — A proven defect the change exposes is fixed in the change, not filed
- **Trigger:** A change exposes a proven defect adjacent to its scope and the recommendation is to file a follow-up.
- **Rule:** Fix it in the same change, with test cover.
- **Evidence:** ADR-234, ADR-338
- **Counter-cases:** ADR-325 — the defect is unreachable on every supported platform, so it is documented

## D-4 — Code that cannot change behaviour is deleted
- **Trigger:** A guard or branch no caller can reach, or one that restates what the code below it does.
- **Rule:** Delete it and document the contract, rather than keep it and defend its mutants.
- **Evidence:** ADR-322
- **Counter-cases:** none

## D-5 — A fixed bound beats tracked state
- **Trigger:** A limit could be derived from tracked state or left open-ended.
- **Rule:** Use a fixed bound instead of state to track, and bound an unbounded input with a cap.
- **Evidence:** ADR-719, ADR-321
- **Counter-cases:** none

## D-6 — Run-local state stays out of the tree; no committed churn for a protection the failure mode does not need
- **Trigger:** Run-local state is kept in the working tree and guarded by a growing set of checks.
- **Rule:** Keep it outside the tree, where no commit can write, instead of patching each vector.
- **Evidence:** ADR-384
- **Counter-cases:** none

## D-7 — A known failure mode earns its protective machinery now
- **Trigger:** A designer proposes deferring a protection until the failure is observed live.
- **Rule:** Ship the protection for a known failure mode now, with the same bindings and silent no-op as its sibling.
- **Evidence:** ADR-375, ADR-373
- **Counter-cases:** ADR-599 — there is no launch boundary to attach the check to, so it stays on demand

## D-8 — Ship on the confirmed contract; record the unconfirmed remainder as an open row instead of gating on it
- **Trigger:** A feature rests on a confirmed contract while part of the surrounding shape is unconfirmed.
- **Rule:** Build against the confirmed contract now, and keep the remainder as an explicit deferred row.
- **Evidence:** ADR-257
- **Counter-cases:** none

## D-9 — A listing or membership criterion is an observable property, stated explicitly
- **Trigger:** A set is defined by an implicit or strength-based convention.
- **Rule:** State the criterion as an observable property, and carry the detail the set no longer conveys elsewhere.
- **Evidence:** ADR-249
- **Counter-cases:** none

## D-10 — Heuristics advise; correctness facts block
- **Trigger:** A lint or detector is proposed as blocking.
- **Rule:** A heuristic warns and leaves the exit code unchanged; only a correctness fact fails the gate.
- **Evidence:** ADR-306, ADR-312, ADR-324, ADR-355
- **Counter-cases:** none

## D-11 — One verdict, one implementation, shared by every caller
- **Trigger:** The same verdict, predicate or procedure is composed in more than one place.
- **Rule:** Give it one home that every caller uses, and delete the local copies.
- **Evidence:** ADR-640, ADR-487, ADR-556, ADR-216, ADR-251
- **Counter-cases:** none

## D-12 — Shipped artifacts carry no provenance refs and no home-rooted paths
- **Trigger:** A shipped file, test comment or committed artifact cites a decision, phase or id, or holds an absolute path.
- **Rule:** Strip it, enforce the rule with a whole-tree check and no allowlist, and name out-of-repo locations by placeholder.
- **Evidence:** ADR-485, ADR-489, ADR-490, ADR-492, ADR-466, ADR-467, ADR-468
- **Counter-cases:** none

## D-13 — A waiver is a fixed column-0 token line with a non-empty reason
- **Trigger:** A check needs an escape hatch.
- **Rule:** Waive it with a fixed token starting at column 0, outside a fence, followed by a non-empty reason.
- **Evidence:** ADR-357, ADR-479, ADR-482, ADR-483
- **Counter-cases:** none

## D-14 — Decide by measurement or probe, not assumption
- **Trigger:** A choice turns on a fact about a tool, a corpus or a platform that nobody has measured.
- **Rule:** Run the probe or the census first, let its outcome pick the route, and record the versions measured.
- **Evidence:** ADR-399, ADR-686, ADR-324
- **Counter-cases:** none
