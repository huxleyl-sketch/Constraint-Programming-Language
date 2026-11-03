# Project organization and cleanup inventory

Reviewed 3 November 2026. Scope: project-owned source, configuration, examples, documentation, fixtures, extension assets, and generated-file locations. Dependencies and Git internals were excluded from source review; the PDF was retained as reference material without a technical content audit. Existing uncommitted work was preserved.

## Findings and disposition

| Category | Item | Disposition |
| --- | --- | --- |
| Temporary | Root `debug.log`: Chromium Crashpad access-denied diagnostic | Preserved in ignored `logs/debug.log`; unrelated to language source |
| Generated | `dist/`, source maps, `node_modules/`, packaged `*.vsix` | Already ignored; retained. Old `dist/*.js` and `dist/CSP Algorithms/` outputs can remain after the source move; active loaders use `dist/src/` |
| Deprecated behavior | Undeclared symbolic infix predicates | Removed in the preceding change; explicit `syntax[...]` declarations now required |
| Legacy | `standard-legacy.csp` / `standardLegacy` | Moved to `lib/legacy/`; preserved as historical functionality, not used by the current standard library |
| Compatibility | Top-level `syntax[...]` | Still supported and exercised by tests. Not removed: compatibility is documented; system-local syntax is preferred for exports |
| Obsolete file | `Guide.txt` | Already replaced by Markdown; guide now lives at `docs/Guide.md` |
| Dead scaffolding | Commented token proposals, unused `sTokens` sorting and `replaceTokens` arrays, obsolete debug comments | Removed from `src/tokeniser.ts`; scanner behavior preserved |
| Out of date | Guide atom range `a-Z` and ?Not as Failure? | Corrected to scanner behavior and ?Negation as failure? |
| Out of date | Terminal documentation claimed only single-goal queries and no lists | Clarified syntax-expanded queries and `nil`/`cons` lists; bracket list literals remain unsupported |
| Out of date | Shared parser plan described import support and whitespace handling inaccurately | Updated current-state statements; retained as a future plan |
| Organization | Source, examples, libraries, docs mixed at root | Moved into purpose-specific folders; loaders, imports, links, tests, build include paths, and launch settings updated |
| Navigation | No root project overview | Added `README.md` with structure, commands, and documentation links |
| Validation | Runtime and editor checks required separate discovery | Added `test:editor` and `check` npm scripts |

## Remaining follow-up items

- Runtime `src/tokeniser.ts` and editor `vscode-csp/analysis.js` still implement separate syntax parsers. `sync-tokens.cjs` is active synchronization tooling, not disposable temporary code. See the shared-language plan before replacing it.
- Runtime `let` and `def` token patterns lack keyword boundaries, unlike the editor scanner. This is a behavior issue to address with focused language compatibility tests, rather than a folder cleanup.
- The `CON` (`|`) token is recognized but has no dedicated statement-parser handling. Treat it as reserved/incomplete syntax, not implemented disjunction.
- The runtime uses shared globals and repeated script-order lists. A module refactor could reduce maintenance; this pass keeps the execution model intact.
- Top-level syntax compatibility and legacy arithmetic have no stated removal schedule. Removing either requires an explicit compatibility decision.
- `examples/greaterTest.csp` and `tests/fixtures/greaterTest.csp` share a name but serve different purposes: the example imports libraries and another example; the fixture is self-contained. They are not duplicate files.
- The algorithm PDF has no established provenance/version in project docs; retained as reference material.

## File inventory

Every project-owned file below was inventoried; generated folders and binary references are classified separately above. ?Active? means retained for its current role, not a claim that every behavior has been exhaustively verified.

| File | Role / status |
| --- | --- |
| `.gitignore` | Active tooling, configuration, or entry point |
| `.vscode/launch.json` | Active tooling, configuration, or entry point |
| `docs/Guide.md` | Documentation |
| `docs/references/algorithms.pdf` | Binary reference; retained |
| `docs/STANDARD.md` | Documentation |
| `docs/STATE.md` | Documentation |
| `docs/SYNTAX.md` | Documentation |
| `docs/TERMINAL.md` | Documentation |
| `examples/example.csp` | Runnable example |
| `examples/greaterTest.csp` | Runnable example |
| `examples/syntax-example.csp` | Runnable example |
| `index.html` | Active tooling, configuration, or entry point |
| `lib/legacy/standard-legacy.csp` | Legacy; preserved |
| `lib/standard.csp` | Current standard library |
| `package-lock.json` | Active tooling, configuration, or entry point |
| `package.json` | Active tooling, configuration, or entry point |
| `README.md` | Documentation |
| `src/algorithms/AC-3.ts` | Active runtime source |
| `src/algorithms/dfs.ts` | Active runtime source |
| `src/algorithms/MAC.ts` | Active runtime source |
| `src/constraintSystem.ts` | Active runtime source |
| `src/content.ts` | Active runtime source |
| `src/main.ts` | Active runtime source |
| `src/parser.ts` | Active runtime source |
| `src/predicateSolverExpr.ts` | Active runtime source |
| `src/prologConsole.ts` | Active runtime source |
| `src/solutionSession.ts` | Active runtime source |
| `src/tokeniser.ts` | Active runtime source |
| `terminal.cjs` | Active tooling, configuration, or entry point |
| `tests/browser-console.cjs` | Active regression test / fixture |
| `tests/fixtures/greaterTest.csp` | Active regression test / fixture |
| `tests/fixtures/imports/library.csp` | Active regression test / fixture |
| `tests/fixtures/imports/main.csp` | Active regression test / fixture |
| `tests/fixtures/imports/nested/helper.csp` | Active regression test / fixture |
| `tests/fixtures/syntax-import.csp` | Active regression test / fixture |
| `tests/imports.cjs` | Active regression test / fixture |
| `tests/inheritance.cjs` | Active regression test / fixture |
| `tests/readonly-contract.ts` | Active regression test / fixture |
| `tests/solver-state.cjs` | Active regression test / fixture |
| `tests/standard.cjs` | Active regression test / fixture |
| `tests/syntax.cjs` | Active regression test / fixture |
| `tests/terminal.cjs` | Active regression test / fixture |
| `tsconfig.json` | Active tooling, configuration, or entry point |
| `vscode-csp/analysis.js` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.1.0.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.0.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.1.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.2.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.3.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.4.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.5.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.6.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.7.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.8.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.2.9.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.3.0.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.3.1.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.3.2.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/constraint-programming-language-highlighting-0.3.3.vsix` | Active tooling, configuration, or entry point |
| `vscode-csp/extension.js` | Active tooling, configuration, or entry point |
| `vscode-csp/language-configuration.json` | Active tooling, configuration, or entry point |
| `vscode-csp/package-extension.ps1` | Active tooling, configuration, or entry point |
| `vscode-csp/package.json` | Active tooling, configuration, or entry point |
| `vscode-csp/README.md` | Documentation |
| `vscode-csp/SHARED-LANGUAGE-PLAN.md` | Future refactor plan; current-state notes refreshed |
| `vscode-csp/snippets/csp.json` | Active tooling, configuration, or entry point |
| `vscode-csp/sync-tokens.cjs` | Active tooling, configuration, or entry point |
| `vscode-csp/syntaxes/csp.tmLanguage.json` | Generated editor asset; keep synchronized |
| `vscode-csp/tests/analysis.cjs` | Active regression test / fixture |
| `vscode-csp/tests/extension.cjs` | Active regression test / fixture |
| `vscode-csp/tests/tokens.cjs` | Active regression test / fixture |
| `vscode-csp/tokens.json` | Generated editor asset; keep synchronized |
| `docs/PROJECT-AUDIT.md` | This inventory |

## Validation

`npm run check` passed after reorganizing: runtime build/regressions and all 21 editor checks. Token snapshots remain synchronized. Final tokenizer scaffolding removal was followed by build and token synchronization checks.
