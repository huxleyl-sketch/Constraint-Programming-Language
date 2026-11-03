const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const readline = require("node:readline");

// Run the same compiled scripts as the browser, without loading its DOM adapter.
const context = vm.createContext({
    console,
    structuredClone,
    logToConsole: message => console.log(String(message))
});
const timeout = 5000;
function evaluate(code) {
    return vm.runInContext(code, context, { timeout });
}
try {
    for (const file of ["src/tokeniser", "src/parser", "src/predicateSolverExpr", "src/constraintSystem", "src/algorithms/dfs", "src/algorithms/AC-3", "src/algorithms/MAC", "src/main", "src/prologConsole", "src/solutionSession"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "dist", `${file}.js`), "utf8"), context, { filename: file });
    }
} catch (error) {
    console.error(`Unable to load compiled code. Run npm run build first.\n${error.message}`);
    process.exit(1);
}
evaluate("let chosenSolver; let session; let solutions;");
let algorithmChosen = false;
let filename;
function importOptions(filename) {
    return { filename, read(specifier, importer) {
        const id = fs.realpathSync(path.resolve(path.dirname(importer), specifier));
        return { id, code: fs.readFileSync(id, 'utf8') };
    } };
}
function load(file) {
    const target = fs.realpathSync(path.resolve(file.replace(/^"(.*)"$/, "$1")));
    const source = fs.readFileSync(target, "utf8").replace(/\r\n?/g, "\n");
    context.source = source;
    context.imports = importOptions(target);
    try {
        // Only replace the current session if loading succeeds.
        evaluate(`
            const loaded = new constraintSystem(chosenSolver);
            parser(source, loaded, imports);
            session?.cancel();
            solutions?.stop();
            conSystem = loaded;
            session = new PrologConsole(conSystem);
            solutions = new SolutionSession(conSystem);
        `.replace("const loaded", "var loaded"));
        filename = target;
        console.log(`Loaded ${path.basename(target)}`);
    } finally {
        delete context.source;
        delete context.imports;
    }
}
const help = `Commands:
  load <path>       Load a .csp file (paths with spaces supported)
  reload           Reload the current file (its filename also works)
  ?- test:p(X).    Query a predicate system; omit test: if only one is loaded
  ;                Request the next answer
  .                Finish the current query
  let / def / ...  Enter existing CSP statements on one line
  solve | next | stop   Navigate CSP assignments (separate from predicate queries)
  clear | debug | help | exit
Queries use your language's predicates and syntax; this is not a full Prolog interpreter.
Each command has a five-second execution limit.`;

console.log("Choose a solving algorithm: 1 / dfs = DFS, 2 / mac = MAC.");
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
input.setPrompt("algorithm> ");
if (interactive) input.prompt();
input.on("line", line => {
    const command = line.trim();
    try {
        if (!command) return;
        if (command === "exit" || command === "quit") { input.close(); return; }
        if (!algorithmChosen) {
            const choice = command.toLowerCase();
            const algorithm = choice === "1" || choice === "dfs" ? "Dfs" : choice === "2" || choice === "mac" ? "MAC" : undefined;
            if (!algorithm) {
                console.log("Choose dfs (1) or mac (2) before continuing.");
                return;
            }
            evaluate(`chosenSolver = ${algorithm}; conSystem = new constraintSystem(chosenSolver); session = new PrologConsole(conSystem); solutions = new SolutionSession(conSystem);`);
            algorithmChosen = true;
            input.setPrompt("csp> ");
            console.log(`${algorithm === "Dfs" ? "DFS" : "MAC"} selected. Type help for commands; enter solve to search.`);
            if (process.argv[2]) load(process.argv[2]);
            return;
        }
        if (command === "solve" || command === "next" || command === "stop") {
            context.command = command;
            console.log(evaluate("solutions.execute(command)"));
        } else if (command.startsWith("?-") || command === ";" || command === ".") {
            context.command = command;
            console.log(evaluate("session.execute(command)"));
        } else {
            evaluate("session.cancel()");
            if (command === "help") console.log(help);
            else if (command === "clear") console.clear();
            else if (command === "debug") console.log(evaluate("debug = !debug"));
            else if (command.startsWith("load ")) { evaluate("solutions.stop()"); load(command.slice(5).trim()); }
            else if (command === "reload" || (filename && command === path.basename(filename))) {
                if (!filename) throw new Error("No file loaded. Use load <path>.");
                load(filename);
            } else {
                evaluate("solutions.stop()");
                context.command = command;
                context.imports = importOptions(filename || path.join(process.cwd(), '__console__.csp'));
                try { evaluate("parser(command, conSystem, imports)"); }
                finally { delete context.imports; }
            }
        }
    } catch (error) {
        try { evaluate("session?.cancel(); solutions?.stop()"); } catch {}
        console.error(error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "Command exceeded five seconds; query cancelled." : error.message);
    } finally {
        delete context.command;
        if (interactive && !input.closed) input.prompt();
    }
});
input.on("close", () => { evaluate("session?.cancel(); solutions?.stop()"); });
