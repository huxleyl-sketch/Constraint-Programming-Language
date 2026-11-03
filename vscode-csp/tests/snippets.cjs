const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { analyze } = require('../analysis');
const snippets = require('../snippets/standard.json');
const manifest = require('../package.json');
const plain = snippet => (Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body)
    .replace(/\$\{\d+\|([^}]+)\|\}/g, (_, choices) => choices.split(',')[0])
    .replace(/\$\{\d+:([^}]+)\}/g, '$1').replace(/\$\d+/g, '');

test('standard snippets are registered, packaged and synchronized with the library', () => {
    execFileSync(process.execPath, [path.join(__dirname, '../sync-standard-snippets.cjs'), '--check']);
    assert.ok(manifest.contributes.snippets.some(item => item.path === './snippets/standard.json'));
    assert.match(fs.readFileSync(path.join(__dirname, '../package-extension.ps1'), 'utf8'), /'snippets\/standard.json'/);
    const prefixes = Object.values(snippets).map(item => item.prefix);
    assert.equal(new Set(prefixes).size, prefixes.length);
    assert.ok(!prefixes.includes('std-fastDigits'));
});

test('expanded public call snippets match library arities and parse in rule bodies', () => {
    const library = analyze(fs.readFileSync(path.join(__dirname, '../../lib/standard.csp'), 'utf8'));
    const signatures = library.systems.find(system => system.name === 'standard').signatures;
    for (const [name, snippet] of Object.entries(snippets)) {
        if (!/^Standard .+\/\d+$/.test(name)) continue;
        const call = plain(snippet);
        const [, predicate, args] = /^standard\s*:\s*([^()]+)\(([^()]*)\)$/.exec(call);
        assert.ok(signatures.some(item => item.name === predicate && item.arity === args.split(',').length), name);
        const result = analyze(`import standard from (library); def use := { p(A,B,C,D,Result,List,Value) <- ${call}. };`, () => library);
        assert.deepEqual(result.diagnostics.filter(item => item.severity !== 'warning'), [], name);
    }
});

test('standard setup and constraint recipes parse with the imported library', () => {
    const library = analyze(fs.readFileSync(path.join(__dirname, '../../lib/standard.csp'), 'utf8'));
    for (const name of ['Standard arithmetic system', 'Standard arithmetic constraint', 'Standard all-different constraint']) {
        const source = 'import standard from (library); let Result := [3]; let A := [1]; let B := [2]; '
            + 'let X := [1]; let Y := [2]; let Z := [3]; ' + plain(snippets[name]);
        assert.deepEqual(analyze(source, () => library).diagnostics.filter(item => item.severity !== 'warning'), [], name);
    }
});

