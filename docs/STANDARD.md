# Standard library

Import the library with `import standard from (./lib/standard.csp);`.
This also imports its arithmetic and comparison syntax. For example,
`N = A add B mult C` uses multiplication priority without any local declarations.
Use `standard[N = A add B];` for a CSP constraint or
`?- standard:N = 9 add 1.` in the terminal. See [SYNTAX.md](SYNTAX.md).
Define `def arithmetic extends standard := { ... };` to use all library predicates
without `standard:` inside the child, for example `total(A,B,N) <- add(A,B,N).`.
Explicit `standard:add(A,B,N)` remains available.
The original unit-at-a-time arithmetic is preserved in `lib/legacy/standard-legacy.csp`
under the system name `standardLegacy`.

Numbers are nonnegative decimals: `0` through `9` are digits and
`n(1,n(2,3))` is 123. Numeric inputs must be ground (fully known).
Arithmetic results have no leading zeroes. Lists use `nil` and
`cons(Head,Tail)`, for example `cons(a,cons(b,nil))`.

| Predicate | Meaning |
| --- | --- |
| `fastAdd(A,B,N)`, `add(A,B,N)` | Digit addition with carry |
| `fastMult(A,B,N)`, `mult(A,B,N)` | Long multiplication |
| `fastSub(A,B,N)`, `subtract(A,B,N)` | A minus B; fails when B exceeds A |
| `successor(A,B)` | B is A plus one |
| `less(A,B)`, `lessEqual(A,B)` | Numeric comparisons |
| `greater(A,B)`, `greaterEqual(A,B)` | Numeric comparisons |
| `numberEqual(A,B)` | Numeric equality, accepting leading zeroes |
| `minimum(A,B,N)`, `maximum(A,B,N)` | Select one input; ties return the first |
| `equal(A,B)` | Structural unification |
| `=(A,B)` or `A = B` | Structural unification, including results of nested expressions |
| `different(A,B)` | Succeeds when the terms cannot unify |
| `member(X,L)` | Enumerate members of a known list |
| `notMember(X,L)` | Check a known value is absent from a known list |
| `append(A,B,R)` | Concatenate known lists; can also split a known result |
| `reverse(L,R)` | Reverse a known list |
| `allDiff(L)` | All elements of a ground list differ structurally |
| `allDiff(A,B)`, `allDiff(A,B,C)`, `allDiff(A,B,C,D)` | Fixed-arity variants for CSP constraints |
| `sum(L,N)`, `product(L,N)` | Fold a ground numeric list; empty results are 0 and 1 |
| `length(L,N)` | Decimal length of a known finite list |

`different`, `notMember` and `allDiff` use negation as failure; they do not
install delayed inequality constraints on unknown logic variables. CSP checks
receive assigned domain values, so the fixed-arity `allDiff` variants work
with both DFS and MAC. They test pairwise distinctness; they do not implement
a specialized global all-different propagation algorithm. For more than four
CSP variables, add pairwise `different` constraints or define a wrapper that
constructs a list from its arguments.

```csp
import standard from (./lib/standard.csp);
let X := [1,2,3];
let Y := [1,2,3];
let Z := [1,2,3];
standard[allDiff(X,Y,Z)];
standard[less(X,Y)];
```

Console examples:

```text
?- standard:fastAdd(n(9,9),1,N).
% N = n(1,n(0,0)).
?- standard:fastSub(n(1,n(0,0)),1,N).
% N = n(9,9).
?- standard:allDiff(cons(a,cons(b,cons(c,nil)))).
% true.
?- standard:sum(cons(9,cons(2,nil)),N).
% N = n(1,1).
```

Names beginning with `fast` other than `fastAdd`, `fastMult`, and `fastSub`
are internal arithmetic helpers. Arithmetic is intended for forward calculation
and checking a known result, not for enumerating unknown operands.

Run `npm test` to build and check the library and language together.
