# Problem and search state

`constraintSystem` builds the problem and owns the initial domains. Use `addVariable`, `addConstraint`, and `addPredicateSystem` to edit the definition. Constraint scopes contain variable names, not variable objects.

Solvers implement `(problem: Problem, domains: Domains) => Assignment | false`. `Problem` exposes only readonly constraints and `check(constraint, values)`. Predicate lookup stays inside `constraintSystem`. Domain-map keys identify variables; there is no separate variable registry. Initial domain arrays, constraints, expression objects, and expression children are frozen. Predicate definitions should remain unchanged during a synchronous solve.

`Domains` is a readonly map of readonly expression arrays. Create a branch with `new Map(domains)` and replace entries; never mutate stored arrays. Expressions can be shared because they are immutable.

`ArcConsistency(problem, domains)` returns a new pruned map or `false`, without editing its inputs. `MAC` uses a fresh map for each choice. `Dfs` uses its own assignment map. Neither solver alters initial domains. The browser still selects DFS; use `new constraintSystem(MAC)` to select MAC.

Readonly maps are compile-time views, not runtime-frozen collections. Do not bypass them with casts or `any`. The builder returns copies so modifying an escaped map cannot edit its internal registry. The problem interface hides predicate systems, though code holding a separate predicate-system reference can still modify it; do not edit definitions during a solve.

Strict indexing, optional-property, property-access, and return-path checks are enabled. `npm test` runs state-isolation regressions and compile-only checks that forbidden mutations remain compiler errors.

Builder API: `addVariable(name, values)` and `addConstraint(scope, { system, predicate })`. The `domains` getter returns a copy of the initial domain map.

## Predicate variable scope

Each clause invocation standardizes its variables apart using fresh internal `Expr.variableId` values. Its head and body share identities for the same local variable; callers and other invocations do not. `match` remains the original display spelling. Bindings are keyed by variable identity, not spelling. Returned answers describe the caller's arguments, preserving shared variable identities. Answers with equal spellings can still denote distinct variables: compare `variableId` when testing variable identity.

Unification avoids self-bindings and rejects bindings that would make an expression contain itself (the occurs check). Recursive predicates remain supported, but nonterminating user predicates are not automatically bounded.
