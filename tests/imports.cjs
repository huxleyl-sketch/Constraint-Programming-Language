const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const context = vm.createContext({ console, structuredClone, assert, logToConsole() {} });
for (const file of ['src/tokeniser', 'src/parser', 'src/predicateSolverExpr', 'src/constraintSystem', 'src/algorithms/dfs', 'src/algorithms/AC-3', 'src/algorithms/MAC', 'src/main']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', file + '.js'), 'utf8'), context);
}
vm.runInContext(`
    const files = new Map([
        ['lib', 'import helper from (helper); def test := { value(X) <- helper:value(X). }; let Ignore := [a]; missing[p(Ignore)];'],
        ['helper', 'def helper := { value(b). };'],
        ['cycle', 'import test from (cycle); def test := { value(a). };'],
        ['space % path', 'def test := { value(c). };']
    ]);
    const options = { filename: 'src/main', read(path) {
        if (!files.has(path)) throw new Error('File not found');
        return { id: path, code: files.get(path) };
    } };
    for (const solver of [Dfs, MAC]) {
        const system = new constraintSystem(solver);
        parser('import test from (lib); let X := [a,b]; test[value(X)];', system, options);
        assert.equal(system.returnAssignment(), 'X => b');
        assert.equal(system.domains.size, 1);
        assert.equal(system.constraints.length, 1);
        assert.throws(() => system.getPredicateSystem('helper'), /Unknown predicate system/);
        assert.throws(() => parser('import test from (lib);', system, options), /Duplicate predicate system/);
        assert.throws(() => parser('def test := { p(a). };', system), /Duplicate predicate system/);
    }
    const load = code => parser(code, new constraintSystem(Dfs), options);
    assert.throws(() => load('import absent from (lib);'), /Unknown predicate system: absent/);
    assert.throws(() => load('import test from (missing);'), /Cannot import/);
    assert.throws(() => load('import test from (cycle);'), /Circular import/);
    assert.throws(() => load('import test from (lib)'), /Expected import/);
    assert.throws(() => load('import test from ();'), /cannot be empty/);
    assert.throws(() => load('import test from (lib;'), /Expected import|closing/);
    load('import test from (space % path); % comment at EOF');
`, context);
const result = spawnSync(process.execPath, ['terminal.cjs', 'tests/fixtures/imports/main.csp'], {
    cwd: path.join(__dirname, '..'), input: 'dfs\nsolve\n?- test:value(X).\nreload\nsolve\nexit\n', encoding: 'utf8', timeout: 15000
});
assert.ifError(result.error);
assert.equal(result.status, 0);
assert.equal(result.stderr, '');
assert.match(result.stdout, /X = b\./);
assert.equal((result.stdout.match(/X = b/g) || []).length, 3);
console.log('Passed named imports, nested relative imports, isolation, reload, missing files/systems, duplicates, and cycles.');
