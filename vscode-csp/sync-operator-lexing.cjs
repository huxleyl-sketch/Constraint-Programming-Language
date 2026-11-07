const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname,'../src/tokeniser.ts'),'utf8');
const shared = source.split('// BEGIN SHARED OPERATOR LEXING')[1].split('// END SHARED OPERATOR LEXING')[0];
const output = '// Generated from src/tokeniser.ts.\n' + ts.transpileModule(shared,{ compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText + '\nmodule.exports = { joinedTokenizations };\n';
const target = path.join(__dirname,'operator-lexing.js');
if (process.argv.includes('--check')) {
    if (fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n') !== output) throw new Error('Stale operator lexer; run node vscode-csp/sync-operator-lexing.cjs');
} else fs.writeFileSync(target,output);
