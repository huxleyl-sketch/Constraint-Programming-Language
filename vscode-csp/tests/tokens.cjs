const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const definitions = require('../tokens.json');
const grammar = require('../syntaxes/csp.tmLanguage.json');
const { analyze } = require('../analysis');

test('generated token snapshot and grammar are up to date', () => {
    execFileSync(process.execPath, [path.join(__dirname, '../sync-tokens.cjs'), '--check']);
});

test('editor scanner recognizes every active runtime token definition', () => {
    const samples = ['let', 'def', 'import', 'from', '(./file.csp)', ':=', '^', '{', '}', ':', '[', ']', ';', '<-', '~', 'atom0', 'X1', '_', '(', ')', ',', '.'];
    assert.equal(samples.length, definitions.length);
    samples.forEach((sample, index) => {
        const input = definitions[index].kind === 'IMPORT_PATH' ? 'from ' + sample : sample;
        const result = analyze(input);
        if (definitions[index].kind === 'IMPORT_PATH') result.tokens.shift();
        assert.equal(result.tokens.length, 1, sample);
        assert.equal(result.tokens[0].kind, definitions[index].kind, sample);
        assert.equal(result.tokens[0].value, sample);
        assert.ok(grammar.patterns.some(pattern => new RegExp(pattern.match).test(input)), `No highlighting for ${sample}`);
    });
});

test('comments retain offsets and undeclared keywords stay atoms', () => {
    const text = '% comment\r\nimported letter defined 123abc';
    const tokens = analyze(text).tokens;
    assert.deepEqual(tokens.map(token => token.kind), ['ATOM', 'ATOM', 'ATOM', 'ATOM']);
    assert.equal(tokens[0].start, text.indexOf('imported'));
    assert.equal(tokens[3].value, '123abc');
});


test('symbolic names and words share ATOM while reserved punctuation keeps its tokens', () => {
    const result = analyze('word + / <= = <- := : ~ | ^');
    assert.deepEqual(result.tokens.map(token => token.kind),
        ['ATOM','ATOM','ATOM','ATOM','ATOM','IMPLIES','DEF','QUALIFIED','NOT','ATOM','MANY']);
    const source = 'def s := { value(+). same(X,X). +(a,b). word(a,b). }; let X := [+]; s[same(X,+)];';
    assert.deepEqual(analyze(source).diagnostics,[]);
});


test('pipes are ordinary atoms and support user-defined operator syntax', () => {
    const result = analyze('value(|). value(||). value(+|).');
    assert.deepEqual(result.tokens.filter(t=>['|','||','+|'].includes(t.value)).map(t=>t.kind),['ATOM','ATOM','ATOM']);
    const source = 'def s := { syntax[opp yfx |/2.]. |(a,b). same(X,X). wrap(a | b). }; let X := [|]; s[same(X,X)];';
    assert.deepEqual(analyze(source).diagnostics,[]);
});


test('shared joined operator lexer stays synchronized', () => {
    execFileSync(process.execPath,[path.join(__dirname,'../sync-operator-lexing.cjs'),'--check']);
});


test('all unprotected ASCII punctuation is available for atom and operator names', () => {
    for (const name of [...[35,36,64,92,39,34,96].map(code=>String.fromCharCode(code)), '$@', '#!']) {
        assert.equal(analyze(name).tokens[0].kind,'ATOM',name);
        const source = 'def symbols := { syntax[opp w/o 300 fy '+name+'/1.]. equal(X,X). '
            + 'check(R) <- equal(R,'+name+'1). '+name+'(1). };';
        assert.deepEqual(analyze(source).diagnostics.filter(d=>d.severity !== 'warning'),[],name);
        assert.ok(grammar.patterns.some(p=>p.name.includes('atom') && new RegExp(p.match).test(name)),name);
    }
});
