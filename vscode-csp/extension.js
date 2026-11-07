'use strict';
const vscode = require('vscode');
const { analyze } = require('./analysis');
const fs = require('node:fs');
const path = require('node:path');
const language = 'constraint-programming-language';

function activate(context) {
    const diagnostics = vscode.languages.createDiagnosticCollection('csp');
    const cache = new Map();
    const range = (document, item) => new vscode.Range(document.positionAt(item.start), document.positionAt(item.end));
    function dependencyVersion(filename) {
        const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filename);
        if (open) return `open:${open.version}`;
        try { const stat = fs.statSync(filename); return `${stat.mtimeMs}:${stat.size}`; }
        catch { return 'missing'; }
    }
    function model(document) {
        const key = document.uri.toString();
        let entry = cache.get(key);
        if (!entry || entry.version !== document.version ||
            [...entry.dependencies].some(([file,version]) => dependencyVersion(file) !== version)) {
            const dependencies = new Map();
            const visiting = new Set();
            function readModel(text,filename) {
                return analyze(text,specifier => {
                    if (!filename) return undefined;
                    const target = path.resolve(path.dirname(filename),specifier);
                    dependencies.set(target,dependencyVersion(target));
                    if (visiting.has(target)) return undefined;
                    visiting.add(target);
                    try {
                        const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === target);
                        return readModel(open ? open.getText() : fs.readFileSync(target,'utf8'),target);
                    } finally { visiting.delete(target); }
                },filename);
            }
            entry = { version: document.version, result: readModel(document.getText(),document.uri.fsPath), dependencies };
            cache.set(key, entry);
        }
        return entry.result;
    }
    function update(document) {
        if (document.languageId !== language) return;
        diagnostics.set(document.uri, model(document).diagnostics.map(item => {
            const diagnostic = new vscode.Diagnostic(range(document, item), item.message,
                item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
            diagnostic.source = 'CSP';
            return diagnostic;
        }));
    }
    function at(document, position) {
        const result = model(document);
        const offset = document.offsetAt(position);
        const reference = result.references.find(item => item.start <= offset && offset < item.end);
        if (reference?.hidden && reference.target) return { ...reference.target,hidden:true };
        const target = reference?.target || result.symbols.find(item => item.start <= offset && offset < item.end);
        if (target?.kind === 'predicate' && (!target.filename || target.filename === document.uri.fsPath)) {
            return result.symbols.find(item => item.kind === 'predicate' && item.system === target.system &&
                item.name === target.name && item.arity === target.arity) || target;
        }
        return target;
    }
    const signature = item => item.kind === 'predicate' ? `${item.name}/${item.arity}` : item.name;
    context.subscriptions.push(diagnostics,
        vscode.workspace.onDidOpenTextDocument(update),
        vscode.workspace.onDidChangeTextDocument(() => {
            cache.clear();
            vscode.workspace.textDocuments.forEach(update);
        }),
        vscode.workspace.onDidCloseTextDocument(document => {
            cache.delete(document.uri.toString());
            diagnostics.delete(document.uri);
        }),
        vscode.languages.registerDefinitionProvider(language, {
            provideDefinition(document, position) {
                const target = at(document, position);
                if (target?.filename && target.filename !== document.uri.fsPath) {
                    const uri = vscode.Uri.file(target.filename);
                    return vscode.workspace.openTextDocument(uri).then(source => new vscode.Location(uri, range(source, target)));
                }
                if (target) return new vscode.Location(document.uri, range(document, target));
            }
        }),
        vscode.languages.registerHoverProvider(language, {
            provideHover(document, position) {
                const target = at(document, position);
                if (!target || target.hidden) return;
                const text = new vscode.MarkdownString();
                text.appendCodeblock(target.definition || signature(target), language);
                if (target.documentation) text.appendText('\n\n' + target.documentation + '\n\n');
                text.appendText(target.kind === 'predicate' ? `Predicate in system ${target.system.name}.` :
                    target.kind === 'system' ? `Predicate system with ${target.predicates.length} clause(s).` :
                    target.count !== undefined ? `Variable family ${target.name}0 through ${target.name}${target.count}.` : target.kind);
                return new vscode.Hover(text);
            }
        }),
        vscode.languages.registerDocumentSymbolProvider(language, {
            provideDocumentSymbols(document) {
                const result = model(document);
                const make = item => new vscode.DocumentSymbol(signature(item), item.kind,
                    item.kind === 'system' ? vscode.SymbolKind.Namespace : item.kind === 'predicate' ? vscode.SymbolKind.Function : vscode.SymbolKind.Variable,
                    range(document, item), range(document, item));
                return result.symbols.filter(item => item.kind !== 'predicate').map(item => {
                    const output = make(item);
                    if (item.kind === 'system') {
                        output.range = new vscode.Range(document.positionAt(item.start), document.positionAt(item.bodyEnd ?? item.end));
                        output.children = item.predicates.filter(pred => !pred.hidden).map(make);
                    }
                    return output;
                });
            }
        }),
        vscode.languages.registerCompletionItemProvider(language, {
            provideCompletionItems(document, position) {
                const result = model(document);
                const offset = document.offsetAt(position);
                // Comments are omitted by the lexer, so inspect the current line too.
                if (document.lineAt(position.line).text.slice(0, position.character).includes('%')) return [];
                const word = document.getWordRangeAtPosition(position);
                const prefixEnd = word ? document.offsetAt(word.start) : offset;
                const before = document.getText().slice(0, prefixEnd).replace(/%[^\r\n]*/g, '');
                const query = /([a-z0-9]\w*)\s*(?:\[|:)[^\];.]*$/.exec(before);
                const system = (query && result.systems.find(item => item.name === query[1])) ||
                    result.systems.find(item => item.bodyStart <= offset && offset <= (item.bodyEnd ?? document.getText().length));
                const items = [];
                const add = (label, kind, detail, insertText) => {
                    const item = new vscode.CompletionItem(label, kind);
                    item.detail = detail;
                    if (insertText) item.insertText = insertText;
                    items.push(item);
                };
                if (system) {
                    const seen = new Set();
                    for (const pred of system.signatures || system.predicates) {
                        if (pred.hidden) continue;
                        const key = `${pred.name}/${pred.arity}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        const suffix = document.getText().slice(word ? document.offsetAt(word.end) : offset);
                        const insertion = /^\s*\(/.test(suffix) ? pred.name :
                            new vscode.SnippetString(`${pred.name}(${Array.from({ length: pred.arity }, (_, i) => '${' + (i + 1) + ':X' + (i + 1) + '}').join(',')})`);
                        add(pred.name, vscode.CompletionItemKind.Function, `${key} in ${system.name}`, insertion);
                    }
                    const local = result.references.find(ref => ref.kind === 'local' && ref.context.start <= offset && offset <= (ref.context.end ?? offset));
                    if (local) for (const variable of new Set(result.references.filter(ref => ref.kind === 'local' && ref.context === local.context).map(ref => ref.value))) {
                        add(variable, vscode.CompletionItemKind.Variable, 'Clause variable');
                    }
                } else {
                    for (const item of result.systems) add(item.name, vscode.CompletionItemKind.Module, 'Predicate system');
                }
                if (!system || (query && !result.systems.some(item => item.bodyStart <= offset && offset <= (item.bodyEnd ?? document.getText().length)))) for (const variable of result.globals.keys()) add(variable, vscode.CompletionItemKind.Variable, 'Declared query variable');
                return items;
            }
        }, '[', ':', '~', ',')
    );
    vscode.workspace.textDocuments.forEach(update);
}
module.exports = { activate };
