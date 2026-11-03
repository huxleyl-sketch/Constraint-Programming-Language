const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console, structuredClone, logToConsole() {} });
for (const file of ['src/tokeniser', 'src/parser', 'src/predicateSolverExpr', 'src/constraintSystem',
    'src/algorithms/dfs', 'src/algorithms/AC-3', 'src/algorithms/MAC', 'src/main']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'dist', file + '.js'), 'utf8'), context);
}
context.source = fs.readFileSync(path.join(root, 'lib/standard.csp'), 'utf8');
vm.runInContext('var system = new constraintSystem(Dfs); parser(source, system);', context);
const decimal = value => {
    const digits = String(value);
    return digits.length === 1 ? digits : `n(${digits[0]},${decimal(digits.slice(1))})`;
};
let checked = 0;
for (const [a, b] of [
    ...Array.from({ length: 100 }, (_, i) => [Math.floor(i / 10), i % 10]),
    [19, 1], [99, 1], [99, 99], [123, 456], [999, 999], [1000, 0], [0, 1000],
    [1005, 90], [12345, 6789]
]) {
    for (const [predicate, expected] of [['fastAdd', a + b], ['fastMult', a * b]]) {
        context.queryName = predicate;
        context.args = `${decimal(a)},${decimal(b)},N`;
        const answers = vm.runInContext(`(() => {
            const answers = [];
            for (const answer of system.queryPredicate('standard', queryName, interpreter(args))) {
                if (answer) answers.push(printExpr(answer[2]));
                if (answers.length > 1) break;
            }
            return answers;
        })()`, context, { timeout: 5000 });
        assert.deepEqual(Array.from(answers), [decimal(expected)], `${predicate}(${a},${b})`);
        checked++;
    }
}
console.log(`Passed ${checked} decimal arithmetic checks, including answer exhaustion.`);

function answers(name, args) {
    context.queryName = name;
    context.args = args;
    return Array.from(vm.runInContext(`(() => {
        const out = [];
        for (const a of system.queryPredicate('standard',queryName,interpreter(args))) {
            if (a) out.push(printExpr(a));
            if (out.length > 20) throw new Error('Unexpected repeated answers');
        }
        return out;
    })()`, context, { timeout: 5000 }));
}
for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
    assert.equal(answers('fastSub', `${a},${b},N`).length, a >= b ? 1 : 0);
    if (a >= b) assert.equal(answers('fastSub', `${a},${b},N`)[0], `${a},${b},${a-b}`);
    for (const [name, expected] of [['less',a<b],['lessEqual',a<=b],
        ['greater',a>b],['greaterEqual',a>=b],['numberEqual',a===b]]) {
        assert.equal(answers(name, `${a},${b}`).length, Number(expected), `${name}(${a},${b})`);
    }
}
for (const [a,b] of [[1000,1],[1000,999],[12345,6789],[99,100],[100,100]]) {
    assert.deepEqual(answers('fastSub',`${decimal(a)},${decimal(b)},N`),
        a >= b ? [`${decimal(a)},${decimal(b)},${decimal(a-b)}`] : []);
}
for (const [name,args,result] of [
    ['reverse','cons(a,cons(b,nil)),R','cons(a,cons(b,nil)),cons(b,cons(a,nil))'],
    ['append','cons(a,nil),cons(b,nil),R','cons(a,nil),cons(b,nil),cons(a,cons(b,nil))'],
    ['sum','cons(9,cons(2,nil)),N','cons(9,cons(2,nil)),n(1,1)'],
    ['product','cons(3,cons(4,nil)),N','cons(3,cons(4,nil)),n(1,2)'],
    ['length','cons(a,cons(b,nil)),N','cons(a,cons(b,nil)),2'],
    ['minimum','2,2,N','2,2,2'],['maximum','1,9,N','1,9,9'],
    ['successor','9,N','9,n(1,0)'], ['fastAdd','n(0,1),0,N','n(0,1),0,1']
]) assert.deepEqual(answers(name,args),[result]);
for (const [args, succeeds] of [['nil',true],['cons(a,cons(b,nil))',true],
    ['cons(a,cons(a,nil))',false],['a,b,c',true],['a,b,a',false],
    ['a,b,c,d',true],['a,b,c,a',false],['a,a',false]]) {
    assert.equal(answers('allDiff',args).length,Number(succeeds),args);
}
assert.equal(answers('different','f(a),f(a)').length,0);
assert.equal(answers('different','f(a),f(b)').length,1);
vm.runInContext(`for (const solver of [Dfs,MAC]) {
    const problem = new constraintSystem(solver);
    parser(source + 'let X := [a,b,c]; let Y := [a,b,c]; let Z := [a,b,c]; standard[allDiff(X,Y,Z)];',problem);
    const assignment = problem.returnAssignment();
    if (!assignment.includes('X => a') || !assignment.includes('Y => b') || !assignment.includes('Z => c'))
        throw new Error('allDiff constraint failed: ' + assignment);
}`,context,{timeout:5000});
console.log('Passed subtraction, comparisons, list relationships and DFS/MAC allDiff constraints.');
