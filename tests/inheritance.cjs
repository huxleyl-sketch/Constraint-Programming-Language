const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ console, structuredClone, assert, logToConsole() {} });
for (const file of ['src/tokeniser','src/parser','src/predicateSolverExpr','src/constraintSystem',
    'src/algorithms/dfs','src/algorithms/AC-3','src/algorithms/MAC','src/main','src/prologConsole']) {
    vm.runInContext(fs.readFileSync(`dist/${file}.js`,'utf8'),context);
}
vm.runInContext(`
    const source = 'def base := { syntax[opp yfx combine/2.]. combine(A,B,pair(A,B)). '
        + 'value(parent). value(a,b). inherited(X) <- value(X). }; '
        + 'def child extends base := { value(child). local(A,B,R) <- combine(A,B,R). '
        + 'explicit(X) <- base:value(X). }; def grandchild extends child := {}; '
        + 'def caller := { call(X) <- grandchild:value(X). };';
    const system = new constraintSystem(Dfs);
    parser(source,system);
    const session = new PrologConsole(system);
    assert.equal(session.execute('?- child:value(X).'),'X = child.');
    assert.equal(session.execute(';'),'false.');
    assert.equal(session.execute('?- child:value(A,B).'),'A = a,\\nB = b.');
    assert.equal(session.execute('?- child:inherited(X).'),'X = parent.');
    assert.equal(session.execute('?- child:explicit(X).'),'X = parent.');
    assert.equal(session.execute('?- child:local(a,b,R).'),'R = pair(a, b).');
    assert.equal(session.execute('?- grandchild:value(X).'),'X = child.');
    assert.equal(session.execute('?- caller:call(X).'),'X = child.');
    assert.equal(session.execute('?- grandchild:combine(a,b,R).'),'R = pair(a, b).');
    assert.equal(session.execute('?- grandchild:combine(a,b,pair(a,b)).'),'true.');
    const forward = new constraintSystem(Dfs);
    parser('def child extends base := {}; def base := { ok(a). };',forward);
    assert.equal(new PrologConsole(forward).execute('?- child:ok(a).'),'true.');
    for (const bad of ['def a extends missing := {};','def a extends a := {};',
        'def a extends b := {}; def b extends a := {};','def a extends := {};']) {
        assert.throws(()=>parser(bad,new constraintSystem(Dfs)));
    }
    assert.throws(()=>parser('def base extends grandchild := {};',system),/Cyclic/);
    const options = {filename:'src/main',read(){return {id:'lib',code:source};}};
    for (const solver of [Dfs,MAC]) {
        const imported = new constraintSystem(solver);
        parser('import grandchild from (lib); def use extends grandchild := { '
            + 'ok(X) <- inherited(X). }; let X := [parent,no]; use[ok(X)];',imported,options);
        assert.equal(imported.returnAssignment(),'X => parent');
        const query = new PrologConsole(imported);
        assert.equal(query.execute('?- use:combine(a,b,R).'),'R = pair(a, b).');
        assert.equal(query.execute('?- use:inherited(parent).'),'true.');
    }
`,context,{timeout:5000});
console.log('Passed inheritance, overrides by arity, lexical scope, imported children, forward parents and cycle checks.');
