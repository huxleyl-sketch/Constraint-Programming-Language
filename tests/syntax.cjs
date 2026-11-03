const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ console, structuredClone, assert, logToConsole() {} });
for (const file of ['src/tokeniser','src/parser','src/predicateSolverExpr','src/constraintSystem',
    'src/algorithms/dfs','src/algorithms/AC-3','src/algorithms/MAC','src/main','src/prologConsole']) {
    vm.runInContext(fs.readFileSync(`dist/${file}.js`,'utf8'),context);
}
vm.runInContext(`
    const original = interpreter('A pred B');
    assert.equal(original.length,3);
    assert.equal(interpreter('pred(A,B)')[0].kind,'PRED');
    const syntaxCode = 'syntax[opp xfx =/2. opp yfx combine/3. opp xfx related/2. opp xfy right/3. opp xfx single/3.].';
    const definitions = 'def s := { =(X,X). combine(A,B,pair(A,B)). right(A,B,pair(A,B)). single(A,B,pair(A,B)). related(a,b). '
        + 'check(pair(a,b)). calc(A,B,C) <- C = A combine B. '
        + 'nested(A,B) <- check(A combine B). relation(A,B) <- A related B. };';
    const system = new constraintSystem(Dfs);
    parser(syntaxCode + definitions,system);
    const session = new PrologConsole(system);
    assert.equal(session.execute('?- C = a combine b.'),'C = pair(a, b).');
    assert.equal(session.execute(';'),'false.');
    assert.equal(session.execute('?- C = a combine b combine c.'),'C = pair(pair(a, b), c).');
    assert.equal(session.execute(';'),'false.');
    assert.equal(session.execute('?- C = a right b right c.'),'C = pair(a, pair(b, c)).');
    assert.equal(session.execute('?- C = (a combine b) combine c.'),'C = pair(pair(a, b), c).');
    assert.equal(session.execute('?- C = a combine (b combine c).'),'C = pair(a, pair(b, c)).');
    assert.equal(session.execute('?- check(a combine b).'),'true.');
    assert.equal(session.execute('?- s:check(a combine b).'),'true.');
    assert.equal(session.execute('?- a related b.'),'true.');
    assert.equal(session.execute('?- related(a,b).'),'true.');
    assert.equal(session.execute('?- relation(a,b).'),'true.');
    assert.equal(session.execute('?- nested(a,b).'),'true.');
    assert.equal(session.execute('?- calc(a,b,C).'),'C = pair(a, b).');
    assert.equal(session.execute('?- combine(a,b,C).'),'C = pair(a, b).');
    const revision = system.revision;
    session.execute('?- C = a combine b combine c.');
    assert.equal(system.revision,revision);
    assert.deepEqual(system.getPredicateSystem('s').grabPred('calc').defs[0].deps.map(d=>d.pred.match),['combine','=']);
    assert.deepEqual(system.getPredicateSystem('s').grabPred('nested').defs[0].deps.map(d=>d.pred.match),['combine','check']);
    assert.throws(()=>session.execute('?- C = a single b single c.'),/parentheses/);
    assert.throws(()=>session.execute('?- a related b related c.'),/parentheses/);
    assert.throws(()=>session.execute('?- a combine b.'),/needs a result/);
    assert.throws(()=>session.execute('?- C := a combine b.'),/only for declarations/);
    assert.equal(session.execute('?- a combine b = a combine b.'),'true.');
    assert.equal(session.execute('?- a combine b = b combine a.'),'false.');
    assert.throws(()=>session.execute('?- A = B = C.'),/parentheses/);
    assert.throws(()=>session.execute('?- ~check(a combine b).'),/wrapper predicate/);
    assert.throws(()=>parser('let Bad := [1 combine 2];',system),/domain declarations/);
    assert.equal(system.syntax.size,5);
    assert.equal(new constraintSystem(Dfs).syntax.size,0);
    const ordinaryRelation = new constraintSystem(Dfs);
    parser('def test := { syntax[opp xfx =/2. opp yfx combine/3.]. '
        + '=(wrong,wrong). combine(A,B,pair(A,B)). };',ordinaryRelation);
    assert.equal(new PrologConsole(ordinaryRelation).execute('?- R = a combine b.'),'false.');
    const qualified = new constraintSystem(Dfs);
    parser('syntax[opp yfx combine/3.]. def s := { same(A,B) <- t:A = B. }; '
        + 'def t := { syntax[opp xfx =/2.]. =(X,X). };',qualified);
    assert.equal(new PrologConsole(qualified).execute('?- s:same(a,R).'),'R = a.');
    const relationHead = new constraintSystem(Dfs);
    parser('syntax[opp xfx related/2.]. def s := { a related b. };',relationHead);
    assert.equal(new PrologConsole(relationHead).execute('?- a related b.'),'true.');
    const alternatives = new constraintSystem(Dfs);
    parser('syntax[opp yfx choice/3.]. def s := { choice(a,b,x). choice(a,b,y). keep(x). keep(y). };',alternatives);
    const alternativeSession = new PrologConsole(alternatives);
    assert.equal(alternativeSession.execute('?- keep(a choice b).'),'true.');
    assert.equal(alternativeSession.execute(';'),'true.');
    assert.equal(alternativeSession.execute(';'),'false.');
    const collision = new constraintSystem(Dfs);
    parser(syntaxCode + definitions + 'def extra := { =(X,X). check(pair(pair(a,b),c)). '
        + 'combine(A,B,pair(A,B)). collide(SyntaxValue0,R) <- R = SyntaxValue0 combine b combine c. };',collision);
    assert.equal(new PrologConsole(collision).execute('?- extra:collide(a,R).'),'R = pair(pair(a, b), c).');
    for (const bad of ['syntax[opp yfx p/4.].','syntax[opp nope p/3.].',
        'syntax[opp 600 yfx p/3.].','syntax[opp yfx p/3.]',
        'syntax[opp yfx p/3. opp yfx p/3.].']) {
        const invalid = new constraintSystem(Dfs);
        assert.throws(()=>parser(bad,invalid));
        assert.equal(invalid.syntax.size,0);
    }
    const priority = new constraintSystem(Dfs);
    parser('syntax[opp xfx =/2. opp 500 yfx tight/3. opp 550 yfx loose/3.]. '
        + 'def p := { =(X,X). tight(A,B,t(A,B)). loose(A,B,l(A,B)). };',priority);
    assert.equal(new PrologConsole(priority).execute('?- R = a loose b tight c.'),'R = l(a, t(b, c)).');
    for (const solver of [Dfs,MAC]) {
        const problem = new constraintSystem(solver);
        parser(syntaxCode + definitions + 'let A := [a]; let B := [b]; let C := [pair(a,b)]; '
            + 's[C = A combine B]; s[check(A combine B)];',problem);
        assert.ok(problem.returnAssignment());
        assert.equal(new PrologConsole(problem).execute('?- check(a combine b).'),'true.');
    }
    const librarySource = 'def lib := { syntax[opp xfx =/2. opp yfx merge/3. opp xfx relates/2.]. =(X,X). '
        + 'merge(A,B,pair(A,B)). relates(a,b). calculate(A,B,C) <- C = A merge B. }; '
        + 'def hidden := { syntax[opp xfx secret/3.]. secret(a,b,c). };';
    const importOptions = { filename:'src/main', read(path) {
        if (path === 'library') return {id:'library',code:librarySource};
        if (path === 'other') return {id:'other',code:'def other := { syntax[opp xfx =/2. opp xfy merge/3.]. =(X,X). merge(A,B,other(A,B)). };'};
        throw new Error('missing');
    }};
    for (const solver of [Dfs,MAC]) {
        const imported = new constraintSystem(solver);
        parser('import lib from (library); def consumer := { result(A,B,R) <- R = A merge B. }; '
            + 'let A := [a]; let B := [b]; let C := [pair(a,b)]; lib[C = A merge B];',imported,importOptions);
        assert.equal(imported.getPredicateSystem('lib').syntax.size,3);
        assert.equal(imported.getPredicateSystem('consumer').syntax.size,0);
        const importedSession = new PrologConsole(imported);
        assert.equal(importedSession.execute('?- lib:R = a merge b.'),'R = pair(a, b).');
        assert.equal(importedSession.execute('?- consumer:result(a,b,R).'),'R = pair(a, b).');
        assert.equal(importedSession.execute('?- consumer:R = a merge b.'),'R = pair(a, b).');
        assert.throws(()=>importedSession.execute('?- lib:R = a secret b.'));
        assert.ok(imported.returnAssignment());
        parser('import other from (other);',imported,importOptions);
        assert.equal(importedSession.execute('?- other:R = a merge b merge c.'),'R = other(a, other(b, c)).');
        assert.equal(importedSession.execute('?- lib:R = a merge b merge c.'),'R = pair(pair(a, b), c).');
        assert.throws(()=>importedSession.execute('?- consumer:R = a merge b.'),/Ambiguous/);
    }
`,context,{timeout:5000});
const { spawnSync } = require('node:child_process');
for (const solver of ['dfs','mac']) for (const file of ['examples/syntax-example.csp','tests/fixtures/syntax-import.csp']) {
    const result = spawnSync(process.execPath,['terminal.cjs',file],{
        cwd: require('node:path').join(__dirname,'..'),
        input: solver+'\nsolve\nnext\n?- arithmetic:N = 2 add 4 mult 5.\n;\nreload\n?- arithmetic:N = 9 add 1.\nexit\n',
        encoding:'utf8',timeout:15000
    });
    assert.ifError(result.error);
    assert.equal(result.status,0);
    assert.equal(result.stderr,'');
    assert.match(result.stdout,/Solution 2:/);
    assert.match(result.stdout,/N = n\(2, 2\)\./);
    assert.match(result.stdout,/N = n\(1, 0\)\./);
}
console.log('Passed syntax declarations, associativity, priorities, expansion, console and DFS/MAC checks.');
