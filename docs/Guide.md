# Language Guide

## Predicate operators and inheritance

Comments begin with `%`.

Named predicate operators: see [SYNTAX.md](SYNTAX.md) and [syntax-example.csp](../examples/syntax-example.csp).

Child system:

```text
def arithmetic extends standard := { total(A,B,N) <- add(A,B,N). };
```

The child inherits predicates and syntax. Explicit standard:add(A,B,N) still works.
Declare with `syntax[opp xfx =/2. opp yfx add/3. opp xfx less/2.]`.
`C = A add B` expands to `add(A,B,T), =(C,T)`; `A less B` expands to `less(A,B)`.

## Decimal arithmetic

Decimal arithmetic is provided in `standard.csp`.
See [STANDARD.md](STANDARD.md) for the full library, list operations, and `allDiff` examples.
Original arithmetic is preserved as standardLegacy in `lib/legacy/standard-legacy.csp`.
Import with: import standard from (./lib/standard.csp);
Digits are atoms 0 through 9; n(1,n(2,3)) represents 123.
fastAdd(A,B,N) and fastMult(A,B,N) require ground nonnegative decimal
inputs A and B. N may be a result variable or a known result to check.
They use digit addition with carry and long multiplication, respectively,
and return canonical decimals without leading zeroes. Internal fast* helpers
are implementation details. These predicates are not inverse arithmetic solvers.
Console examples:

```prolog
?- standard:fastAdd(n(9,9),1,N).
% N = n(1,n(0,0)).
?- standard:fastMult(n(1,2),n(3,4),N).
% N = n(4,n(0,8)).
```

## Basic syntax

```text
Variables: "A-Z"
Atoms: lowercase letters or digits followed by word characters
Negation as failure: "~"
Conjunction: ","
Implication: "<-"
End of clause: "."


Definitional equality: ":="
Domain: "[" ARGS "]"
Defining a predicate system: "def"
Defining a new global variable: "let"
predicate system: "{" PREDICATES "}"
Adding a constraint / querying a predicate: SYSTEM NAME "[" PREDICATE "(" ARGS ")" "]"
End of line: ";"
```

## Constraints and qualified calls

Constraints use brackets, for example test[greater(X1,X2)];.
Colon syntax is reserved for qualified predicate calls in rule bodies and console queries.
Arguments use declared CSP variables. For atoms, compound terms, and answer bindings,
use a terminal predicate query such as ?- test:greater(X,s(0)).
Rule bodies can call another system: p(X,Y) <- test:greater(X,Y).
Unqualified calls resolve within the defining system. Qualified calls resolve at
query time, allowing forward references. Negation works as ~test:blocked(X).

## Symbolic predicates

Symbolic predicates are user-defined, for example:

```prolog
def logic := {
    syntax[opp xfx =/2.].
    =(X,X).
    same(A,B) <- A = B.
    different(A,B) <- ~A = B.
};
```

The calls =(A,B) and A = B use the same predicate. Symbols have no built-in
meaning: define their facts or rules yourself. Symbol names may contain
= < > ! + * / & ? - (existing language operators remain reserved).
Symbolic infix calls require a `syntax[...]` declaration, just like named operators.
The declaration controls priority and association; `xfx` chains such as
`A = B = C` require parentheses. This is predicate notation, not arithmetic
evaluation. Qualified calls work as `logic:=(A,B)` or `logic:A = B`.

## Imports

Importing a named predicate system:

```text
import test from (./other.csp);
```

Paths resolve relative to the file containing the import. Use forward slashes
in paths. Only the named system is exposed; imported variables and constraints
are not executed. The imported system retains access to its own file's systems
and imports. Both files can define private systems with the same names.
Duplicate system names and circular file imports are errors. Reload rereads
dependencies. In the browser, choose Import folder before loading the main file;
choose the folder again to refresh dependencies after editing them on disk.



