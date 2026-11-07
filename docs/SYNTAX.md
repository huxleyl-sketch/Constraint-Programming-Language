# Predicate syntax

`syntax[...]` declares prefix, suffix, and infix notation for compound terms
and predicate calls. Operators never evaluate their operands or produce implicit results.

```csp
def terms := {
    syntax[
        opp 599 xfx =/2.
        opp 550 yfx +/2.
        opp 500 yfx */2.
    ].
    =(X,X).
    expression(A,B,C) <- C = A + B.
    holds(A + B).
};
```

| Written form | Expanded form |
| --- | --- |
| `A = B` | `=(A,B)` |
| `C = A + B` | `=(C,+(A,B))` |
| `check(A + B)` | `check(+(A,B))` |
| `C = A + B * D` | `=(C,+(A,*(B,D)))` |

A compound term such as `+(A,B)` is a value, just like `s(A)` or `cons(H,T)`.
Its functor does not need a predicate definition. At goal position, `A + B`
calls the binary predicate `+(A,B)`. Ordinary calls such as `+(A,B,N)`
remain valid, but `/3` operator declarations are rejected.

`=` is an ordinary predicate. Defining `=(X,X).` makes it unify its arguments.
`:=` is reserved for declarations.

## Association and priority

- `yfx`: chains associate left: `(A + B) + C`.
- `xfy`: chains associate right: `A + (B + C)`.
- `xfx`: equal-priority chains require parentheses.

Operators default to priority 550. An optional integer from 1 through 599
precedes the association; lower numbers bind more tightly. Declare equality
at 599 to surround terms with priority 550. Parentheses, square brackets, and braces override grouping inside expressions.
Names may be lowercase identifiers, single digits, or symbols such as `+` and `=`.
Unary forms use arity 1; infix forms use arity 2. Duplicate names are errors,
so each scope gives a name one operator form.
Declarations end with `].`, not `];`.

## Prefix and suffix operators

```csp
syntax[
    opp 500 fx double/1.
    opp 500 fy repeat/1.
    opp 500 xf finish/1.
    opp 500 yf again/1.
].
```

| Form | Example | Expansion |
| --- | --- | --- |
| `fx` | `double 1` | `double(1)` |
| `fy` | `repeat repeat 1` | `repeat(repeat(1))` |
| `xf` | `1 finish` | `finish(1)` |
| `yf` | `1 again again` | `again(again(1))` |

`x` requires an operand with strictly tighter priority; `y` permits equal
priority. Thus `double double 1` and `1 finish finish` require parentheses:
`double (double 1)` and `(1 finish) finish`. The same priority rules apply
when mixing unary and infix operators. Explicit calls like `double(1)` still work.
At goal position these forms call unary predicates; nested forms construct terms.
They do not perform arithmetic or return implicit results.

For untagged declarations, whitespace separates word operators and operands.
`double1` remains one atom; use `double 1` or `double(1)`. Adjacent symbolic
characters stay one atom unless joined matching is enabled with `w/o`
(see Operator separation below).

## Grouping expressions

Inside expressions, `(...)`, `[...]`, and `{...}` each group one term and
reset its priority. They can be nested and mixed:

```csp
C = double [double 1].
C = double {double 1}.
C = [1 finish] finish.
C = {A + B} * D.
C = double [{double 1}].
```

Each opener requires its matching closer. In a scope declaring `|`, empty `[]` expands to `nil`; for example,
`[a | b | []]` constructs `|(a,|(b,nil))` with `opp 580 xfy |/2`.
Other grouping does not construct a list,
set, or additional functor. Predicate argument lists still use `name(...)`.
Outer syntax such as `def system := { ... };`, `let X := [ ... ];`,
`syntax[ ... ].`, and `system[ ... ];` keeps its existing meaning;
grouping applies to expressions inside those constructs.

## Scope and use

### Child systems

Use `extends` to inherit unqualified predicate calls and operator syntax:

```csp
import standard from (./lib/standard.csp);

def arithmetic extends standard := {
    total(A,B,N) <- +(A,B,N).
    calculate(A,B,C,N) <- *(B,C,T), +(A,T,N).
    explicit(A,B,N) <- standard:+(A,B,N).
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

An infix goal from an imported system calls the predicate in that system.
Nested infix expressions construct unqualified compound terms; they do not call
predicates in the exporting system.

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

Infix terms work in clause heads, predicate arguments, negated goals, domains,
queries, and CSP bracket constraints. Only the outermost goal is called.
Arithmetic uses explicit predicate calls, such as `+(A,B,N)` or
`*(B,C,T), +(A,T,N)`. No result arguments or auxiliary computation goals
are generated from infix terms.

Commas remain optional between ordinary arguments and goals. Use commas when
an operator name at a boundary could also be read as the next infix operator.

See [syntax-example.csp](../examples/syntax-example.csp) for explicit arithmetic calls,
inheritance, and CSP constraints in one runnable file.

Single digits can be prefix operators: `opp 300 fy 1/1.` makes `1 9`
construct `1(9)`. Declare each digit to allow longer chains. `standard`
exports all ten digit prefixes and accepts them as decimal arithmetic inputs;
results still use canonical `n` terms. Use commas between numeric arguments:
`p(1,9)` has two arguments, while `p(1 9)` has one with these declarations.

## Operator separation

Use an optional tag immediately after `opp`:

```csp
syntax[
    opp w xfx in/2.
    opp w/o 550 yfx +/2.
    opp w/o 300 fy 1/1.
].
```

`w` requires separation on both sides: whitespace, comments, the start/end of
an expression, or structural delimiters such as parentheses and commas.
Thus `a in b` and `(a)in(b)` use `in`, while `thing` remains an atom.
`w/o` permits joined spelling as well as spaced spelling. For example, `A+B`
constructs `+(A,B)`, and `11` constructs `1(1)` with the digit declaration.

Joined matches are tried longest first, with the declared prefix, suffix, or
infix form and precedence checked during parsing. If a choice leaves an invalid
expression, shorter matching operator names are retried. For example, `<=`
is preferred to `<` followed by `=` when both interpretations are possible.

Variable identifiers and explicit functor names retain their identities:
`Result11` remains a variable, and `name(...)` remains an explicit call.
Unclaimed characters retain the existing atom representation; this change does
not implicitly turn ordinary names into lists of characters. Declarations without
a tag preserve their existing token-based behavior. Syntax tags are exported
and inherited with their operators.

In standard, all digit prefixes and symbolic operators use `w/o`; word operators
use `w`. Consequently `100` constructs `1(0(0))`, and `C=19+1` evaluates to
`n(2,0)`. Separate numeric arguments with commas.

## Symbol characters

All ASCII punctuation not reserved by the language can be used in atom and
operator names. Alongside the existing arithmetic symbols, this includes `$`,
`@`, `#`, backslash, single quote, double quote, and backtick. Quotes are ordinary
symbol characters here; they do not introduce strings or quoted atoms.

Whitespace, brackets `()[]{}`, comma, period, semicolon, colon, `%` comments,
`~` negation, `^` families, and `_` wildcards remain reserved. The structural
sequences `:=` and `<-` retain their existing meanings.

For example, `opp w/o 300 fy $/1.` permits `$100` to construct
`$(1(0(0)))` in standard's scope. Declaring this notation does not itself
implement spreading or atom decomposition.
