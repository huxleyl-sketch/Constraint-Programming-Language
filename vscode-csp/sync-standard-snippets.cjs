const fs = require('node:fs');
const path = require('node:path');
const { analyze } = require('./analysis');
const source = fs.readFileSync(path.join(__dirname, '../lib/standard.csp'), 'utf8');
const standard = analyze(source).systems.find(system => system.name === 'standard');
// Public library surface only: arithmetic implementation helpers stay out of snippets.
const publicNames = new Set(['equal', '=', 'different', 'member', 'notMember', 'append', 'reverse',
    'allDiff', 'fastAdd', 'fastMult', 'fastSub', 'add', 'mult', 'subtract', 'successor',
    'less', 'lessEqual', 'greater', 'greaterEqual', 'numberEqual', 'minimum', 'maximum',
    'sum', 'product', 'length']);
const snippets = {};
const placeholder = (index, name) => '${' + index + ':' + name + '}';
for (const pred of standard.signatures) {
    if (pred.hidden || (!publicNames.has(pred.name) && !standard.syntax.has(pred.name))) continue;
    const key = `Standard ${pred.name}/${pred.arity}`;
    if (snippets[key]) continue;
    const args = pred.name === '=' ? ['Result', 'Expression'] : pred.name === 'allDiff' && pred.arity === 1 ? ['List'] :
        ['member', 'notMember'].includes(pred.name) ? ['Value', 'List'] :
        ['reverse', 'length', 'sum', 'product'].includes(pred.name) ? ['List', 'Result'] :
        Array.from({ length: pred.arity }, (_, i) => i === 2 && pred.name !== 'allDiff' ? 'Result' : String.fromCharCode(65 + i));
    snippets[key] = {
        prefix: `std-${pred.name === '=' ? 'evaluate' : pred.name}${pred.name === 'allDiff' ? '-' + pred.arity : ''}`,
        body: `${pred.name.startsWith('=') ? 'standard : ' : 'standard:'}${pred.name}(${args.map((arg, i) => placeholder(i + 1, arg)).join(',')})`,
        description: `Standard library ${pred.name}/${pred.arity}. Import standard first; inserts a qualified predicate call.`
    };
}
for (const name of publicNames) {
    if (standard.signatures.some(pred => pred.name === name && !pred.hidden) &&
        !Object.keys(snippets).some(key => key.startsWith(`Standard ${name}/`))) throw new Error(`Missing public predicate: ${name}`);
}
const operations = standard.signatures.filter(pred => ['+','*','-'].includes(pred.name) && pred.arity === 3 && !pred.hidden).map(pred => pred.name);
const operation = operations[0];
snippets['Import standard library'] = {
    prefix: 'std-import', body: 'import standard from (' + placeholder(1, '../lib/standard.csp') + ');',
    description: 'Import standard predicates and syntax. Adjust the path relative to this CSP file (default: examples/).'
};
snippets['Standard arithmetic system'] = {
    prefix: 'std-system', body: ['def ${1:arithmetic} extends standard := {', `\t\${2:total}(A,B,N) <- ${operation}(A,B,N).`, '\t$0', '};'],
    description: 'Define a child of standard with explicit arithmetic calls. Import standard first.'
};
snippets['Standard arithmetic constraint'] = {
    prefix: 'std-calculate', body: 'standard[${1|' + operations.join(',') + '|}(${2:A},${3:B},${4:Result})];',
    description: 'Arithmetic CSP constraint on declared variables with decimal domains. Import standard first.'
};
snippets['Standard all-different constraint'] = {
    prefix: 'std-allDiff-constraint', body: 'standard[allDiff(${1:X},${2:Y},${3:Z})];',
    description: 'Require three declared CSP variables to differ. Import standard first.'
};
snippets['Standard list term'] = {
    prefix: 'std-list', body: '[${1:A} | ${2:B} | ${3:C} | []]',
    description: 'Three-element finite list using inherited standard list syntax.'
};
snippets['Standard decimal term'] = {
    prefix: 'std-decimal', body: '${1:1} ${2:2} ${3:3}',
    description: 'Three-digit nonnegative decimal (default: 123).'
};
if (!operation) {
    delete snippets['Standard arithmetic system'];
    delete snippets['Standard arithmetic constraint'];
}
const target = path.join(__dirname, 'snippets/standard.json');
const output = JSON.stringify(snippets, null, 2) + '\n';
if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
        throw new Error('Standard library snippets are stale. Run node vscode-csp/sync-standard-snippets.cjs.');
    }
} else fs.writeFileSync(target, output);
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${Object.keys(snippets).length} standard library snippets.`);
