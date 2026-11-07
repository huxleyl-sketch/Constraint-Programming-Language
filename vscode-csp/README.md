# CSP language support for VS Code

Highlights this repository's `.csp` files using standard theme scopes:

- `let` and `def` keywords
- Uppercase variables such as `X1`, and the anonymous variable `_`
- Predicates and compound terms such as `parent(...)` and `s(...)`
- Predicate systems such as `system[...]`
- Lowercase atoms, numbers, operators, punctuation, and `%` line comments

Also provides bracket matching, bracket auto-closing, and comment toggling
with VS Code's **Toggle Line Comment** command (Ctrl+/ on Windows).
Atoms, including numbers, use the default text colour.
Predicate and system names retain their own scopes. Exact colors depend on your theme.

## Try it

1. Open the repository folder in VS Code.
2. Open **Run and Debug**, select **Preview CSP syntax highlighting**, and press F5.
3. In the new Extension Development Host window, `examples/example.csp` opens with highlighting.

No compilation or dependency installation is needed for this extension.

## Install locally

From the repository root, run these commands in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\vscode-csp\package-extension.ps1
code --install-extension .\vscode-csp\constraint-programming-language-highlighting-0.3.14.vsix --force
```

Alternatively, run **Extensions: Install from VSIX...** in VS Code and select
the generated `.vsix` file. Then run **Developer: Reload Window**.
Installing the package registers the extension with VS Code; copying a folder
into the extensions directory may leave it unregistered.

If another extension owns `.csp`, select **Constraint Programming Language**
from the language selector in the bottom-right corner. To make that choice
permanent, add this to your VS Code settings:

```json
"files.associations": {
  "*.csp": "constraint-programming-language"
}
```

## Programming assistance

- Type `let`, `many`, `def`, `fact`, `rule`, `call`, `operator`, `query`, or `querybracket` and select a snippet.
  Press Tab to move between its editable placeholders.
- Press Ctrl+Space for predicate, predicate system, and variable completions.
  Predicate suggestions insert argument placeholders unless parentheses already follow.
- Hover over a declared symbol or a resolved reference for its details.
- Press F12 on a predicate, system, or query variable to jump to its declaration.
  Clause variables jump to their first occurrence in that clause.
- Use the Outline view or Ctrl+Shift+O to browse variables, systems, and predicates.
- Syntax and semantic diagnostics update as you type and appear in the Problems panel.

Checks cover unexpected characters, missing punctuation/brackets, undeclared
query variables, unknown predicate systems, and undefined predicate names or
argument counts. Variables used once in a completed clause receive a warning;
use `_` when intentional. Repeated clauses for a predicate are allowed.
Commas are optional between predicate arguments, rule goals, and domain entries;
spaces or newlines can separate them instead, matching the runtime parser.
`let X^5` declares `X0` through `X5`, matching the runtime.

Analysis is limited to the current file and the documented declaration, fact,
rule, and query syntax. It uses a separate editor parser and does not execute
the solver, prove that constraints are satisfiable, or check domain compatibility.
The extension has no runtime dependencies or build step. Run its checks with:

```powershell
node --test vscode-csp/tests/*.cjs
```

After changing extension code, rebuild and reinstall the VSIX, then reload VS Code.
For development with F5, reload the Extension Development Host instead.

Packaging synchronizes the active definitions in `../src/tokeniser.ts` into
`tokens.json` and refreshes keyword/operator highlighting. Run
`node vscode-csp/sync-tokens.cjs` manually before using F5 after token changes.
Run it with `--check` to detect stale generated files without changing them.
New syntax still requires editor-parser and snippet changes; token synchronization
does not implement new constructs. Named imports use `import test from (./other.csp);`.
Imported systems are recognised in this file; external predicate signatures and
file paths are validated by the runtime loader, not the editor analyzer.
Constraints use `system[predicate(X,Y)];`. Top-level colon constraints are rejected.
Rule bodies support qualified calls such as `test:greater(X,Y)` and
`~test:blocked(X)`. Symbolic predicates such as `=(X,X).` can be called using
`=(A,B)` directly; `A = B` requires a `syntax[opp xfx =/2.].` declaration.
Their meaning comes from their definitions, and declarations control infix priority and association.
Named infix syntax is declared with `syntax[opp yfx add/2. opp xfx less/2.].`
inside a predicate system's `def` block and is imported with that system.
The editor reads local import files to discover exported operator declarations;
open documents' unsaved content is used when available.
`def arithmetic extends standard := { ... };` inherits predicates and syntax;
completion includes inherited predicates. Type `extends` for a child-system snippet.
The editor recognizes infix calls and compound terms (`C = A add B`),
operator priorities and associativity. Operators do not evaluate terms. Type `syntax` or `operation`
for snippets. See `docs/SYNTAX.md` for expansion rules and examples.
See [the shared parser plan](SHARED-LANGUAGE-PLAN.md) for the future refactor.

## Standard library snippets

Type `std-` and select a snippet (or use **Insert Snippet**). The snippets are packaged with the extension:

| Prefix | Inserts |
| --- | --- |
| `std-import` | Standard library import; editable path defaults to `../lib/standard.csp` for files in `examples/` |
| `std-add`, `std-subtract`, `std-mult` | Qualified arithmetic calls with editable operands and result |
| `std-less`, `std-greaterEqual`, `std-different` | Comparison calls |
| `std-member`, `std-append`, `std-sum` | List operations |
| `std-allDiff-1` through `std-allDiff-4` | The four public allDiff signatures |
| `std-system` | A child system inheriting standard predicates and syntax |
| `std-calculate`, `std-allDiff-constraint` | Bracket constraints using declared CSP variables |
| `std-list`, `std-decimal` | List and decimal terms |

Public library calls use `standard:` so they also work in other predicate systems. Import `standard` first. Call snippets omit a final period so they can be used inside a rule body; add clause punctuation where needed. Numeric operations require ground decimal operands; inequality checks do not delay on unknown variables.

`snippets/standard.json` is generated from the public signatures in `lib/standard.csp`; internal helpers are excluded. After changing the library, run `node vscode-csp/sync-standard-snippets.cjs`. Packaging refreshes these snippets, and editor tests check for stale output. The public-name allowlist lives in the synchronization script.

## Predicate hover documentation

Hover over a predicate call, declared infix operator, or definition to see its first clause and the contiguous `%` comment block immediately above that clause:

```csp
def arithmetic := {
    % Calculate the total of two known decimals.
    % The result can be a variable or a value to check.
    total(A,B,N) <- standard:add(A,B,N).
};
```

Documentation belongs to each predicate name and arity. Later clauses use the first clause's documentation; blank lines separate comments from definitions. Comments display as plain text. Imported and inherited predicates retain documentation and source locations, including unsaved edits in open library files. Go to Definition also opens the original library file.

## Hidden predicates

Place `% @hidden` on its own line directly above a predicate's comment block or
first clause to mark that name and arity as internal:

```csp
def library := {
    % @hidden
    helper(X,X).
    helper(a,b).

    public(A,B) <- helper(A,B).
};
```

You can also put `% @hidden helper/2` on its own line anywhere inside the
defining system. Both forms hide all clauses of `helper/2`, while other arities
remain visible. The extension omits hidden predicates from hover tips,
completion, Outline and generated standard-library snippets. Graph predicate
selection also omits them. Existing hidden graph constraints remain in the
source and participate in solving.

Tags survive imports and inheritance. An untagged child override is visible;
a child can explicitly hide an inherited signature with `% @hidden helper/2`.
Predicates remain callable and checked by diagnostics. Go to Definition remains
available when navigating an explicit call. These tags control presentation,
not predicate access.

Unary operators use `opp fx double/1.`, `opp fy repeat/1.`,
`opp xf finish/1.`, or `opp yf again/1.` within `syntax[...]`.
Type `syntax-unary` for a declaration snippet. `double 1` constructs
`double(1)`; `double1` stays an ordinary atom.

Operator expressions accept `(...)`, `[...]`, and `{...}` for grouping,
including mixed nesting. These groups contain one term; predicate calls
still use `name(...)`.

Operator declarations accept `w` (separation required) or `w/o` (joined use allowed)
immediately after `opp`, for example `opp w/o 550 yfx +/2.`.
Digit prefixes in standard use `w/o`, so `100` constructs `1(0(0))`.
