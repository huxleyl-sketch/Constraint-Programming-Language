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
    const samples = ['let', 'def', 'import', 'from', '(./file.csp)', ':=', '^', '{', '}', '|', ':', '[', ']', ';', '<-', '~', '=', 'atom0', 'X1', '_', '(', ')', ',', '.'];
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
