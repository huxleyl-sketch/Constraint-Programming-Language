const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Keep the browser's shared-script arrangement while testing without the DOM.
const context = vm.createContext({ console, structuredClone, assert });
for (const file of ["src/tokeniser", "src/parser", "src/predicateSolverExpr", "src/constraintSystem", "src/algorithms/dfs", "src/algorithms/AC-3", "src/algorithms/MAC", "src/main", "src/solutionSession", "src/prologConsole"]) {
    vm.runInContext(fs.readFileSync(`dist/${file}.js`, "utf8"), context, { filename: file });
}
context.logToConsole = () => {};
vm.runInContext(`
    const parseOnly = new constraintSystem(() => { throw new Error("Parser must not solve"); });
    parser("let X := [a,b]; def rules := { valid(b). }; rules[valid(X)];", parseOnly);
    assert.equal(parseOnly.constraints.length, 1);
    for (const solver of [Dfs, MAC]) {
        const qualified = new constraintSystem(solver);
        parser("let X := [a,b]; def rules := { valid(b). };", qualified);
        assert.throws(() => parser("rules : valid(X);", qualified), /Constraints use/);
        assert.equal(qualified.constraints.length, 0);
        parser("rules[valid(X)];", qualified);
        assert.equal(qualified.constraints.length, 1);
        assert.equal(qualified.returnAssignment(), "X => b");
        const parsed = new constraintSystem(solver);
        parser("let X := [a,b]; def rules := { valid(b). }; rules[valid(X)];", parsed);
        assert.equal(parsed.returnAssignment(), "X => b");
        assert.equal(parsed.domains.get("X").length, 2);
        assert.equal(parsed.returnAssignment(), "X => b");
    }
    const cross = new constraintSystem(Dfs);
    const symbolic = new constraintSystem(Dfs);
    parser('def symbols := { syntax[opp 599 xfx =/2.]. =(X,X). equal(A,B) <- A = B. ' +
        'different(A,B) <- ~A = B. ' +
        '>(s(X),X). chosen(X) <- value(X), X = b. value(a). value(b). }; ' +
        'def use := { same(A,B) <- symbols:A = B. };', symbolic);
    const symbolicAnswers = (system, name, args) => [...symbolic.queryPredicate(system, name, interpreter(args))].filter(Boolean).map(printExpr);
    assert.deepEqual(symbolicAnswers('symbols', 'equal', 's(a), X'), ['s(a),s(a)']);
    assert.deepEqual(symbolicAnswers('symbols', 'different', 'a,b'), ['a,b']);
    assert.deepEqual(symbolicAnswers('symbols', 'different', 'a,a'), []);
    assert.deepEqual(symbolicAnswers('symbols', 'chosen', 'X'), ['b']);
    assert.deepEqual(symbolicAnswers('use', 'same', 'a,X'), ['a,a']);
    const symbolicConsole = new PrologConsole(symbolic);
    assert.equal(symbolicConsole.execute('?- symbols:a = X.'), 'X = a.');
    assert.equal(symbolicConsole.execute('?- symbols:=(s(a),X).'), 'X = s(a).');
    for (const solver of [Dfs, MAC]) {
        const problem = new constraintSystem(solver);
        parser('let X := [a,b]; let Y := [b]; def logic := { syntax[opp 599 xfx =/2.]. =(V,V). }; logic[X = Y];', problem);
        assert.equal(problem.returnAssignment(), 'X => b' + '\\n- Y => b');
    }
    assert.deepEqual(interpreter('A = B').map(e => e.kind), interpreter('A same B').map(e => e.kind));
    assert.equal(interpreter('=(A,B)')[0].lhs[0].match, '=');
    assert.deepEqual(interpreter('A = B = C').map(e => e.kind), interpreter('A same B same C').map(e => e.kind));
    assert.deepEqual(interpreter('A =').map(e => e.kind), interpreter('A same').map(e => e.kind));
    parser("def system := { p(X) <- test:value(X), keep(X). keep(b). " +
        "no(X) <- test:value(X), ~test:blocked(X). " +
        "pair(X,Y) <- test:value(X), test:value(Y). }; " +
        "def test := { value(a). value(b). blocked(a). };", cross);
    const answers = (name, args) => [...cross.queryPredicate('system', name, interpreter(args))]
        .filter(Boolean).map(printExpr);
    assert.deepEqual(answers('p', 'X'), ['b']);
    assert.deepEqual(answers('no', 'X'), ['b']);
    assert.deepEqual(answers('pair', 'X Y'), ['a,a', 'a,b', 'b,a', 'b,b']);
    parser('def recursive := { nat(z). nat(s(X)) <- recursive:nat(X). }; ' +
        'def bridge := { nat(X) <- recursive:nat(X). };', cross);
    assert.ok([...cross.queryPredicate('bridge', 'nat', interpreter('s(s(z))'))].some(Boolean));
    parser('def absent := { p(X) <- test:missing(X). };', cross);
    assert.throws(() => [...cross.queryPredicate('absent', 'p', interpreter('X'))], /Unknown predicate: test:missing/);
    assert.throws(() => {
        parser('def bad := { p(X) <- missing:value(X). };', cross);
        [...cross.queryPredicate('bad', 'p', interpreter('X'))];
    }, /Unknown predicate system: missing/);
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
    assert.equal(MAC(problem, input).next().done, false);
    assert.equal(Dfs(problem, input).next().done, false);
    assert.equal(JSON.stringify([...input]), snapshot);

    // Both solvers enumerate the same complete solutions without editing any inputs.
    const expected = ["aba", "bab"];
    for (const solver of [Dfs, MAC]) {
        const answers = [...solver(problem, input)];
        assert.equal(answers.length, 2);
        assert.deepEqual(answers.map(answer => answer.map(entry => entry.val.match).join("")).sort(), expected);
        assert.ok(answers.every(answer => Object.isFrozen(answer) && answer.every(Object.isFrozen)));
        const partial = solver(problem, input);
        assert.equal(partial.next().done, false);
        partial.return();
        assert.equal(partial.next().done, true);
        assert.equal(JSON.stringify([...input]), snapshot);
    }
    const navigation = new SolutionSession(builder);
    assert.match(navigation.execute("next"), /No active search/);
    assert.match(navigation.execute("solve"), /Solution 1:/);
    assert.match(navigation.execute("next"), /Solution 2:/);
    assert.equal(navigation.execute("next"), "No more solutions.");
    assert.match(navigation.execute("solve"), /Solution 1:/);
    navigation.execute("stop");
    assert.match(navigation.execute("next"), /No active search/);
    const invalidated = builder.solutions();
    invalidated.next();
    builder.addVariable("Z", [a, b]);
    assert.throws(() => invalidated.next(), /Problem changed/);
    assert.equal(JSON.stringify([...input]), snapshot);

    // An odd two-colour cycle survives GAC but fails during backtracking.
    builder.addConstraint(["Z", "X"], { system: "test", predicate: "different" });
    const impossible = { ...problem, constraints: builder.constraints };
    assert.notEqual(ArcConsistency(impossible, input), false);
    assert.equal(MAC(impossible, input).next().done, true);
    assert.equal(Dfs(impossible, input).next().done, true);
    assert.equal(JSON.stringify([...input]), snapshot);
    assert.equal(builder.domains.get("X").length, 2);
    assert.throws(() => MAC(problem, new Map()).next(), /nullish/);
    assert.deepEqual([...MAC({ constraints: [], check: () => true }, new Map())], [[]]);
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
