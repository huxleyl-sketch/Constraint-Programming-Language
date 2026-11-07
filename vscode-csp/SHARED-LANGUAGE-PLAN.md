# Sharing language support between the runtime and VS Code

## Goal

Use one tokenizer and syntax parser for solver execution and IDE analysis.
The runtime currently uses `src/tokeniser.ts` and `src/parser.ts`; the extension has
its own syntax parser in `analysis.js`. The token snapshot reduces lexical
drift, but the two syntax parsers can still disagree.

This document is a future implementation plan, not a description of a completed
refactor. Preserve solver behavior and tests at every step.

## Proposed structure

```text
language/
  tokens.ts        # Token definitions and scanner
  syntax.ts        # AST construction, no solver operations
  diagnostics.ts   # Source ranges and syntax diagnostic types
parser.ts          # Converts parsed syntax into solver operations
vscode-csp/
  analysis.js      # Symbol indexing and editor-specific semantic checks
  extension.js     # VS Code providers
  language/        # Generated JS included in the VSIX
```

The current project uses TypeScript scripts with shared globals. Choose a module
boundary deliberately: compile the shared modules for both consumers, and adapt
the browser entry point and terminal loader as needed. Do not import VS Code or
solver state into the shared scanner/parser.

## 1. Establish compatibility fixtures

- Record ASTs and solver results for valid examples, including compound terms,
  recursion, negation, anonymous variables, queries, and numbered families.
- Keep unfinished examples separate from valid fixtures. For example, an
  unfinished `import` line remains invalid even though complete imports are supported.
- Add invalid fixtures for missing punctuation, mismatched brackets, unexpected
  characters, comments at EOF, CRLF, tabs, and partially typed declarations.
- Resolve existing quirks explicitly: runtime keyword regexes currently lack
  word boundaries for `let` and `def`. Both scanners skip normal whitespace
  and comments; the runtime does not preserve source positions. Avoid
  silently changing execution behavior while extracting the scanner.

## 2. Extract a scanner that preserves positions

Move token definitions into the shared module and scan the original source.
Skip comments and whitespace without deleting characters first. Preserve token
order, longest/multi-character operator handling, and precedence metadata.

```ts
interface SourceToken {
  kind: TokenKind;
  lexeme: string;
  start: number;
  end: number; // exclusive; UTF-16 offsets, matching VS Code
}
```

Keep a compatibility wrapper for current `interpreter` callers. Verify the
scanner handles `%` comments at EOF and returns errors at original offsets.

## 3. Extract syntax parsing from execution

Separate AST construction in `interpreter` from the operations in `src/parser.ts`.
Add ranges to AST nodes, including identifiers and operator/delimiter positions.
Return partial syntax and diagnostics rather than throwing on the first typo:

```ts
interface ParseResult {
  tree: readonly SyntaxNode[];
  diagnostics: readonly SyntaxDiagnostic[];
}
```

Recover at context-appropriate boundaries (`.`, `;`, `}`), always making
progress. Avoid swallowing subsequent valid declarations. The runtime must
reject syntax errors before applying solver operations; the editor can index
the valid parts of a partial document.

## 4. Switch consumers incrementally

First route runtime parsing through the shared implementation and run the
existing solver, terminal, browser, and TypeScript checks. Then replace the
extension's duplicate syntax parser with an AST visitor. Keep symbol resolution,
singleton warnings, completions, hover, definition lookup, and Outline behavior.
Respect clause-local variables, predicate-system scope, predicate arity, and
the runtime's inclusive `X^5` expansion into `X0` through `X5`.

Do not confuse recognized tokens with supported syntax: `|` is now an
ordinary atom; it can be declared as an operator with `opp yfx |/2.`.
Do not invent imports, strings, or arithmetic solely for editor convenience.

## 5. Build and package shared code

Compile the shared module into a location the extension can load independently.
Include its generated JavaScript in the VSIX and browser/terminal build outputs.
Add a package check that verifies all required files are present. Test the
installed extension without relying on the repository's files or node_modules.

Keep TextMate coloring for immediate feedback. Generate keyword/operator rules
from shared definitions where possible; identifiers still need contextual scopes.
Retire the temporary source-extraction script once compiled shared definitions
can generate the grammar directly.

## 6. Make synchronization a required check

Run shared lexer/parser fixtures, solver tests, and editor-provider tests in CI.
Add a fixture for each new language feature and verify original source ranges.
Check generated grammar files for drift. Build a VSIX as a final smoke check.

Until then, after changing `src/tokeniser.ts`:

```powershell
node vscode-csp/sync-tokens.cjs
node vscode-csp/sync-tokens.cjs --check
node --test vscode-csp/tests/*.cjs
powershell -ExecutionPolicy Bypass -File .\vscode-csp\package-extension.ps1
```

Review `analysis.js`, snippets, and documentation for new syntax. Bump the
extension version for releases, install the generated VSIX, and reload VS Code.

## Completion criteria

- Runtime and editor use the same scanner/parser and agree on valid syntax.
- Diagnostics refer to original source positions after comments and whitespace.
- Invalid or incomplete edits do not crash, loop, or execute solver operations.
- Existing solver behavior and editor providers pass regression tests.
- The installed VSIX works without access to the source repository.
