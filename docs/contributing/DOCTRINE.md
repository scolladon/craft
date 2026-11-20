# Doctrine

Principles distilled from user-ratified decisions. The decisions phase cites an entry as
`DOCTRINE(D-<n>)` when it adopts a recommendation the entry covers.

## D-1 — An input the parser does not model fails closed
- **Trigger:** A guard or parser meets an input, construct or failure it does not model.
- **Rule:** Deny it with a fixed reason instead of guessing; each unmodelled class is closed by inverting the default, not by enumerating constructs.
- **Evidence:** R-582, R-594, R-684, R-691, R-693, R-694, R-695, R-698, R-519, R-535
- **Counter-cases:** R-546 — a fail-open the hook cannot observe or act on is documented, not fixed; R-551 — the same stall fail-open, documented because no hook-side fix exists

## D-2 — Close the class of a proven hole, not the vector; no compatibility fallback
- **Trigger:** A hole is proven and a fix patches one vector or keeps a fallback for the old behaviour.
- **Rule:** Remove the whole class, delete the fallback, and accept the breaking cost.
- **Evidence:** R-564, R-384
- **Counter-cases:** none

## D-3 — A proven defect the change exposes is fixed in the change, not filed
- **Trigger:** A change exposes a proven defect adjacent to its scope and the recommendation is to file a follow-up.
- **Rule:** Fix it in the same change, with test cover.
- **Evidence:** R-234, R-338
- **Counter-cases:** R-325 — the defect is unreachable on every supported platform, so it is documented

## D-4 — Code that cannot change behaviour is deleted
- **Trigger:** A guard or branch no caller can reach, or one that restates what the code below it does.
- **Rule:** Delete it and document the contract, rather than keep it and defend its mutants.
- **Evidence:** R-322
- **Counter-cases:** none

## D-5 — A fixed bound beats tracked state
- **Trigger:** A limit could be derived from tracked state or left open-ended.
- **Rule:** Use a fixed bound instead of state to track, and bound an unbounded input with a cap.
- **Evidence:** R-719, R-321
- **Counter-cases:** none

## D-6 — Run-local state stays out of the tree; no committed churn for a protection the failure mode does not need
- **Trigger:** Run-local state is kept in the working tree and guarded by a growing set of checks.
- **Rule:** Keep it outside the tree, where no commit can write, instead of patching each vector.
- **Evidence:** R-384
- **Counter-cases:** none

## D-7 — A known failure mode earns its protective machinery now
- **Trigger:** A designer proposes deferring a protection until the failure is observed live.
- **Rule:** Ship the protection for a known failure mode now, with the same bindings and silent no-op as its sibling.
- **Evidence:** R-375, R-373
- **Counter-cases:** R-599 — there is no launch boundary to attach the check to, so it stays on demand

## D-8 — Ship on the confirmed contract; record the unconfirmed remainder as an open row instead of gating on it
- **Trigger:** A feature rests on a confirmed contract while part of the surrounding shape is unconfirmed.
- **Rule:** Build against the confirmed contract now, and keep the remainder as an explicit deferred row.
- **Evidence:** R-257
- **Counter-cases:** none

## D-9 — A listing or membership criterion is an observable property, stated explicitly
- **Trigger:** A set is defined by an implicit or strength-based convention.
- **Rule:** State the criterion as an observable property, and carry the detail the set no longer conveys elsewhere.
- **Evidence:** R-249
- **Counter-cases:** none

## D-10 — Heuristics advise; correctness facts block
- **Trigger:** A lint or detector is proposed as blocking.
- **Rule:** A heuristic warns and leaves the exit code unchanged; only a correctness fact fails the gate.
- **Evidence:** R-306, R-312, R-324, R-730
- **Counter-cases:** none

## D-11 — One verdict, one implementation, shared by every caller
- **Trigger:** The same verdict, predicate or procedure is composed in more than one place.
- **Rule:** Give it one home that every caller uses, and delete the local copies.
- **Evidence:** R-640, R-487, R-556, R-216, R-251
- **Counter-cases:** none

## D-12 — Shipped artifacts carry no provenance refs and no home-rooted paths
- **Trigger:** A shipped file, test comment or committed artifact cites a decision, phase or id, or holds an absolute path.
- **Rule:** Strip it, enforce the rule with a whole-tree check and no allowlist, and name out-of-repo locations by placeholder.
- **Evidence:** R-485, R-489, R-490, R-492, R-466, R-467, R-468
- **Counter-cases:** none

## D-13 — A waiver is a fixed column-0 token line with a non-empty reason
- **Trigger:** A check needs an escape hatch.
- **Rule:** Waive it with a fixed token starting at column 0, outside a fence, followed by a non-empty reason.
- **Evidence:** R-479, R-482, R-483
- **Counter-cases:** none

## D-14 — Decide by measurement or probe, not assumption
- **Trigger:** A choice turns on a fact about a tool, a corpus or a platform that nobody has measured.
- **Rule:** Run the probe or the census first, let its outcome pick the route, and record the versions measured.
- **Evidence:** R-399, R-686, R-324
- **Counter-cases:** none
