// Extract only active token definitions; commented-out proposals are excluded.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const source = fs.readFileSync(path.join(root, '../src/tokeniser.ts'), 'utf8');
const block = source.slice(source.indexOf('const Tokens = ['), source.indexOf('] as const'));
const definitions = block.split(/\r?\n/).filter(line => /^\s*\{/.test(line)).map(line => {
    const match = line.match(/kind:\s*"([^"]+)",\s*regex:\s*\/(.*)\/y,\s*type:\s*"([^"]+)",\s*pre:\s*(\d+)/);
    if (!match) throw new Error(`Cannot extract token definition: ${line.trim()}`);
    return { kind: match[1], source: match[2], type: match[3], precedence: Number(match[4]) };
});
if (!definitions.length) throw new Error('No active token definitions found.');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const grammarPath = path.join(root, 'syntaxes/csp.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
grammar.patterns.find(p => p.name === 'keyword.declaration.csp').match =
    '\\b(?:' + definitions.filter(t => ['VARIABLE', 'DEFINE', 'IMPORT', 'FROM'].includes(t.kind)).map(t => escape(t.source.replace(/\\b$/, ''))).join('|') + ')\\b';
grammar.patterns.find(p => p.name === 'keyword.operator.csp').match =
    definitions.filter(t => ['DEF', 'MANY', 'CON', 'QUALIFIED', 'IMPLIES', 'NOT', 'OPERATOR'].includes(t.kind)).map(t => t.source).join('|');
const outputs = [
    [path.join(root, 'tokens.json'), JSON.stringify(definitions, null, 2) + '\n'],
    [grammarPath, JSON.stringify(grammar, null, 2) + '\n']
];
for (const [file, content] of outputs) {
    if (process.argv.includes('--check')) {
        if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content) throw new Error(`Stale tokens: run node vscode-csp/sync-tokens.cjs (${file})`);
    } else fs.writeFileSync(file, content);
}
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Synchronized'} ${definitions.length} active token definitions.`);
