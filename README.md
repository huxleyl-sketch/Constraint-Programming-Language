# Constraint Programming Language

A predicate-based constraint language with DFS and MAC solvers, browser and terminal consoles, and a VS Code extension.

## Getting started

```sh
npm install
npm run build
npm run console -- examples/greaterTest.csp
```

Choose `dfs` or `mac`, then use `solve`, `next`, and `stop`. Predicate queries start with `?-`.
For the browser console, open `index.html` after building. When an example imports library files, select the repository root with **Import folder** before loading the example. If loading fails, correct the reported error and use `reload`; solving stays blocked until a file loads successfully.

## Project layout

| Location | Contents |
| --- | --- |
| `src/` | Runtime, parser, solver state, and console adapters |
| `src/algorithms/` | DFS, arc consistency, and MAC |
| `lib/` | Current standard predicate library |
| `lib/legacy/` | Preserved historical arithmetic library |
| `examples/` | Runnable language examples |
| `docs/` | Language and developer documentation |
| `docs/references/` | Algorithm reference material |
| `tests/` | Runtime regressions and isolated fixtures |
| `vscode-csp/` | VS Code extension, packaging, and editor tests |
| `dist/`, `node_modules/`, `logs/` | Generated or local files; ignored by Git |

## Documentation

- [Language guide](docs/Guide.md)
- [Operator syntax and inheritance](docs/SYNTAX.md)
- [Standard library](docs/STANDARD.md)
- [Terminal console](docs/TERMINAL.md)
- [State and solution navigation](docs/STATE.md)
- [VS Code extension](vscode-csp/README.md)
- [Cleanup inventory](docs/PROJECT-AUDIT.md)

## Validation

`npm test` builds and runs runtime regressions. `npm run test:editor` runs the editor tests, including generated-token checks. `npm run check` runs both.

TypeScript retains the shared-script runtime arrangement: compiled scripts live under `dist/src/` and load in an explicit order. After moving source files, old build outputs can remain in ignored `dist/`; active loaders use only the new paths.
