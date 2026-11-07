const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { analyze } = require('../analysis');

test('hidden tags apply to all clauses of one signature and survive imports and inheritance', () => {
    const source = `def library := {
        % @hidden
        helper(X,X).
        helper(a,b).
        helper(a).
        % @hidden secret/1
        secret(a).
        visible(X) <- secret(X).
    };`;
    const library = analyze(source);
    assert.deepEqual(library.diagnostics,[]);
    const signatures = library.systems[0].signatures;
    assert.equal(signatures.find(p => p.name === 'helper' && p.arity === 2).hidden,true);
    assert.equal(signatures.find(p => p.name === 'helper' && p.arity === 1).hidden,false);
    assert.equal(signatures.find(p => p.name === 'secret').hidden,true);
    const consumer = analyze('import library from (lib); def child extends library := { use(X) <- secret(X). };',()=>library);
    assert.deepEqual(consumer.diagnostics,[]);
    assert.equal(consumer.systems[1].signatures.find(p => p.name === 'secret').hidden,true);
    const override = analyze(source + 'def child extends library := { secret(b). };');
    assert.equal(override.systems[1].signatures.find(p => p.name === 'secret').hidden,false);
});

test('extends inherits predicates, signatures and syntax with local overrides', () => {
    const text = `def base := { syntax[opp yfx combine/2.]. combine(A,B,pair(A,B)). p(a). p(a,b). };
        def child extends base := { p(c). inherited(X) <- p(X). pair(A,B) <- p(A,B). };
        def grandchild extends child := {};`;
    const result = analyze(text);
    assert.deepEqual(result.diagnostics,[]);
    const call = result.references.find(ref => ref.kind === 'predicate' && ref.value === 'p' && ref.arity === 2);
    assert.equal(call.target.system.name,'base');
    const child = result.systems.find(system => system.name === 'child');
    assert.ok(child.signatures.some(pred => pred.name === 'combine' && pred.arity === 3));
    assert.equal(child.syntax.get('combine').system,'child');
    for (const source of ['def a extends missing := {};','def a extends a := {};',
        'def a extends b := {}; def b extends a := {};','def a extends := {};'])
        assert.ok(analyze(source).diagnostics.some(item=>item.severity === 'error'),source);
    const imported = analyze('import child from (lib); def use extends child := { p(X) <- inherited(X). };',()=>result);
    assert.deepEqual(imported.diagnostics,[]);
    assert.ok(imported.systems.find(system=>system.name === 'use').syntax.has('combine'));
});

test('system syntax is exported and imported without sibling declarations leaking', () => {
    const library = analyze(`def lib := { syntax[opp 599 xfx =/2. opp yfx merge/2.]. =(X,X). merge(A,B,pair(A,B)). };
        def hidden := { syntax[opp xfx secret/2.]. secret(a,b,c). };`);
    assert.deepEqual(library.diagnostics,[]);
    assert.equal(library.systems[0].syntax.size,2);
    const text = `import lib from (./library.csp);
        def consumer := { calculate(A,B,R) <- R = A merge B. };
        let A := [a]; let B := [b]; let R := [pair(a,b)]; lib[R = A merge B];`;
    const result = analyze(text,() => library);
    assert.deepEqual(result.diagnostics,[]);
    assert.ok(result.references.filter(ref => ref.value === 'merge').every(ref => ref.systemName === 'lib'));
    assert.ok(analyze(text.replace('A merge B','A secret B'),() => library).diagnostics.some(d => d.severity === 'error'));
    const independent = analyze(`def a := { syntax[opp 599 xfx =/2. opp yfx merge/2.]. =(X,X). merge(A,B,p(A,B)).
        c(A,B,C,R) <- R = A merge B merge C. };
        def b := { syntax[opp 599 xfx =/2. opp xfy merge/2.]. =(X,X). merge(A,B,p(A,B)).
        c(A,B,C,R) <- R = A merge B merge C. };`);
    assert.deepEqual(independent.diagnostics,[]);
});

test('syntax declarations resolve infix calls and nested compound terms', () => {
    const text = `syntax[opp 599 xfx =/2. opp yfx combine/2. opp xfx related/2.].
        def s := { =(X,X). combine(A,B,pair(A,B)). related(a,b). check(pair(a,b)).
            calc(A,B,C) <- C = A combine B.
            nested(A,B) <- check(A combine B).
            relation(A,B) <- A related B. };
        let A := [a]; let B := [b]; let C := [pair(a,b)];
        s[C = A combine B]; s[check(A combine B)];`;
    const result = analyze(text);
    assert.deepEqual(result.diagnostics, []);
    const calls = result.references.filter(ref => ref.kind === 'predicate' && ref.value === 'combine');
    assert.equal(calls.length,0);
    assert.equal(result.operators.get('combine').associativity,'yfx');
    assert.equal(result.operators.get('=').precedence,599);
    assert.ok(analyze(text.replace('C = A combine B','C := A combine B')).diagnostics
        .some(item => item.message.includes('only for declarations')));
});

test('infix terms in heads, negation and domains are not predicate calls', () => {
    const result = analyze(`syntax[opp 599 xfx =/2. opp yfx pair/2.].
        def s := { =(X,X). check(a pair b). different(A,B) <- ~check(A pair B). };
        let X := [a pair b]; s[check(X)];`);
    assert.deepEqual(result.diagnostics,[]);
    assert.equal(result.references.filter(ref => ref.kind === 'predicate' && ref.value === 'pair').length,0);
});

test('operator association, declaration validation and source positions', () => {
    const prefix = 'syntax[opp 599 xfx =/2. opp xfx combine/2.]. def s := { =(X,X). combine(A,B,p(A,B)). ';
    const input = prefix + 'calc(A,B,C,D) <- D = A combine B combine C. };';
    const result = analyze(input);
    const diagnostic = result.diagnostics.find(item => item.message.includes('parentheses'));
    assert.ok(diagnostic);
    assert.equal(diagnostic.start,input.lastIndexOf('combine'));
    for (const bad of ['syntax[opp yfx p/3.].','syntax[opp yfx p/4.].','syntax[opp nope p/3.].',
        'syntax[opp 600 yfx p/2.].','syntax[opp yfx p/2.]',
        'syntax[opp yfx p/2.]. syntax[opp yfx p/2.].']) {
        assert.ok(analyze(bad).diagnostics.some(item => item.severity === 'error'),bad);
    }
    assert.deepEqual(analyze(prefix.replace('xfx combine','yfx combine') +
        'calc(A,B,C,D) <- D = A combine B combine C. };').diagnostics,[]);
});

test('optional commas preserve argument arity, rule goals and references', () => {
    for (const separator of [', ', ' ', '\n', ',\n']) {
        const result = analyze(`let X := [a${separator}b]; let Y := [f(a${separator}b)];
            def s := { p(A${separator}B) <- t:q(A${separator}B)${separator}~t:blocked(A).
                pair(A${separator}B) <- p(A${separator}B)${separator}p(A${separator}B). };
            def t := { q(a${separator}f(a${separator}b)). blocked(b). };
            s[p(X${separator}Y)];`);
        assert.deepEqual(result.diagnostics, [], JSON.stringify(separator));
        const calls = result.references.filter(ref => ref.kind === 'predicate');
        assert.equal(calls.length, 5);
        assert.ok(calls.every(ref => ref.target));
        assert.ok(calls.filter(ref => ref.value !== 'blocked').every(ref => ref.arity === 2));
    }
});

test('optional commas still reject missing arguments and clause terminators', () => {
    for (const input of ['def s := { p(a,). };', 'def s := { p(a,,b). };',
        'let X := [a,];', 'def s := { p(X) <- q(X),. q(a). };',
        'def s := { p(a) q(a). };']) {
        assert.ok(analyze(input).diagnostics.some(item => item.severity === 'error'), input);
    }
});

test('imports declare external systems without false unknown-predicate errors', () => {
    const result = analyze('import test from (./other.csp); def s := { p(X) <- test:q(X). };');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.systems[0].path, './other.csp');
    assert.ok(analyze('import test from;').diagnostics.length);
});

test('declared symbolic predicates resolve infix calls', () => {
    const result = analyze('def s := { syntax[opp 599 xfx =/2.]. =(X,X). same(A,B) <- A = B. different(A,B) <- ~A = B. };');
    assert.deepEqual(result.diagnostics, []);
    const calls = result.references.filter(ref => ref.kind === 'predicate' && ref.value === '=');
    assert.equal(calls.length, 2);
    assert.ok(calls.every(ref => ref.target.name === '=' && ref.target.arity === 2));
    assert.ok(analyze('def s := { p(A,B,C) <- A = B = C. };').diagnostics.length);
    assert.ok(analyze('def s := { =(X,X). same(A,B) <- A = B. };').diagnostics.length);
});

test('qualified constraints are rejected; bracket constraints resolve references', () => {
    const result = analyze('let X := [a]; def s := { p(a). }; s : p(X);');
    assert.ok(result.diagnostics.length);
    const bracket = analyze('let X := [a]; def s := { p(a). }; s[p(X)];');
    assert.deepEqual(bracket.diagnostics, []);
    for (const kind of ['system', 'predicate', 'global']) {
        assert.ok(bracket.references.find(ref => ref.kind === kind).target);
    }
});

test('qualified rule calls resolve external predicates and keep clause variables local', () => {
    const result = analyze('def s := { p(X) <- t:q(X), ~t:blocked(X). }; def t := { q(a). blocked(b). };');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.references.find(ref => ref.value === 'q').target.system.name, 't');
    assert.ok(!result.references.some(ref => ref.kind === 'global'));
    const bad = analyze('def s := { p(X) <- missing:q(X). };');
    assert.ok(bad.diagnostics.some(item => item.message.includes('Unknown predicate system')));
});

test('repository example has no diagnostics; family variables resolve', () => {
    const result = analyze(fs.readFileSync(require('node:path').join(__dirname, '../../examples/example.csp'), 'utf8'));
    assert.deepEqual(result.diagnostics, []);
    const family = analyze('let X^5 := [a]; def s := { p(a). }; s[p(X4)];');
    assert.equal(family.references.find(ref => ref.value === 'X4').target.name, 'X');
});
test('comments and CRLF preserve diagnostic positions', () => {
    const input = '% comment parent(X)\r\ndef s := { p(a). };\r\ns[p(Missing)]; % eof';
    const result = analyze(input);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].start, input.indexOf('Missing'));
});
test('forward definitions, recursive calls and compound terms are supported', () => {
    const result = analyze('let X := [f(a)]; s[p(X)]; def s := { p(f(A)) <- q(A). q(A) <- p(A). };');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.references.find(ref => ref.value === 'q').target.arity, 1);
});
test('undefined systems, predicates, variables and arity errors', () => {
    const result = analyze('def s := { p(a). }; s[p(a,b)]; s[q(X)]; missing[p(a)];');
    for (const fragment of ['expects 1', "Unknown predicate 'q/1'", 'Undeclared query variable', 'Unknown predicate system']) {
        assert.ok(result.diagnostics.some(item => item.message.includes(fragment)), fragment);
    }
});
test('singleton warnings are scoped to clauses; anonymous variables are ignored', () => {
    const result = analyze('def s := { p(X,_). q(X,X). };');
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].severity, 'warning');
});
test('incomplete and malformed edits recover without hanging', () => {
    for (const input of ['def s := { p(X)', 'let X := [a;', 'def s := { p(a) };', 's[p(X);', '@', 'def s := { let Y := [a];']) {
        assert.ok(analyze(input).diagnostics.length, input);
    }
    const result = analyze('let X := [a; let Y := [b];');
    assert.ok(result.globals.has('Y'));
});
test('large family declarations do not allocate unbounded editor data', () => {
    assert.ok(analyze('let X^999999999999 := [a];').diagnostics.some(item => item.severity === 'warning'));
});

test('predicate documentation follows the first clause per name and arity across imports and inheritance', () => {
    const library = analyze('def lib := {\r\n  % First line.\r\n  % Second line.\r\n  p(A) <- q(A).\r\n  % Later clause.\r\n  p(b).\r\n  % Two arguments.\r\n  p(a,b).\r\n  q(a).\r\n};', undefined, '/library.csp');
    const signatures = library.systems[0].signatures;
    const first = signatures.find(item => item.name === 'p' && item.arity === 1);
    assert.equal(first.definition, 'p(A) <- q(A).');
    assert.equal(first.documentation, 'First line.\nSecond line.');
    assert.equal(first.filename, '/library.csp');
    assert.equal(signatures.filter(item => item.name === 'p' && item.arity === 1).length, 1);
    assert.equal(signatures.find(item => item.name === 'p' && item.arity === 2).documentation, 'Two arguments.');
    const consumer = analyze('import lib from (library); def child extends lib := { call(X) <- p(X). };', () => library);
    assert.equal(consumer.references.find(ref => ref.kind === 'predicate' && ref.value === 'p').target.documentation, first.documentation);
    assert.equal(consumer.systems.find(item => item.name === 'child').signatures.find(item => item.name === 'p' && item.arity === 1).filename, '/library.csp');
    const detached = analyze('def s := {\n % Detached comment.\n\n p(a).\n q(a). % Inline comment.\n r(a).\n};');
    assert.equal(detached.systems[0].predicates.find(item => item.name === 'p').documentation, '');
    assert.equal(detached.systems[0].predicates.find(item => item.name === 'r').documentation, '');
});


test('prefix and suffix operators respect arity, priority, grouping and scope', () => {
    const source = `def unary := { syntax[opp 599 xfx =/2. opp 500 fx double/1.
        opp 500 fy repeat/1. opp 500 xf finish/1. opp 500 yf again/1.].
        =(X,X). double 1. 1 finish. check(double 1).
        wrapped(double A) <- check(double A). negative(A) <- ~check(double A).
        calc(R) <- R = repeat repeat 1. calcSuffix(R) <- R = 1 again again.
        grouped(R) <- R = double (double 1). atom(R) <- R = double1.
    }; def child extends unary := { inherited(R) <- R = repeat repeat 1. };`;
    const library = analyze(source);
    assert.deepEqual(library.diagnostics,[]);
    assert.equal(library.systems[0].predicates.find(p=>p.name === 'double').arity,1);
    const imported = analyze('import unary from (library); def consumer := { value(R) <- R = double 1. }; let X := [double 1]; unary[check(X)];',()=>library);
    assert.deepEqual(imported.diagnostics,[]);
    for (const expression of ['double double 1','1 finish finish']) {
        const bad = analyze(source + `def bad extends unary := { value(R) <- R = ${expression}. };`);
        assert.ok(bad.diagnostics.some(d=>d.message.includes('parentheses')),expression);
    }
    for (const declaration of ['opp fx wrong/2.','opp yf wrong/2.','opp yfx wrong/1.'])
        assert.ok(analyze('syntax['+declaration+'].').diagnostics.some(d=>d.message.includes('arity')));
});


test('all three bracket pairs group operator expressions inside existing language constructs', () => {
    for (const [open,close] of [['(',')'],['[',']'],['{','}']]) {
        const source = `syntax[opp fx double/1.]. def s := { syntax[opp 599 xfx =/2. opp fx double/1. opp xf finish/1.].
            =(X,X). check(double(1)). head(${open}double A${close}) <- check(double A).
            calc(R) <- R = double ${open}double 1${close}.
            suffix(R) <- R = ${open}1 finish${close} finish.
        }; let X := [${open}double 1${close}]; s[${open}check(X)${close}];`;
        assert.deepEqual(analyze(source).diagnostics,[],open);
    }
    for (const expression of ['double [1}', 'double {1]', 'double []']) {
        const result = analyze(`syntax[opp fx double/1.]. def s := { check(${expression}). };`);
        assert.ok(result.diagnostics.some(d=>d.severity === 'error'),expression);
    }
});


test('standard digit prefixes and finite-list notation work through imports', () => {
    const library = analyze(fs.readFileSync(require('node:path').join(__dirname, '../../lib/standard.csp'), 'utf8'));
    assert.deepEqual(library.diagnostics.filter(item => item.severity !== 'warning'), []);
    const result = analyze(`import standard from (library);
        def use extends standard := {
            digits(1 9).
            nested([[a | []] | []]).
            total(N) <- sum([9 | 2 | []],N).
            calculate(N) <- fastAdd(1 9,1,N).
        };`, () => library);
    assert.deepEqual(result.diagnostics.filter(item => item.severity !== 'warning'), []);
});


test('operator whitespace tags, longest matches, retries and digit chains', () => {
    const source = `def joined := { syntax[
        opp w/o 550 yfx +/2. opp w/o 300 fy 1/1. opp w/o 300 fy 0/1.
        opp w xfx in/2. opp w/o xfx <=/2. opp w/o xfx </2.
    ]. equal(X,X). check(R) <- equal(R,100+11). word(thing). relation(a<=b).
       separated(a in b). bounded((a)in(b)). };
       def fallback := { syntax[opp w/o 500 xf <=/1. opp w/o 550 xfx </2.
       opp w/o 300 fy =/1.]. equal(X,X). check(R) <- equal(R,a<=b). };`;
    assert.deepEqual(analyze(source).diagnostics.filter(d=>d.severity !== 'warning'),[]);
});
