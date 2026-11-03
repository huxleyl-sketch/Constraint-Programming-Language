# Terminal console

Run from the project directory:

```sh
npm run console -- examples/greaterTest.csp
```

This builds TypeScript and asks you to choose `dfs` (or `1`) or `mac` (or `2`) first. It then loads the supplied file without solving. The chosen algorithm is retained on reload. No browser or additional dependency is required. Omit the filename to start with an empty system. For an already built project, `node terminal.cjs examples/greaterTest.csp` starts directly.

Examples:

```text
?- test:greater(X,s(0)).
;
?- test:greater(s(0),s(s(0))).
.
```

`?-` starts a query. `;` requests the next answer; `.` ends the current query. Bindings are printed by query variable name, and ground success prints `true.`. Exhaustion or failure prints `false.`. A new query abandons the previous one. Variables sharing an identity are displayed as aliases. Use `system:predicate(...)` when more than one predicate system is defined; with one system, the prefix is optional.

Other commands:

- `load path/to/file.csp` loads a new problem; surrounding double quotes are optional for paths containing spaces.
- `reload`, or the loaded file's basename, reloads it from disk.
- `clear`, `debug`, `help`, and `exit` control the terminal.
- Existing `let`, `def`, and constraint statements work on one line, just as in the browser console.

Files accept Windows and Unix line endings. Failed loads keep the previous active system. Predicate queries do not add constraints or change CSP domains. Commands execute synchronously with a five-second limit so a nonterminating query can be cancelled automatically. The limit does not provide a security sandbox for untrusted JavaScript.

This uses the project's language and predicate semantics, not a full Prolog implementation. Queries accept predicate goals and declared syntax expressions. With syntax declarations in scope, conjunctions expand into temporary helper predicates; otherwise put compound logic in a rule using `<-`. Standard Prolog `:-`, bracket list literals, and cuts are not supported. Represent lists with the standard library's `nil` and `cons` terms.

The predicate solver now yields alternatives through dependency backtracking, allowing `;` to reach successive answers. `parseCheck` continues to return only the first success for CSP checks.

## Multiple CSP solutions

Named imports load reusable systems without running the imported file's variables
or constraints:

```csp
import test from (./other.csp);
```

Paths resolve relative to the importing file. Imported systems retain their own
file's helper definitions and nested imports. Duplicate names and circular file
imports are errors. `reload` rereads dependencies from disk. Imports entered at
the prompt resolve relative to the current file, or the working directory when
no file is loaded.

```text
solve
next
next
stop
```

`solve` starts a new search and displays solution 1. `next` requests another full assignment; exhaustion prints `No more solutions.`. `stop` closes the search. No answers are cached and there is no previous command. Entering CSP statements or loading/reloading a file cancels the search. These commands are separate from `?-` predicate queries and their `;` continuation.

The browser provides the same commands plus Solve, Next solution, and Stop buttons. Both consoles use the shared `SolutionSession`. File loading and statements do not solve automatically; numbered navigation starts explicitly with `solve`.
