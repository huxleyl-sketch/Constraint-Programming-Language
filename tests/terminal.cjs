const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const result = spawnSync(process.execPath, ["terminal.cjs", "tests/fixtures/greaterTest.csp"], {
    cwd: root,
    input: [
        "dfs",
        "solve",
        "next",
        "stop",
        "next",
        "solve",
        "let Extra := [a];",
        "next",
        "?- test:greater(X,s(0)).",
        ";",
        "?- test:greater(s(0),s(s(0))).",
        "def demo := { value(a). value(b). derived(X) <- value(X). equal(X,X). successor(X,s(X)). };",
        "?- demo:derived(X).",
        ";",
        ";",
        "?- demo:equal(X,Y).",
        "?- demo:successor(X,Y).",
        ".",
        "?- value(X).",
        "reload",
        "?- greater(X,s(0)).",
        "exit",
        ""
    ].join("\n"),
    encoding: "utf8",
    timeout: 15000
});
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /Solution 1:/);
assert.match(result.stdout, /Solution 2:/);
assert.match(result.stdout, /Search stopped\./);
assert.match(result.stdout, /No active search\. Enter solve to start\./);
assert.match(result.stdout, /Loaded greaterTest\.csp/);
assert.match(result.stdout, /X = 0\./);
assert.match(result.stdout, /false\./);
assert.match(result.stdout, /true\./);
assert.match(result.stdout, /X = a\.[\s\S]*X = b\.[\s\S]*false\./);
assert.match(result.stdout, /Y = X\./);
assert.match(result.stdout, /Y = s\(X\)\./);
assert.match(result.stdout, /Query finished\./);
assert.match(result.stderr, /Specify a predicate system/);
assert.equal((result.stdout.match(/Loaded greaterTest\.csp/g) ?? []).length, 2);
console.log("Passed terminal file loading, reload, query bindings, dependency alternatives, aliases, cancellation, and namespace checks.");

for (const choice of ["dfs", "mac"]) {
    const loading = spawnSync(process.execPath, ["terminal.cjs", "tests/fixtures/greaterTest.csp"], {
        cwd: root,
        input: `solve\n${choice}\nreload\nexit\n`,
        encoding: "utf8", timeout: 15000
    });
    assert.ifError(loading.error);
    assert.equal(loading.status, 0, loading.stderr);
    assert.equal(loading.stderr, "");
    assert.match(loading.stdout, /Choose dfs \(1\) or mac \(2\) before continuing/);
    assert.match(loading.stdout, new RegExp(`${choice.toUpperCase()} selected`));
    assert.equal((loading.stdout.match(/Loaded greaterTest\.csp/g) ?? []).length, 2);
    assert.doesNotMatch(loading.stdout, /Solution 1:|=>|Initial Assignment/);
}
console.log("Passed algorithm-first selection and load/reload without automatic solving for DFS and MAC.");
