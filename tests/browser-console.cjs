const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
    constructor() { this.listeners = new Map(); this.children = []; this.value = ""; this.textContent = ""; this.style = {}; }
    addEventListener(event, handler) { this.listeners.set(event, handler); }
    appendChild(child) { this.children.push(child); }
    fire(event, value = {}) { this.listeners.get(event)?.(value); }
}
const elements = new Map();
const document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    },
    createElement: () => new Element()
};
const context = vm.createContext({ console, structuredClone, document,
    FileReader: class {
        readAsText(file) { this.onload({ target: { result: file.content } }); }
    }
});
for (const file of ["src/tokeniser", "src/parser", "src/predicateSolverExpr", "src/constraintSystem", "src/algorithms/dfs", "src/algorithms/AC-3", "src/algorithms/MAC", "src/main", "src/solutionSession", "src/content"]) {
    vm.runInContext(fs.readFileSync(`dist/${file}.js`, "utf8"), context);
}
const last = () => document.getElementById("console-output").children.at(-1).textContent;
const click = command => document.getElementById(`${command}-button`).fire("click");
const command = text => {
    const input = document.getElementById("console-input");
    input.value = text;
    input.fire("keydown", { key: "Enter" });
    assert.equal(input.value, "");
};
assert.equal(document.getElementById("fileInput").disabled, true);
click("solve");
assert.match(last(), /Choose a solving algorithm first/);
document.getElementById("algorithm").value = "mac";
document.getElementById("algorithm").fire("change");
assert.equal(document.getElementById("fileInput").disabled, false);
click("solve");
assert.match(last(), /Load a .csp file first/);
document.getElementById("fileInput").fire("change", { target: { files: [{
    name: "two.csp", content: "let X := [a,b];\r\n"
}] } });
assert.ok(!document.getElementById("console-output").children.some(child => child.textContent.includes("X =>")));
click("solve");
assert.match(last(), /Solution 1:\nX = a/);
click("next");
assert.match(last(), /Solution 2:\nX = b/);
click("next");
assert.match(last(), /No more solutions/);
command("solve");
command("stop");
command("next");
assert.match(last(), /No active search/);
command("solve");
command("let Y := [a];");
command("next");
assert.match(last(), /No active search/);
command("solve");
document.getElementById("output").fire("input");
command("next");
assert.match(last(), /No active search/);
command("reload");
command("solve");
assert.match(last(), /Solution 1:/);
console.log("Passed browser button/command navigation, exhaustion, stop, edits, file loading, and reload checks.");

(async () => {
    await document.getElementById('dependencyInput').listeners.get('change')({ target: { files: [
        { name: 'library.csp', webkitRelativePath: 'project/sub/library.csp', text: async () => 'def test := { value(b). };' },
        { name: 'main.csp', webkitRelativePath: 'project/main.csp', text: async () => '' }
    ] } });
    document.getElementById('fileInput').fire('change', { target: { files: [{
        name: 'main.csp', content: 'import test from (./sub/library.csp); let X := [a,b]; test[value(X)];'
    }] } });
    command('solve');
    assert.match(last(), /X = b/);
    command('reload');
    command('solve');
    assert.match(last(), /X = b/);
    console.log('Passed browser folder imports and reload with relative paths.');
    // The actual syntax example must not solve an empty problem after a missing import.
    const source = fs.readFileSync('examples/syntax-example.csp', 'utf8');
    document.getElementById('fileInput').fire('change', { target: { files: [{
        name: 'syntax-example.csp', content: source
    }] } });
    assert.match(last(), /Select the folder containing/);
    command('solve');
    assert.match(last(), /File failed to load/);
    assert.doesNotMatch(last(), /Solution 1:/);
    await document.getElementById('dependencyInput').listeners.get('change')({ target: { files: [
        { name: 'syntax-example.csp', webkitRelativePath: 'project/examples/syntax-example.csp', text: async () => source },
        { name: 'standard.csp', webkitRelativePath: 'project/lib/standard.csp', text: async () => fs.readFileSync('lib/standard.csp', 'utf8') }
    ] } });
    for (const solver of ['dfs', 'mac']) {
        document.getElementById('algorithm').value = solver;
        document.getElementById('algorithm').fire('change');
        command('reload');
        command('solve');
        assert.match(last(), /Solution 1:/);
        assert.match(last(), /A = 2/);
        assert.match(last(), /B = 4/);
        assert.match(last(), /C = 5/);
        assert.match(last(), /Result = n\(2,\s*2\)/);
        command('next');
        assert.match(last(), /Solution 2:/);
        assert.match(last(), /A = 3/);
        assert.match(last(), /Result = n\(2,\s*3\)/);
        // A failed reload or algorithm switch must also block solving.
        document.getElementById('output').textContent = 'import missing from (missing.csp);';
        command('reload');
        command('solve');
        assert.match(last(), /File failed to load/);
        document.getElementById('algorithm').fire('change');
        command('solve');
        assert.match(last(), /File failed to load/);
        document.getElementById('output').textContent = source;
    }
    console.log('Passed syntax example assignments and failed-load recovery for browser DFS/MAC.');

})().catch(error => { console.error(error); process.exitCode = 1; });
