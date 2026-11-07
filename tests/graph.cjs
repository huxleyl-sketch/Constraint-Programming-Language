const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({console, structuredClone});
for (const name of ['tokeniser','parser','predicateSolverExpr','constraintSystem','algorithms/dfs','algorithms/AC-3','algorithms/MAC','main','solutionSession','graphModel']) vm.runInContext(fs.readFileSync(`dist/src/${name}.js`,'utf8'),context);
vm.runInContext(`
function logToConsole() {}
const library = ${JSON.stringify(require('node:fs').readFileSync('lib/standard.csp','utf8'))};
const imports = {filename:'examples/graph.csp',read:()=>({id:'lib/standard.csp',code:library})};
const code = 'import standard from (../lib/standard.csp); def local extends standard := { check(A,B,C) <- allDiff(A,B,C). }; let A := [0,1,2]; let B := [0,1,2]; let C := [0,1,2]; local[check(A,B,C)];';
const system = new constraintSystem(MAC); parser(code,system,imports);
const model = new CspGraph(); model.load(code,system);
globalThis.result = {variables:model.variables.length, triangle:model.relations[0].triangle, inherited:model.catalog.some(p=>p.system==='local'&&p.name==='allDiff'&&p.arity===3)};
model.variables[0].domain='0';
const updated = new constraintSystem(MAC); parser(model.source(),updated,imports);
globalThis.answers = [...updated.solutions()].length;
const expression = new constraintSystem(Dfs); parser('def rel := { syntax[opp xfx same/2.]. same(X,X). }; let X := [a]; let Y := [a]; rel[X same Y];',expression);
const expressionGraph = new CspGraph(); expressionGraph.load('def rel := { syntax[opp xfx same/2.]. same(X,X). }; let X := [a]; let Y := [a]; rel[X same Y];',expression);
const roundtrip = new constraintSystem(Dfs); parser(expressionGraph.source(),roundtrip);
globalThis.expressionAnswers = [...roundtrip.solutions()].length;
`,context);
assert.equal(context.result.variables,3);
assert.equal(context.result.triangle,true);
assert.equal(context.result.inherited,true);
assert.equal(context.answers,2);
assert.equal(context.expressionAnswers,1);
console.log('Passed graph imports, inherited predicate arities, n-ary round-trip, edited domains, solving, and retained syntax constraints.');
context.exampleSource = fs.readFileSync('examples/syntax-example.csp','utf8');
vm.runInContext(`
    for (const algorithm of [Dfs,MAC]) {
        const exampleSystem = new constraintSystem(algorithm); parser(exampleSource,exampleSystem,imports);
        const exampleGraph = new CspGraph(); exampleGraph.load(exampleSource,exampleSystem);
        const relation = exampleGraph.relations.find(r=>r.predicate === 'calculate');
        if (!relation || relation.args.join(',') !== 'A,B,C,Result') throw new Error('Arithmetic expression missing graph variables');
        if (exampleGraph.relations.length !== 1 || exampleGraph.mismatch(relation)) throw new Error('Incorrect expression graph shape');
        if (!exampleGraph.check(relation,exampleSystem,interpreter('2,4,5,n(2,2)'))) throw new Error('Expression check should pass');
        if (exampleGraph.check(relation,exampleSystem,interpreter('2,4,5,n(2,3)'))) throw new Error('Expression check should fail');
        const saved = exampleGraph.source();
        if (!saved.includes('arithmetic[calculate(A,B,C,Result)];')) throw new Error('Expression source was not preserved');
        const replay = new constraintSystem(algorithm); parser(saved,replay,imports);
        if ([...replay.solutions()].length !== 2 || replay.constraints.length !== exampleSystem.constraints.length)
            throw new Error('Graph arithmetic round trip changed constraints or solutions');
    }
`,context,{timeout:10000});
console.log('Passed syntax-example arithmetic visualization, checks and source round trips with DFS and MAC.');
vm.runInContext(`
    const taggedSource = 'def base := {\\n % @hidden\\n helper(X,X).\\n helper(a,b).\\n helper(a).\\n % @hidden secret/1\\n secret(a).\\n visible(X,Y) <- helper(X,Y).\\n}; '
        + 'def child extends base := {}; let X := [a,b]; let Y := [a,b]; base[helper(X,Y)]; child[visible(X,Y)];';
    const taggedSystem = new constraintSystem(Dfs); parser(taggedSource,taggedSystem);
    const taggedGraph = new CspGraph(); taggedGraph.load(taggedSource,taggedSystem);
    if (taggedGraph.catalog.some(p=>p.name === 'helper' && p.arity === 2 || p.name === 'secret'))
        throw new Error('Hidden predicate leaked into graph catalog');
    if (!taggedGraph.catalog.some(p=>p.name === 'helper' && p.arity === 1))
        throw new Error('Hidden tag affected a different arity');
    if (taggedGraph.relations.length !== 1 || !taggedGraph.source().includes('base[helper(X,Y)]'))
        throw new Error('Hidden graph constraint was not preserved as source');
    const taggedRoundtrip = new constraintSystem(Dfs); parser(taggedGraph.source(),taggedRoundtrip);
    if ([...taggedRoundtrip.solutions()].length !== 3) throw new Error('Hidden predicates changed solving');
    const overrideVisibility = new constraintSystem(Dfs);
    parser(taggedSource + 'def override extends base := { helper(a,a). };',overrideVisibility);
    if (overrideVisibility.getPredicateSystem('override').isHiddenPredicate('helper',2))
        throw new Error('Untagged local override should be visible');
    const importedVisibility = new constraintSystem(Dfs);
    const importCode = 'import child from (library); let X := [a]; let Y := [a]; child[helper(X,Y)];';
    parser(importCode,importedVisibility,{filename:'main',read:()=>({id:'library',code:taggedSource})});
    const importedGraph = new CspGraph(); importedGraph.load(importCode,importedVisibility);
    if (importedGraph.catalog.some(p=>p.name === 'helper' && p.arity === 2))
        throw new Error('Imported hidden predicate leaked into graph');
`,context,{timeout:5000});
console.log('Passed hidden annotations, overload visibility, inheritance and hidden-constraint graph round trips.');
// Exercise actual browser controller wiring with a small DOM stand-in.
class Element {
    constructor(){this.listeners=new Map();this.children=[];this.value='';this.textContent='';this.attrs={};}
    addEventListener(name,fn){this.listeners.set(name,fn);}
    setAttribute(name,value){this.attrs[name]=value;}
    click(){this.clicks=(this.clicks??0)+1;}
    append(...items){this.children.push(...items);}
    appendChild(item){this.children.push(item);}
    replaceChildren(...items){this.children=items;}
    async fire(name,event={}){const handler=this.listeners.get(name)??this['on'+name];await handler?.(event);}
}
(async()=>{
    const elements=new Map();
    const documentListeners=new Map();
    const document={addEventListener(name,handler){documentListeners.set(name,handler);},getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement(tag){const e=new Element();e.tag=tag;return e;},createElementNS(ns,tag){const e=new Element();e.tag=tag;return e;}};
    document.getElementById('algorithm').value='mac';
    const canvas=document.getElementById('canvas');
    canvas.getScreenCTM=()=>({inverse:()=>({})});canvas.setPointerCapture=()=>{};
    class DOMPoint { constructor(x,y){this.x=x;this.y=y;} matrixTransform(){return this;} }
    const browser=vm.createContext({console,structuredClone,document,DOMPoint,Blob,URL:{createObjectURL:()=>"blob:graph-test",revokeObjectURL(){}},setTimeout:callback=>callback()});
    browser.window=browser;
    for(const name of ['tokeniser','parser','predicateSolverExpr','constraintSystem','algorithms/dfs','algorithms/AC-3','algorithms/MAC','main','solutionSession','prologConsole','graphModel','graphEditor'])vm.runInContext(fs.readFileSync(`dist/src/${name}.js`,'utf8'),browser);
    const labels=()=>canvas.children.filter(e=>e.tag==='text').map(e=>e.textContent);
    const constraintShapes=()=>canvas.children.filter(e=>e.tag==='path'||e.tag==='polygon');
    assert.match(document.getElementById('source').value,/allDifferent/);
    assert.ok(!labels().includes('0, 1, 2')); // domains belong only in the inspector
    assert.ok(labels().includes('B'));
    await document.getElementById('solve').fire('click');
    assert.match(document.getElementById('output').textContent,/Solution 1:/);
    function assertAssignmentLabels() {
        const last=document.getElementById('output').textContent.split(/Solution \d+:\n/).at(-1);
        for(const line of last.trim().split('\n')) {
            const match=/^(\w+) = (.+)$/.exec(line);
            if(match)assert.ok(labels().includes(`${match[1]}:${match[2]}`));
        }
    }
    assertAssignmentLabels();
    const solvedLabels=labels().join('|');
    await document.getElementById('mode-connect').fire('click');
    await document.getElementById('mode-select').fire('click');
    assert.equal(labels().join('|'),solvedLabels);
    assert.ok(constraintShapes().every(e=>e.attrs.class.includes('satisfied')));
    const firstLabels=labels().join('|');
    await document.getElementById('next').fire('click');
    assert.match(document.getElementById('output').textContent,/Solution 2:/);
    assertAssignmentLabels();assert.notEqual(labels().join('|'),firstLabels);
    const stoppedLabels=labels().join('|');
    await document.getElementById('stop').fire('click');
    assert.equal(labels().join('|'),stoppedLabels);
    await document.getElementById('add').fire('click');
    assert.match(document.getElementById('source').value,/let V1 := \[0, 1\]/);
    assert.equal(document.getElementById('output').textContent,'');
    assert.ok(labels().includes('B'));
    assert.ok(constraintShapes().every(e=>!e.attrs.class.includes('satisfied')));
    const node=async index=>{
        const circles=canvas.children.filter(e=>e.tag==='circle');
        await circles[index].fire('pointerdown',{clientX:130+160*index,clientY:100,pointerId:1,stopPropagation(){}});
        await canvas.fire('pointerup');
    };
    const paths=()=>canvas.children.filter(e=>e.tag==='path');
    const inspector=()=>document.getElementById('inspector');
    const selects=()=>inspector().children.filter(e=>e.tag==='select');
    const choose=async(index,value)=>{const control=selects()[index];control.value=value;await control.fire('change');};
    const clickLink=async()=>paths().at(-1).fire('click',{stopPropagation(){}});
    const removeArgument=async number=>{
        const control=inspector().children.find(e=>e.textContent===`Remove argument ${number}`);
        assert.ok(control);await control.fire('click');
    };
    assert.equal(document.getElementById('mode-select').attrs['aria-pressed'],'true');
    assert.equal(document.getElementById('constraint-tools').hidden,true);
    const selectedSource=document.getElementById('source').value;
    await node(0);await node(1);await node(1);
    assert.equal(document.getElementById('source').value,selectedSource);
    assert.equal(inspector().children.filter(e=>e.tag==='input')[0].value,'B');
    // Domain editing stays available without entering constraint mode.
    const domain=inspector().children.filter(e=>e.tag==='input')[1];
    domain.value='0, 1';await domain.fire('change');
    assert.match(document.getElementById('source').value,/let B := \[0, 1\];/);
    domain.value='0, 1, 2';await domain.fire('change');
    // Selecting a constraint and then a variable is also safe in Select mode.
    const beforeSelection=document.getElementById('source').value;
    await clickLink();
    assert.ok(!inspector().children.some(e=>e.textContent?.startsWith('Remove argument')));
    await node(2);
    assert.equal(document.getElementById('source').value,beforeSelection);
    await document.getElementById('mode-connect').fire('click');await node(0);
    await document.getElementById('mode-select').fire('click');
    await document.getElementById('mode-connect').fire('click');await node(1);
    assert.equal(document.getElementById('source').value,beforeSelection); // mode changes discard pending endpoints
    documentListeners.get('keydown')({key:'Escape'});
    assert.equal(document.getElementById('mode-select').attrs['aria-pressed'],'true');
    await node(0);
    assert.equal(document.getElementById('source').value,beforeSelection);
    await document.getElementById('mode-connect').fire('click');
    assert.equal(document.getElementById('constraint-tools').hidden,false);
    await node(0);await node(1);
    assert.match(document.getElementById('source').value,/% @graph-draft/);
    assert.equal(selects()[1].value,''); // empty constraint, no predicate auto-selected
    await choose(0,'graph');await choose(1,'equal/2');
    assert.match(document.getElementById('source').value,/graph\[equal\(A,B\)\];/);
    assert.ok(!paths().at(-1).attrs.class.includes('invalid'));
    await clickLink();await node(2);
    assert.ok(canvas.children.some(e=>e.tag==='polygon'&&e.attrs.class.includes('invalid')));
    assert.match(document.getElementById('source').value,/% @graph-draft/);
    await document.getElementById('solve').fire('click');
    assert.match(document.getElementById('status').textContent,/argument count/);
    await choose(1,'allDifferent/3');
    assert.match(document.getElementById('source').value,/graph\[allDifferent\(A,B,C\)\];/);
    assert.ok(canvas.children.some(e=>e.tag==='polygon'&&!e.attrs.class.includes('invalid')));
    await removeArgument(3);
    assert.ok(paths().at(-1).attrs.class.includes('invalid')); // triangle collapses to a red line
    await choose(1,'equal/2');
    await removeArgument(2);
    assert.match(paths().at(-1).attrs.d,/ C /); // unary loop, still mismatched binary predicate
    assert.ok(paths().at(-1).attrs.class.includes('invalid'));
    // Add a unary predicate via source, retaining the in-progress graph as metadata.
    document.getElementById('source').value=document.getElementById('source').value.replace('different(A,B) <-', 'unary(0). different(A,B) <-');
    await document.getElementById('source').fire('input');await document.getElementById('apply').fire('click');
    await clickLink();await choose(0,'graph');await choose(1,'unary/1');
    assert.match(document.getElementById('source').value,/graph\[unary\(A\)\];/);
    assert.ok(!paths().at(-1).attrs.class.includes('invalid'));
    // Dragging a variable does not count as selecting a connection endpoint.
    const variable=canvas.children.find(e=>e.tag==='circle');
    await variable.fire('pointerdown',{clientX:130,clientY:100,pointerId:1,stopPropagation(){}});
    await canvas.fire('pointermove',{clientX:180,clientY:150});await canvas.fire('pointerup');
    const before=paths().length;await node(0);
    assert.equal(paths().length,before);
    // Cancel the first endpoint, then double-click one variable for an empty unary loop.
    await canvas.fire('pointerdown',{target:canvas});await node(0);await node(0);
    assert.match(paths().at(-1).attrs.d,/ C /);
    await choose(0,'graph');await choose(1,'unary/1');
    assert.match(document.getElementById('source').value,/graph\[unary\(A\)\];/);
    // A repeated binary argument also renders as a loop, with two argument slots.
    await clickLink();await node(0);await choose(1,'equal/2');
    assert.match(document.getElementById('source').value,/graph\[equal\(A,A\)\];/);
    assert.match(paths().at(-1).attrs.d,/ C /);
    assert.ok(!paths().at(-1).attrs.class.includes('invalid'));
    // Verify loops, lines and triangles all use the assignment, including compound terms.
    document.getElementById('source').value='def test := { unary(n(1,2)). equal(X,X). triple(X,X,X). }; let A := [n(1,2)]; let B := [n(1,2)]; let C := [n(1,2)]; test[unary(A)]; test[equal(A,B)]; test[triple(A,B,C)]; test[equal(A,A)];';
    await document.getElementById('source').fire('input');
    await document.getElementById('solve').fire('click');
    assertAssignmentLabels();
    assert.ok(labels().includes('B:n(1, 2)')||labels().includes('B:n(1,2)'));
    assert.ok(constraintShapes().every(e=>e.attrs.class.includes('satisfied')));
    const finalLabels=labels().join('|');
    await document.getElementById('next').fire('click');
    assert.match(document.getElementById('output').textContent,/No more solutions/);
    assert.equal(labels().join('|'),finalLabels);
    // Feed a failing candidate through the adapter to check red rendering independently
    // of the real solvers, which only ever yield satisfying assignments.
    vm.runInContext('globalThis.graphTestMAC = MAC; MAC = function* (_, domains) { yield [...domains].map(([key, values]) => ({key, val: values[0]})); };',browser);
    document.getElementById('source').value='def test := { unary(1). }; let B := [4]; test[unary(B)];';
    await document.getElementById('source').fire('input');
    await document.getElementById('solve').fire('click');
    assert.ok(labels().includes('B:4'));
    assert.ok(constraintShapes().every(e=>e.attrs.class.includes('unsatisfied')));
    vm.runInContext('MAC = graphTestMAC;',browser);
    await document.getElementById('solve').fire('click');
    assert.match(document.getElementById('output').textContent,/No solutions/);
    assert.ok(labels().includes('B'));
    assert.ok(constraintShapes().every(e=>!e.attrs.class.includes('satisfied')));
    const permissionError=()=>Object.assign(new Error('Access blocked'),{name:'NotAllowedError'});
    const sourceBeforeCancel=document.getElementById('source').value;
    browser.showOpenFilePicker=async()=>{throw Object.assign(new Error('Cancelled'),{name:'AbortError'});};
    await document.getElementById('open').fire('click');
    assert.equal(document.getElementById('source').value,sourceBeforeCancel);
    const openedCode='def test := { unary(4). }; let B := [4]; test[unary(B)];';
    const workingHandle={name:'opened.csp',getFile:async()=>({name:'opened.csp',text:async()=>openedCode}),createWritable:async()=>{throw permissionError();}};
    browser.showOpenFilePicker=async()=>[workingHandle];
    await document.getElementById('open').fire('click');
    assert.equal(document.getElementById('source').value,openedCode);
    // getFile itself can fail even when the picker successfully returned a handle.
    browser.showOpenFilePicker=async()=>[{name:'blocked.csp',getFile:async()=>{throw permissionError();}}];
    await document.getElementById('open').fire('click');
    assert.equal(document.getElementById('file').hidden,false);
    assert.match(document.getElementById('status').textContent,/upload control/);
    assert.equal(document.getElementById('source').value,openedCode);
    await document.getElementById('open').fire('click');
    assert.equal(document.getElementById('file').clicks,1);
    // Existing write permissions can also be revoked; save must still download a copy.
    await document.getElementById('save').fire('click');
    assert.match(document.getElementById('status').textContent,/Downloaded/);
    const input=document.getElementById('file');
    input.files=[{name:'uploaded.csp',text:async()=>openedCode}];
    await input.fire('change');
    assert.equal(input.value,'');
    await document.getElementById('solve').fire('click');
    assert.ok(labels().includes('B:4'));
    browser.showSaveFilePicker=async()=>{throw new Error('Blocked direct API must not be retried');};
    await document.getElementById('save').fire('click');
    assert.match(document.getElementById('status').textContent,/Downloaded/);
    const expressionCode='def arithmetic := { syntax[opp 599 xfx =/2. opp yfx plus/2.]. =(X,X). plus(a,b,plus(a,b)). }; let A := [a]; let B := [b]; let Result := [plus(a,b)]; arithmetic[Result = A plus B];';
    document.getElementById('source').value=expressionCode;
    await document.getElementById('source').fire('input');
    await document.getElementById('apply').fire('click');
    assert.ok(labels().includes('arithmetic[Result = A plus B]'));
    await document.getElementById('solve').fire('click');
    assert.ok(constraintShapes().every(e=>e.attrs.class.includes('satisfied')));
    await document.getElementById('mode-connect').fire('click');
    await clickLink();
    assert.ok(inspector().children.some(e=>e.textContent?.includes('Edit the expression in the source')));
    assert.equal(selects().length,0);
    await node(0);
    assert.equal(document.getElementById('source').value,expressionCode);
    await document.getElementById('mode-select').fire('click');
    await node(0);
    const expressionVariableName=inspector().children.find(e=>e.tag==='input');
    expressionVariableName.value='InputA';await expressionVariableName.fire('change');
    assert.match(document.getElementById('source').value,/arithmetic\[Result = InputA plus B\];/);
    await document.getElementById('apply').fire('click');
    assert.ok(labels().includes('arithmetic[Result = InputA plus B]'));
    const relationEditor=document.getElementById('relation-editor');
    relationEditor.value='def custom extends arithmetic := { syntax[opp xfx reaches/2.]. reaches(A,B) <- plus(A,b,B). }; custom[InputA reaches Result];';
    await document.getElementById('apply-relations').fire('click');
    assert.match(document.getElementById('relation-status').textContent,/Relations applied/);
    assert.ok(labels().some(label=>label.startsWith('custom[InputA reaches Result]')));
    await document.getElementById('solve').fire('click');
    assert.match(document.getElementById('output').textContent,/Solution 1:/);
    const beforeInvalidRelation=document.getElementById('source').value;
    const beforeInvalidLabels=labels().join('|');
    relationEditor.value='def custom extends missing := {};';
    await document.getElementById('apply-relations').fire('click');
    assert.match(document.getElementById('relation-status').textContent,/Unknown parent/);
    assert.equal(document.getElementById('source').value,beforeInvalidRelation);
    assert.equal(labels().join('|'),beforeInvalidLabels);
    assert.equal(relationEditor.value,'def custom extends missing := {};');
    relationEditor.value='def custom extends arithmetic := { syntax[opp xfx reaches/2.]. reaches(a,plus(a,b)). }; custom[InputA reaches Result];';
    await document.getElementById('apply-relations').fire('click');
    assert.equal((document.getElementById('source').value.match(/def custom\b/g)||[]).length,1);
    assert.equal((document.getElementById('source').value.match(/custom\[InputA reaches Result\]/g)||[]).length,1);
    assert.doesNotMatch(document.getElementById('source').value,/reaches\(A,B\) <-/);
    const systemEditor=document.getElementById('relation-system');
    systemEditor.value='custom';await systemEditor.fire('change');
    assert.match(relationEditor.value,/reaches\(a,plus\(a,b\)\)/);
    systemEditor.value='';await systemEditor.fire('change');
    assert.match(relationEditor.value,/def custom :=/);
    document.getElementById('source').value='broken input';
    await document.getElementById('source').fire('input');
    await document.getElementById('apply').fire('click');
    assert.match(document.getElementById('status').textContent,/Error/);
    await document.getElementById('add').fire('click');
    assert.equal(document.getElementById('source').value,'broken input');
    console.log('Passed graph browser solving, selection/editing and constraint modes, safe domain editing, Escape and mode-switch cancellation, click-to-connect, empty constraints, unary/repeated loops, arity validation, triangle expansion/collapse, draft recovery, drag isolation, invalid-source protection, blocked file handles, upload fallback, cancelled pickers, and revoked write permissions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
