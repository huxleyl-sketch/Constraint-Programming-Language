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

## Visual graph editor

Run `npm run build`, then open `graph.html` in a browser. The editor is a separate
HTML/TypeScript adapter; it uses the existing parser and solvers unchanged.

- Open a `.csp` file. For imports, select the repository root using **Import folder**,
  then click **Apply source to graph**. Opening `lib/standard.csp` directly exposes its
  predicates without needing an import folder.
- **Select / Edit** is the default mode. Click variables to edit their names and domains (ordinary CSP terms,
  such as `0, 1, n(1,2)`). Add variables with **+ Variable** and drag circles to arrange them.
  Selecting variables or constraints in this mode never creates connections.
- Switch to **Edit constraints** to show the connection tools and edit argument connections.
  Click one variable and then another to create an empty constraint. Click the same
  variable twice to create a unary loop. Select the link to choose its system and
  predicate; unary predicates are available alongside all other arities.
- Click a link and then a variable to append an argument. Three or more arguments
  display as a triangle. Remove arguments in the inspector to return to a line or
  unary loop. Repeated binary arguments also display as a loop. Dragging moves nodes
  without creating connections; click the background to cancel a pending connection.
  Escape returns to **Select / Edit**. Switching modes clears pending connections.
- Predicate selection keeps the connected arguments. A red constraint has a mismatched
  predicate arity; adjust its connections or choose a matching predicate. Empty
  constraints have dashed connections. Incomplete constraints are preserved as draft
  comments in the source preview and survive **Apply source to graph**. Complete them
  before solving, querying, or saving.
- **Solve**, **Next solution**, and **Stop** use MAC or DFS. Solutions display variable
  assignments such as `B:4` and color constraints green when satisfied or red when
  unsatisfied. Next updates the display; exhaustion and Stop retain the last solution.
  Editing the problem clears these results. Domains remain editable in the inspector. The query box supports
  `?- system:predicate(X,a).` and **Next answer**.
- Graph changes update the source text immediately. Apply manual source edits before
  further graph changes. **Save .csp** writes the opened file in browsers supporting
  the File System Access API; other browsers download the updated file. File writes
  require the browser's permission. If direct file access is blocked, an upload control
  appears; select your file there or click **Open .csp** again. Saving then downloads
  an updated copy. The editor does not automatically save to disk.

Imports and predicate definitions are retained. Variable groups are expanded into
individual declarations. Operator expressions such as `arithmetic[Result = A + B * C];`
appear as one constraint connected to each referenced variable, labelled with the
original expression. Solving colours these constraints too. Edit expression text
and connections in the source field and click **Apply source to graph**; moving
or deleting the constraint and renaming its variables are supported in the graph.
Constraints without any declared variables remain in the source. Graph layout is currently
session-only. Solving runs on the browser thread, so
large searches can delay interface responses, including Stop.

Run `npm run test:graph` for graph adapter regression checks.

### Custom relations

The graph page's **Custom relations** editor accepts complete predicate systems,
imports, and constraints. Select a local system from the dropdown to load its
definition for editing, or choose **New system**. **Apply relations** replaces
a local definition of the same name and appends new constraints; repeated
identical constraints are not added twice. Invalid drafts remain in the editor
while the current graph and source are retained. Use **Save .csp** to save changes.

For a graph that imports `standard`, for example:

```csp
def custom extends standard := {
    syntax[opp xfx below/2.].
    below(A,B) <- <(A,B).
    total(A,B,N) <- +(A,B,N).
};
custom[A below B];
```

`A` and `B` must already be declared graph variables. Definitions alone add
predicate choices; add a `system[...]` line or create a graph constraint to use
them. User-defined binary relations and nested `/3` result operations use the
same expression visualization as library operators. Their input requirements
and termination depend on their predicate definitions. Add or edit variable
domains using the graph inspector or full source editor.

Use `% @hidden` above a predicate, or `% @hidden helper/2` inside its system,
to omit that signature from the graph's predicate choices and the extension's
hover tips, completion and Outline. Hidden predicates remain callable. Existing
constraints using them stay in the source and continue to affect solving.

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
