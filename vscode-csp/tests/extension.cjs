const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { analyze } = require('../analysis');

test('providers activate, publish diagnostics, resolve definitions, and complete queries', async () => {
    const providers = {};
    const subscriptions = [];
    let published;
    const disposable = { dispose() {} };
    class Position { constructor(line, character) { Object.assign(this, { line, character }); } }
    class Range { constructor(start, end) { Object.assign(this, { start, end }); } }
    class Item { constructor(label, kind) { Object.assign(this, { label, kind }); } }
    const text = 'let X := [a]; def s := { p(a). }; s[p(X)];';
    const document = {
        uri: { toString: () => 'file:///test.csp' }, version: 1,
        languageId: 'constraint-programming-language',
        getText: () => text, lineAt: () => ({ text }),
        offsetAt: position => position.character, positionAt: offset => new Position(0, offset),
        getWordRangeAtPosition: () => undefined
    };
    const vscode = {
        Range,
        Uri: { file: fsPath => ({ fsPath }) },
        Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
        DiagnosticSeverity: { Error: 0, Warning: 1 },
        Location: class { constructor(uri, range) { Object.assign(this, { uri, range }); } },
        MarkdownString: class { constructor() { this.value = ''; } appendCodeblock(value) { this.value += value; } appendText(value) { this.value += value; } },
        Hover: class { constructor(contents) { this.contents = contents; } },
        DocumentSymbol: class { constructor(name, detail, kind, range) { Object.assign(this, { name, range }); } },
        SymbolKind: {}, CompletionItemKind: {}, CompletionItem: Item,
        SnippetString: class { constructor(value) { this.value = value; } },
        workspace: {
            textDocuments: [document],
            onDidOpenTextDocument: () => disposable,
            onDidChangeTextDocument: callback => { providers.change = callback; return disposable; },
            onDidCloseTextDocument: () => disposable
        },
        languages: {
            createDiagnosticCollection: () => ({ ...disposable, set: (uri, items) => { published = items; } }),
            ...Object.fromEntries(['Definition', 'Hover', 'DocumentSymbol', 'CompletionItem'].map(name => [
                `register${name}Provider`, (language, provider) => { providers[name] = provider; return disposable; }
            ]))
        }
    };
    const sandbox = { module: { exports: {} }, require: name => name === 'vscode' ? vscode : name === './analysis' ? { analyze } : require(name) };
    vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../extension.js'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ subscriptions });
    assert.equal(published.length, 0);
    const queryOffset = text.lastIndexOf('p(');
    const definition = providers.Definition.provideDefinition(document, new Position(0, queryOffset));
    assert.equal(definition.range.start.character, text.indexOf('p('));
    const completion = providers.CompletionItem.provideCompletionItems(document, new Position(0, queryOffset));
    assert.ok(completion.some(item => item.label === 'p'));
    assert.ok(completion.some(item => item.label === 'X'));
    assert.equal(providers.DocumentSymbol.provideDocumentSymbols(document).length, 2);
    assert.ok(providers.Hover.provideHover(document, new Position(0, queryOffset)));
    assert.ok(subscriptions.length >= 8);

    const path = require('node:path');
    document.uri.fsPath = path.resolve(__dirname,'../../tests/fixtures/syntax-import.csp');
    document.getText = () => fs.readFileSync(document.uri.fsPath,'utf8');
    document.version++;
    providers.change({ document });
    assert.equal(published.length,0,'nested imports supply syntax to the editor');
    const libraryPath = path.resolve(__dirname,'../../lib/standard.csp');
    const librarySource = fs.readFileSync(libraryPath,'utf8');
    const libraryDocument = { ...document, version:1,
        uri: { fsPath:libraryPath, toString:()=>libraryPath },
        getText:()=>librarySource.replace('opp yfx add/3.','') };
    vscode.workspace.textDocuments.unshift(libraryDocument);
    providers.change({ document:libraryDocument });
    assert.ok(published.some(item=>item.severity === 0),'unsaved removal of exported syntax updates the importer');
    libraryDocument.version++;
    libraryDocument.getText = () => librarySource;
    providers.change({ document:libraryDocument });
    assert.equal(published.length,0);

    document.getText = () => 'def docs := {\n % Unify both inputs.\n same(X,X).\n % Later comment.\n same(a,b).\n use(A,B) <- same(A,B).\n};';
    document.version++;
    providers.change({ document });
    const hover = providers.Hover.provideHover(document, new Position(0, document.getText().lastIndexOf('same(')));
    assert.match(hover.contents.value, /same\(X,X\)\./);
    assert.match(hover.contents.value, /Unify both inputs/);
    assert.doesNotMatch(hover.contents.value, /Later comment/);

    document.getText = () => 'import standard from (../../lib/standard.csp); def arithmetic extends standard := { total(A,B,N) <- N = A add B. };';
    document.version++;
    providers.change({ document });
    const importedHover = providers.Hover.provideHover(document, new Position(0, document.getText().lastIndexOf('add')));
    assert.match(importedHover.contents.value, /add\(A,B,N\) <- fastAdd\(A,B,N\)\./);
    assert.match(importedHover.contents.value, /Arithmetic aliases and comparisons require ground decimal operands/);
    vscode.workspace.openTextDocument = async uri => {
        assert.equal(uri.fsPath, libraryPath);
        return libraryDocument;
    };
    const importedDefinition = await providers.Definition.provideDefinition(document, new Position(0, document.getText().lastIndexOf('add')));
    assert.equal(importedDefinition.uri.fsPath, libraryPath);
    assert.equal(importedDefinition.range.start.character, librarySource.indexOf('add(A,B,N) <- fastAdd'));

});
