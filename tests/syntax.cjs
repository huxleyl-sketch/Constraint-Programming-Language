const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ console, structuredClone, assert, logToConsole() {} });
for (const file of ['src/tokeniser','src/parser','src/predicateSolverExpr','src/constraintSystem',
    'src/algorithms/dfs','src/algorithms/AC-3','src/algorithms/MAC','src/main','src/prologConsole']) {
    vm.runInContext(fs.readFileSync(`dist/${file}.js`,'utf8'),context);
}
context.extraSymbols = [35,36,64,92,39,34,96].map(code => String.fromCharCode(code));
vm.runInContext(`
    // Symbolic names are atoms everywhere, including values without declarations.
    assert.deepEqual(interpreter('word + / <= =').map(e => e.kind),['ATOM','ATOM','ATOM','ATOM','ATOM']);
    assert.deepEqual(interpreter('letter defined letdown default imported fromage').map(e => [e.kind,e.match]),
        ['letter','defined','letdown','default','imported','fromage'].map(word => ['ATOM',word]));
    {
        const compact = new constraintSystem(Dfs);
        parser('def compact := { syntax[opp 599 xfx =/2. opp yfx +/2. opp 500 yfx */2.]. =(X,X). };',compact);
        const session = new PrologConsole(compact);
        assert.equal(session.execute('?- compact:R=A+B.'),'R = +(A, B).');
        assert.equal(session.execute('?- compact:R=2+3*4.'),'R = +(2, *(3, 4)).');
    }

    {
        const joined = new constraintSystem(Dfs);
        parser('def joined := { syntax[opp w/o 599 xfx =/2. opp w/o yfx +/2. '
            + 'opp w/o 500 yfx */2. opp w xfx in/2. opp w/o 300 fy 1/1. '
            + 'opp w/o 300 fy 0/1. opp w/o xfx <=/2. opp w/o xfx </2.]. equal(X,X). =(X,X). };', joined);
        const session = new PrologConsole(joined);
        for (const [query,expected] of [
            ['equal(R,11)', 'R = 1(1).'],
            ['equal(R,100)', 'R = 1(0(0)).'],
            ['equal(R,A+B)', 'R = +(A, B).'],
            ['equal(R,1+1*1)', 'R = +(1, *(1, 1)).'],
            ['equal(R,a<=b)', 'R = <=(a, b).'],
            ['equal(R,thing)', 'R = thing.'],
            ['equal(R,a in b)', 'R = in(a, b).'],
            ['equal(R,(a)in(b))', 'R = in(a, b).'],
            ['equal(R,1(1))', 'R = 1(1).'],
            ['equal(R,Result11)', 'Result11 = R.']
        ]) assert.equal(session.execute('?- joined:'+query+'.'),expected,query);
        const fallback = new constraintSystem(Dfs);
        parser('def fallback := { syntax[opp w/o 500 xf <=/1. opp w/o 550 xfx </2. '
            + 'opp w/o 300 fy =/1.]. equal(X,X). };',fallback);
        assert.equal(new PrologConsole(fallback).execute('?- fallback:equal(R,a<=b).'),'R = <(a, =(b)).');
        const imported = new constraintSystem(Dfs);
        parser('import digits from (digits); def child extends digits := { value(11). };',imported,{
            filename: 'main', read: () => ({id:'digits',code:'def digits := { syntax[opp w/o 300 fy 1/1.]. equal(X,X). };'})
        });
        assert.equal(new PrologConsole(imported).execute('?- child:equal(R,11).'),'R = 1(1).');
        assert.equal(new PrologConsole(imported).execute('?- child:value(11).'),'true.');
        const spaced = new constraintSystem(Dfs);
        parser('def spaced := { syntax[opp w yfx +/2.]. equal(X,X). };',spaced);
        assert.equal(new PrologConsole(spaced).execute('?- spaced:equal(R,a + b).'),'R = +(a, b).');
        assert.throws(() => new PrologConsole(spaced).execute('?- spaced:equal(R,A+B).'));
    }

    for (const name of [...extraSymbols, '$@', '#!']) {
        assert.equal(interpreter(name)[0].kind,'ATOM',name);
        const symbols = new constraintSystem(Dfs);
        parser('def symbols := { syntax[opp w/o 300 fy '+name+'/1.]. equal(X,X). '+name+'(1). };',symbols);
        const session = new PrologConsole(symbols);
        assert.equal(session.execute('?- symbols:equal(R,'+name+'1).'),'R = '+name+'(1).',name);
        assert.equal(session.execute('?- symbols:'+name+'(1).'),'true.',name);
    }
    const atomSystem = new constraintSystem(Dfs);
    parser('def atoms := { value(+). value(word). same(X,X). +(a,b). word(a,b). };',atomSystem);
    const atomSession = new PrologConsole(atomSystem);
    assert.equal(atomSession.execute('?- atoms:same(+,X).'),'X = +.');
    assert.equal(atomSession.execute('?- atoms:+(a,b).'),'true.');
    assert.equal(atomSession.execute('?- atoms:word(a,b).'),'true.');
    for (const name of ['combine','+','/','<=','|','||','+|']) {
        const problem = new constraintSystem(Dfs);
        parser('def terms := { syntax[opp 599 xfx =/2. opp yfx '+name+'/2.]. =(X,X). };',problem);
        assert.equal(new PrologConsole(problem).execute('?- terms:R = a '+name+' b.'),'R = '+name+'(a, b).');
    }
    {
        const source = 'def unary := { syntax[opp 599 xfx =/2. opp 500 fx double/1. '
            + 'opp 500 fy repeat/1. opp 500 xf finish/1. opp 500 yf again/1. opp 550 yfx plus/2.]. '
            + '=(X,X). double(1). finish(1). check(double(1)). '
            + 'wrapped(double A) <- check(double A). negative(A) <- ~check(double A). }; '
            + 'def child extends unary := {};';
        const unary = new constraintSystem(Dfs); parser(source,unary);
        const session = new PrologConsole(unary);
        for (const [expression,expected] of [
            ['double 1','double(1)'], ['1 finish','finish(1)'],
            ['repeat repeat 1','repeat(repeat(1))'], ['1 again again','again(again(1))'],
            ['double (double 1)','double(double(1))'], ['(1 finish) finish','finish(finish(1))'],
            ['double 1 plus 2','plus(double(1), 2)'], ['1 plus 2 finish','plus(1, finish(2))'],
            ['double(1)','double(1)'], ['double1','double1'], ['double','double']
        ]) assert.equal(session.execute('?- unary:R = '+expression+'.'),'R = '+expected+'.',expression);
        for (const [open,close] of [['(',')'],['[',']'],['{','}']]) {
            assert.equal(session.execute('?- unary:R = double '+open+'double 1'+close+'.'),'R = double(double(1)).');
            assert.equal(session.execute('?- unary:R = '+open+'1 finish'+close+' finish.'),'R = finish(finish(1)).');
            assert.equal(session.execute('?- unary:R = '+open+'1 plus 2'+close+' plus 3.'),'R = plus(plus(1, 2), 3).');
            assert.equal(session.execute('?- unary:check('+open+'double 1'+close+').'),'true.');
            const problem = new constraintSystem(Dfs);
            parser('syntax[opp 500 fx double/1.].'+source+'let X := ['+open+'double 1'+close+']; unary['+open+'check(X)'+close+'];',problem);
            assert.ok(problem.returnAssignment());
        }
        assert.equal(session.execute('?- unary:R = double [{double 1}].'),'R = double(double(1)).');
        for (const bad of ['double [1}', 'double {1]', 'double [1', 'double []'])
            assert.throws(()=>session.execute('?- unary:R = '+bad+'.'));
        assert.equal(session.execute('?- unary:double 1.'),'true.');
        assert.equal(session.execute('?- unary:1 finish.'),'true.');
        assert.equal(session.execute('?- unary:wrapped(double 1).'),'true.');
        assert.equal(session.execute('?- unary:negative(2).'),'true.');
        assert.equal(session.execute('?- child:R = repeat repeat 1.'),'R = repeat(repeat(1)).');
        assert.throws(()=>session.execute('?- unary:R = double double 1.'),/parentheses/);
        assert.throws(()=>session.execute('?- unary:R = 1 finish finish.'),/parentheses/);
        for (const declaration of ['opp fx wrong/2.','opp yf wrong/2.','opp yfx wrong/1.','opp fx wrong/3.'])
            assert.throws(()=>parser('syntax['+declaration+'].',new constraintSystem(Dfs)),/arity/);
        const imports = { filename:'main',read:()=>({id:'library',code:source}) };
        const imported = new constraintSystem(Dfs);
        parser('import unary from (library); def consumer := { check(double A) <- unary:check(double A). }; '
            + 'let X := [double 1]; unary[check(X)];',imported,imports);
        assert.ok(imported.returnAssignment());
        assert.equal(new PrologConsole(imported).execute('?- consumer:check(double 1).'),'true.');
    }
    {
        const pipes = new constraintSystem(Dfs);
        parser('def pipes := { syntax[opp yfx |/2.]. |(a,b). same(X,X). wrap(a | b). }; let X := [|]; pipes[same(X,X)];',pipes);
        const session = new PrologConsole(pipes);
        assert.equal(interpreter('|')[0].kind,'ATOM');
        assert.equal(session.execute('?- pipes:same(|,R).'),'R = |.');
        assert.equal(session.execute('?- pipes:a | b.'),'true.');
        assert.equal(session.execute('?- pipes:wrap(|(a,b)).'),'true.');
        assert.ok(pipes.returnAssignment());
    }
    const syntaxCode = 'syntax[opp 599 xfx =/2. opp yfx combine/2. opp xfx related/2. opp xfy right/2. opp xfx single/2.].';
    const definitions = 'def s := { =(X,X). combine(a,b). related(a,b). check(combine(a,b)). '
        + 'calc(A,B,C) <- C = A combine B. nested(A,B) <- check(A combine B). '
        + 'relation(A,B) <- A related B. head(A combine B) <- combine(A,B). '
        + 'notChecked(A,B) <- ~check(A combine B). };';
    const system = new constraintSystem(Dfs);
    parser(syntaxCode + definitions,system);
    const session = new PrologConsole(system);
    assert.equal(session.execute('?- C = a combine b.'),'C = combine(a, b).');
    assert.equal(session.execute(';'),'false.');
    assert.equal(session.execute('?- C = a combine b combine c.'),'C = combine(combine(a, b), c).');
    assert.equal(session.execute('?- C = a right b right c.'),'C = right(a, right(b, c)).');
    assert.equal(session.execute('?- C = a combine (b combine c).'),'C = combine(a, combine(b, c)).');
    assert.equal(session.execute('?- a combine b.'),'true.');
    assert.equal(session.execute('?- check(a combine b).'),'true.');
    assert.equal(session.execute('?- calc(a,b,C).'),'C = combine(a, b).');
    assert.equal(session.execute('?- head(a combine b).'),'true.');
    assert.equal(session.execute('?- notChecked(b,a).'),'true.');
    assert.deepEqual(system.getPredicateSystem('s').grabPred('calc').defs[0].deps.map(d=>d.pred.match),['=']);
    assert.deepEqual(system.getPredicateSystem('s').grabPred('nested').defs[0].deps.map(d=>d.pred.match),['check']);
    assert.throws(()=>session.execute('?- C = a single b single c.'),/parentheses/);
    assert.throws(()=>session.execute('?- C := a combine b.'),/only for declarations/);
    assert.equal(session.execute('?- a combine b = a combine b.'),'true.');
    assert.equal(session.execute('?- a combine b = b combine a.'),'false.');
    assert.throws(()=>session.execute('?- A = B = C.'),/parentheses/);
    for (const bad of ['syntax[opp yfx p/3.].','syntax[opp yfx p/4.].','syntax[opp nope p/2.].',
        'syntax[opp 600 yfx p/2.].','syntax[opp yfx p/2.]','syntax[opp yfx p/2. opp yfx p/2.].']) {
        assert.throws(()=>parser(bad,new constraintSystem(Dfs)));
    }
    const priority = new constraintSystem(Dfs);
    parser('syntax[opp 599 xfx =/2. opp 500 yfx tight/2. opp 550 yfx loose/2.]. def p := { =(X,X). };',priority);
    assert.equal(new PrologConsole(priority).execute('?- R = a loose b tight c.'),'R = loose(a, tight(b, c)).');
    // Binary relations can also appear as compound terms, without being called.
    assert.equal(session.execute('?- R = (a related b).'),'R = related(a, b).');
    for (const solver of [Dfs,MAC]) {
        const problem = new constraintSystem(solver);
        parser(syntaxCode + definitions + 'let A := [a]; let B := [b]; let C := [a combine b]; '
            + 's[C = A combine B]; s[check(A combine B)];',problem);
        assert.ok(problem.returnAssignment());
    }
    const librarySource = 'def lib := { syntax[opp 599 xfx =/2. opp yfx merge/2. opp xfx relates/2.]. =(X,X). '
        + 'merge(A,B,pair(A,B)). relates(a,b). calculate(A,B,C) <- C = A merge B. }; '
        + 'def hidden := { syntax[opp xfx secret/2.]. secret(a,b,c). };';
    const importOptions = { filename:'src/main', read(path) {
        if (path === 'library') return {id:'library',code:librarySource};
        if (path === 'other') return {id:'other',code:'def other := { syntax[opp 599 xfx =/2. opp xfy merge/2.]. =(X,X). merge(A,B,other(A,B)). };'};
        throw new Error('missing');
    }};
    for (const solver of [Dfs,MAC]) {
        const imported = new constraintSystem(solver);
        parser('import lib from (library); def consumer := { result(A,B,R) <- R = A merge B. }; '
            + 'let A := [a]; let B := [b]; let C := [merge(a,b)]; lib[C = A merge B];',imported,importOptions);
        assert.equal(imported.getPredicateSystem('lib').syntax.size,3);
        assert.equal(imported.getPredicateSystem('consumer').syntax.size,0);
        const importedSession = new PrologConsole(imported);
        assert.equal(importedSession.execute('?- lib:R = a merge b.'),'R = merge(a, b).');
        assert.equal(importedSession.execute('?- consumer:result(a,b,R).'),'R = merge(a, b).');
        assert.equal(importedSession.execute('?- consumer:R = a merge b.'),'R = merge(a, b).');
        assert.throws(()=>importedSession.execute('?- lib:R = a secret b.'));
        assert.ok(imported.returnAssignment());
        parser('import other from (other);',imported,importOptions);
        assert.equal(importedSession.execute('?- other:R = a merge b merge c.'),'R = merge(a, merge(b, c)).');
        assert.equal(importedSession.execute('?- lib:R = a merge b merge c.'),'R = merge(merge(a, b), c).');
        assert.throws(()=>importedSession.execute('?- consumer:R = a merge b.'),/Ambiguous/);
    }
`,context,{timeout:5000});
const { spawnSync } = require('node:child_process');
for (const solver of ['dfs','mac']) for (const file of ['examples/syntax-example.csp','tests/fixtures/syntax-import.csp']) {
    const result = spawnSync(process.execPath,['terminal.cjs',file],{
        cwd: require('node:path').join(__dirname,'..'),
        input: solver+'\nsolve\nnext\n?- arithmetic:calculate(2,4,5,N).\n;\nreload\n?- arithmetic:+(9,1,N).\nexit\n',
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
