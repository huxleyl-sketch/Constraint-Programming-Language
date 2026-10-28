const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Keep the browser's shared-script arrangement while testing without the DOM.
const context = vm.createContext({ console, structuredClone, assert });
for (const file of ["tokeniser", "parser", "predicateSolverExpr", "constraintSystem", "dfs", "CSP Algorithms/AC-3", "CSP Algorithms/MAC", "main"]) {
    vm.runInContext(fs.readFileSync(`dist/${file}.js`, "utf8"), context, { filename: file });
}
context.logToConsole = () => {};
vm.runInContext(`
    for (const solver of [Dfs, MAC]) {
        const parsed = new constraintSystem(solver);
        parser("let X := [a,b]; def rules := { valid(b). }; rules[valid(X)];", parsed);
        assert.equal(parsed.returnAssignment(), "X => b");
        assert.equal(parsed.domains.get("X").length, 2);
        assert.equal(parsed.returnAssignment(), "X => b");
    }
    const scoped = parsePreds(interpreter(
        "nat(z). nat(s(N)) <- nat(N). equal(X,X). " +
        "greater(X,s(Y)) <- nat(Y). swap(X,Y) <- pair(Y,X). pair(a,b). " +
        "successor(X,s(X))."
    ), new predicateSystem());
    const swapped = scoped.parseQuery("swap(Y,X)");
    assert.equal(printExpr(swapped), "b,a");
    const same = scoped.parseQuery("equal(X,Y)");
    assert.notEqual(same, false);
    assert.equal(same[0].variableId, same[1].variableId);
    assert.notEqual(scoped.parseQuery("nat(s(s(z)))"), false);
    assert.equal(scoped.parseQuery("nat(s(a))"), false);
    const greater = scoped.parseQuery("greater(Y,s(z))");
    assert.notEqual(greater, false);
    assert.equal(greater[0].kind, "VAR");
    assert.equal(greater[0].match, "Y");
    assert.equal(printExpr(greater[1]), "s(z)");
    assert.equal(scoped.parseQuery("successor(X,X)"), false);
    assert.notEqual(scoped.parseQuery("successor(X,Y)"), false);
    assert.notEqual(scoped.parseQuery("greater(Y,s(s(z)))"), false);

    const a = new Expr("a", "ATOM");
    const b = new Expr("b", "ATOM");
    const childInput = [a];
    const compound = new Expr("(", "PRED", null, childInput);
    childInput.push(b);
    assert.equal(compound.rhs.length, 1);
    assert.ok(Object.isFrozen(compound));
    assert.ok(Object.isFrozen(compound.rhs));

    const builder = new constraintSystem(MAC);
    const original = [a, b];
    for (const name of ["X", "Y", "Z"]) builder.addVariable(name, original);
    original.pop();
    assert.equal(builder.domains.get("X").length, 2);
    builder.addPredicateSystem("test", parsePreds(interpreter("different(a,b). different(b,a)."), new predicateSystem()));
    builder.addConstraint(["X", "Y"], { system: "test", predicate: "different" });
    builder.addConstraint(["Y", "Z"], { system: "test", predicate: "different" });
    const problem = { constraints: builder.constraints, check: (con, values) => builder.check(con, values) };
    const input = builder.domains;
    const snapshot = JSON.stringify([...input]);
    const branch = new Map(input);
    branch.set("X", [a]);
    const reduced = ArcConsistency(problem, branch);
    assert.notEqual(reduced, false);
    assert.equal(reduced.get("Y")[0].match, "b");
    assert.equal(reduced.get("Z")[0].match, "a");
    assert.equal(branch.get("Y").length, 2);
    assert.equal(JSON.stringify([...input]), snapshot);
    assert.ok(Object.isFrozen(reduced.get("Y")));
    assert.notEqual(MAC(problem, input), false);
    assert.notEqual(Dfs(problem, input), false);
    assert.equal(JSON.stringify([...input]), snapshot);

    // An odd two-colour cycle survives GAC but fails during backtracking.
    builder.addConstraint(["Z", "X"], { system: "test", predicate: "different" });
    const impossible = { ...problem, constraints: builder.constraints };
    assert.notEqual(ArcConsistency(impossible, input), false);
    assert.equal(MAC(impossible, input), false);
    assert.equal(Dfs(impossible, input), false);
    assert.equal(JSON.stringify([...input]), snapshot);
    assert.equal(builder.domains.get("X").length, 2);
    assert.throws(() => MAC(problem, new Map()), /nullish/);
    assert.deepEqual(MAC({ constraints: [], check: () => true }, new Map()), []);
`, context, { timeout: 5000 });
console.log("Passed solver state isolation, frozen values, propagation, DFS/MAC, and failed-branch checks.");

const ts = require("typescript");
const config = ts.parseJsonConfigFileContent(ts.readConfigFile("tsconfig.json", ts.sys.readFile).config, ts.sys, ".");
const program = ts.createProgram([...config.fileNames, "tests/readonly-contract.ts"], { ...config.options, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n"
}));
console.log("Passed compile-time readonly contract checks.");
