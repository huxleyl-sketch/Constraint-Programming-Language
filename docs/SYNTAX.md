# Predicate syntax

`syntax[...]` introduces named infix notation. It is expanded into ordinary
predicate calls before the existing parser and solver run; it adds no arithmetic
or operator evaluation to the solver.

```csp
def operations := {
    syntax[
        opp xfx =/2.
        opp yfx pred/3.
        opp xfx otherpred/3.
        opp xfx related/2.
    ].
    pred(A,B,pair(A,B)).
    otherpred(A,B,pair(A,B)).
    related(a,b).
    =(X,X).
};
```

| Written form | Expanded calls |
| --- | --- |
| `A related B` | `related(A,B)` |
| `C = A pred B` | `pred(A,B,SyntaxValue0), =(C,SyntaxValue0)` |
| `check(A pred B)` | `pred(A,B,SyntaxValue0), check(SyntaxValue0)` |
| `C = A pred B pred D` | `pred(A,B,SyntaxValue0), pred(SyntaxValue0,D,SyntaxValue1), =(C,SyntaxValue1)` |

Generated variable names are fresh within the submitted source. Nested
expressions expand from their operands outward, left operand first. Each
predicate retains its normal solution order, failure and backtracking behavior.
`=` is an ordinary user-defined binary relation, not assignment. `standard`
defines it as `=(X,X).`, which unifies its arguments. Either side can contain
an expression, such as `A add B = C mult D`. `:=` is reserved for declarations
such as `let X := [1,2];` and `def system := { ... };`.

The original forms `pred(A,B,C)` and `related(A,B)` continue to work.
Without a declaration, `A related B` is not a named predicate call.
Symbolic infix calls such as `A = B` also require a syntax declaration.
Ordinary symbolic predicate calls such as `=(A,B)` need no declaration.

## Association and priority

- `yfx`: chains associate left, so `A pred B pred C` groups as `(A pred B) pred C`.
- `xfy`: chains associate right, so `A pred B pred C` groups as `A pred (B pred C)`.
- `xfx`: equal-priority chains require parentheses.

Result operations (`/3`) default to priority 550; binary relations (`/2`)
default to 599, so relations surround result expressions. An optional integer priority from
1 through 599 may precede the association; lower numbers bind more tightly:

```csp
syntax[
    opp 550 yfx add/3.
    opp 500 yfx mult/3.
].
```

`N = A add B mult C` expands to `mult(B,C,T), add(A,T,U), =(N,U)`.
Parentheses override grouping: `N = (A add B) mult C`.
Operator names may be lowercase identifiers or symbols such as `=`; declarations support arities
2 and 3. Duplicate declarations are errors. Declaration syntax ends with `].`,
not `];`. A `/2` declaration is a relation, not a value-producing operation.

## Scope and use

### Child systems

Use `extends` to inherit unqualified predicate calls and operator syntax:

```csp
import standard from (./lib/standard.csp);

def arithmetic extends standard := {
    total(A,B,N) <- add(A,B,N).
    calculate(A,B,C,N) <- N = A add B mult C.
    explicit(A,B,N) <- standard:add(A,B,N).
};
```

The parent may be imported or defined in the same file. One parent is supported;
inheritance can continue through multiple levels. Child predicates override
parent predicates with the same name and arity. Other parent arities remain
available. Parent definitions retain their original lookup scope, so an inherited
rule's internal calls still resolve in its defining system. Explicit qualification
continues to select the named system.

Parent syntax is inherited and exported with the child, with child declarations
taking precedence for the same operator name. Importing `arithmetic` therefore
also imports its inherited syntax. Unknown parents and inheritance cycles are
errors. `extends` does not automatically import a file: import the parent first.

### Exported syntax

Place `syntax[...]` inside a `def` block to link it to that predicate system.
The declarations apply throughout that system, including preceding rules, and
are exported with it. `import operations from (./operations.csp);` imports both
the predicates and their syntax. Other systems in that file keep their syntax
private unless they too are imported.

An operator from an imported system expands to a qualified call to its owner.
For example, importing `standard` makes `N = A add B` expand to
`standard:add(A,B,T), standard : =(N,T)` inside a different system. No forwarding rule is needed.
In its owning system, it remains an ordinary unqualified call.

```csp
import standard from (./lib/standard.csp);
def calculation := {
    total(A,B,N) <- N = A add B.
};
```

In the terminal:

```text
?- calculation:N = 9 add 1.
% N = n(1,0).
```

Each system can give the same operator name a different priority or association.
A system's own declarations take precedence in its rules, its bracket
constraints, and console queries qualified with its name. If two imported
systems export the same operator and neither is selected by the current scope,
using that operator reports an ambiguity; select a system with `operations[...]`
or `?- operations:...`.

Imports and declarations are collected before expression expansion, so import
syntax can be used throughout the loading file. Declarations stay available
for subsequent statements and queries until the file/session is replaced.
Top-level `syntax[...]` is retained for compatibility as file-local syntax;
it takes precedence over imported syntax but is not exported with any system.

Expressions work in rule bodies, predicate arguments, terminal queries, and
CSP bracket constraints, including `calculation[N = A add B];`.
CSP operands and results are declared variables with domains. Complex queries
and constraints expand into ordinary auxiliary predicate definitions;
these helpers do not add CSP variables or domains. Console helpers are temporary.

Keep clause heads and domain declarations as ordinary terms. Expressions nested
under negation must be moved into a named wrapper predicate, then negate that
wrapper. This preserves negation's variable scope. Numeric operators retain
the ground-input requirements of the predicates they call.

Commas remain optional between ordinary arguments and goals. Use commas when
an operator name at a boundary could also be read as the next infix operator.

See [syntax-example.csp](../examples/syntax-example.csp) for inherited arithmetic syntax,
multiplication priority, and CSP constraints in one runnable file.
