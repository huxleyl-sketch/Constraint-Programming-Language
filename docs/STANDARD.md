# Standard library

Import the library with `import standard from (./lib/standard.csp);`.
This imports symbolic arithmetic, comparison, list, and digit-prefix syntax.
Define `def arithmetic extends standard := { ... };` to inherit it.

In standard, `C = Expression` evaluates a ground numeric expression on the right.
For example, `C = 2 + 3` returns 5 and `C = 2 + 3 * 4` returns 14
(as `n(1,4)`). Parentheses override the usual arithmetic priorities.
Subtraction fails if the result would be negative. The left side may be a
result variable or a canonical decimal to check. Supply fully known operands;
this is directional evaluation rather than an inverse arithmetic solver.

Use `equal(A,B)` for structural unification: `equal(R,2 + 3)` binds R to
`+(2,3)`. Operators still construct terms; standard's `=/2` rules perform
the evaluation. Explicit `+(A,B,N)` and `fastAdd(A,B,N)` also remain available.

Numbers are nonnegative decimals. `1 9` constructs `1(9)` and `1 2 3`
constructs `1(2(3))`; arithmetic accepts these as 19 and 123.
The existing `n(1,n(2,3))` representation is also supported and remains the
canonical result format. `19` also constructs `1(9)`, because standard declares its digit prefixes with `w/o`.
Numeric inputs must be ground (fully known).

Lists can use `[a | b | []]`, expanding to `|(a,|(b,nil))`.
`[H | T]` matches a head and tail; `[[a | []] | []]` contains a nested list.
The right-associative `|` constructs a pair; `[]` means `nil` in a scope
that declares or inherits `|`. Nonempty brackets still group one expression:
`[a,b]` is not list syntax. Always terminate finite lists with `[]` or `nil`.
The existing `cons(Head,Tail)` lists remain supported. Use the same constructor
throughout a list; results preserve the input constructor where it is known
(empty-list cases return the other argument unchanged).

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
| `=(N,E)` or `N = E` | Evaluate a ground numeric expression E into canonical decimal N |
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
