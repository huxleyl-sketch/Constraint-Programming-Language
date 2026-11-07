'use strict';
const tokenDefinitions = require('./tokens.json');
const { joinedTokenizations } = require('./operator-lexing');
// Keep keyword boundaries for editor usability while retaining runtime token order.
const tokenPatterns = tokenDefinitions.map(token => ({
    ...token,
    regex: new RegExp(token.source + (['VARIABLE', 'DEFINE'].includes(token.kind) ? '\\b' : ''), 'y')
}));

// Editor-only parser: offsets refer to the original document, including comments.
function analyze(text, readImport, filename) {
    const tokens = [];
    const diagnostics = [];
    const symbols = [];
    const references = [];
    const systems = [];
    const globals = new Map();
    const issue = (token, message, severity = 'error') => diagnostics.push({ start: token.start, end: token.end, message, severity });
    const trivia = /\s+|%[^\r\n]*/y;
    for (let offset = 0; offset < text.length;) {
        trivia.lastIndex = offset;
        const skipped = trivia.exec(text);
        if (skipped) { offset += skipped[0].length; continue; }
        let matched;
        for (const definition of tokenPatterns) {
            if (definition.kind === 'IMPORT_PATH' && tokens.at(-1)?.kind !== 'FROM') continue;
            definition.regex.lastIndex = offset;
            const match = definition.regex.exec(text);
            if (match) { matched = { value: match[0], kind: definition.kind, start: offset, end: offset + match[0].length }; break; }
        }
        if (!matched) {
            matched = { value: text[offset], kind: 'INVALID', start: offset, end: offset + 1 };
            issue(matched, `Unexpected character '${matched.value}'.`);
        }
        tokens.push(matched);
        offset = matched.end;
    }
    const eof = { value: '', start: text.length, end: text.length };
    // Match runtime file-wide visibility while retaining original source offsets.
    const operators = new Map();
    const systemOperators = new Map();
    const importedOperators = new Map();
    const importedSignatures = new Map();
    const systemParents = new Map();
    const ranges = [];
    for (let n = 0; n < tokens.length; n++) {
        const inherited = tokens[n + 2]?.value === 'extends';
        const open = n + (inherited ? 5 : 3);
        if (tokens[n].value === 'def' && tokens[open]?.value === '{') {
            let end = open + 1, depth = 1;
            for (; end < tokens.length; end++) {
                if (tokens[end].value === '{') depth++;
                if (tokens[end].value === '}' && --depth === 0) break;
            }
            ranges.push({ name: tokens[n + 1].value, start:open, end });
            systemOperators.set(tokens[n + 1].value,new Map());
            if (inherited) systemParents.set(tokens[n + 1].value,tokens[n + 3]);
        }
        if (tokens[n].value === 'import' && tokens[n + 2]?.value === 'from' && tokens[n + 3]?.kind === 'IMPORT_PATH') {
            const name = tokens[n + 1].value;
            try {
                const external = readImport?.(tokens[n + 3].value.slice(1,-1).trim());
                const exported = external?.systems.find(system => system.name === name);
                importedOperators.set(name,new Map(exported?.syntax ?? []));
                importedSignatures.set(name,exported?.signatures || []);
            } catch { importedOperators.set(name,new Map()); }
        }
    }
    const completed = new Set();
    const visiting = new Set();
    function inheritSyntax(owner) {
        if (completed.has(owner)) return;
        const parent = systemParents.get(owner);
        if (!parent) return;
        if (visiting.has(owner)) { issue(parent,'Cyclic predicate system inheritance.'); return; }
        visiting.add(owner);
        inheritSyntax(parent.value);
        const inherited = systemOperators.get(parent.value) || importedOperators.get(parent.value);
        if (!inherited) issue(parent,`Unknown parent predicate system '${parent.value}'.`);
        const merged = new Map(inherited || []);
        for (const [name,spec] of systemOperators.get(owner) || []) merged.set(name,spec);
        systemOperators.set(owner,new Map([...merged].map(([name,spec]) => [name,{ ...spec,system:owner }])));
        visiting.delete(owner);
        completed.add(owner);
    }
    function operatorFor(context, word) {
        const owner = context.operatorSystem || context.system?.name || context.systemName;
        const own = systemOperators.get(owner)?.get(word) || importedOperators.get(owner)?.get(word);
        if (own) return own;
        if (operators.has(word)) return operators.get(word);
        const matches = [...importedOperators.values()].map(map=>map.get(word)).filter(Boolean);
        if (matches.length) return { ...matches[0], ambiguous: matches.length > 1 };
        return undefined;
    }
    const declaredOperators = new Set();
    let declarationDepth = 0;
    for (let n = 0; n < tokens.length; n++) {
        const owner = ranges.find(range => range.start < n && n < range.end)?.name;
        if ((declarationDepth === 0 || owner) && tokens[n].value === 'syntax' && tokens[n + 1]?.value === '[') {
            const target = owner ? systemOperators.get(owner) : operators;
            let p = n + 2;
            while (tokens[p]?.value === 'opp') {
                p++;
                let spacing;
                if (tokens[p]?.value === 'w') {
                    p++; spacing = 'w';
                    if (tokens[p]?.value === '/' && tokens[p + 1]?.value === 'o') { p += 2; spacing = 'w/o'; }
                }
                let precedence;
                if (/^\d+$/.test(tokens[p]?.value ?? '')) precedence = Number(tokens[p++].value);
                const associativity = tokens[p++]?.value;
                const rawName = tokens[p++];
                const joinedSlash = rawName?.kind === 'ATOM' && rawName.value.length > 1 && rawName.value.endsWith('/');
                const token = joinedSlash ? { ...rawName,value:rawName.value.slice(0,-1),end:rawName.end-1 } : rawName;
                const slash = joinedSlash ? { value:'/' } : tokens[p++];
                const arity = Number(tokens[p++]?.value);
                precedence ??= 550;
                if (!token || !['yfx','xfy','xfx','fx','fy','xf','yf'].includes(associativity) || slash?.value !== '/' ||
                    arity !== (associativity.length === 2 ? 1 : 2) || tokens[p++]?.value !== '.') break;
                if (!target.has(token.value)) target.set(token.value,{ token, associativity, arity, precedence, spacing, system: owner });
            }
        }
        if (['(', '[', '{'].includes(tokens[n].value)) declarationDepth++;
        if ([')', ']', '}'].includes(tokens[n].value)) declarationDepth--;
    }
    for (const owner of systemParents.keys()) inheritSyntax(owner);
    let i = 0;
    const peek = () => tokens[i] || eof;
    const startsTerm = () => ['(', '[', '{'].includes(peek().value) || /^(?:[a-zA-Z0-9]\w*|_|[=<>!+*\/&?|\-$@#\\'"`]+)$/.test(peek().value);
    const take = () => tokens[i++] || eof;
    const accept = value => peek().value === value ? take() : undefined;
    const expect = value => {
        const token = accept(value);
        if (!token) { issue(peek(), `Expected '${value}'.`); throw new Error('syntax'); }
        return token;
    };
    const name = pattern => {
        const token = peek();
        if (!pattern.test(token.value)) { issue(token, 'Expected a name.'); throw new Error('syntax'); }
        return take();
    };
    const symbol = (token, kind, extra = {}) => {
        const result = { name: token.value, start: token.start, end: token.end, kind, ...extra };
        symbols.push(result);
        return result;
    };
    let parsingJoined = false;
    function term(context, minimum = 0) {
        if (parsingJoined) return parseTerm(context,minimum);
        const start = i;
        let end = start;
        while (end < tokens.length && !['.',';','<-'].includes(tokens[end].value)) end++;
        const original = tokens.slice(start,end);
        const names = new Set([...operators.keys(), ...[...systemOperators.values(),...importedOperators.values()].flatMap(map => [...map.keys()])]);
        const specs = new Map([...names].map(name => [name,operatorFor(context,name)]).filter(([,spec]) => spec));
        const referenceCount = references.length, diagnosticCount = diagnostics.length;
        let failure;
        const replaceExpression = replacement => {
            let boundary = start;
            while (boundary < tokens.length && !['.',';','<-'].includes(tokens[boundary].value)) boundary++;
            tokens.splice(start,boundary - start,...replacement);
        };
        for (const variant of joinedTokenizations(original,specs)) {
            replaceExpression(variant);
            i = start; references.length = referenceCount; diagnostics.length = diagnosticCount;
            parsingJoined = true;
            try { return parseTerm(context,minimum); }
            catch (error) { failure ||= { error, diagnostics: diagnostics.slice(diagnosticCount) }; }
            finally { parsingJoined = false; }
        }
        replaceExpression(original);
        i = start; references.length = referenceCount; diagnostics.length = diagnosticCount;
        if (failure) { diagnostics.push(...failure.diagnostics); throw failure.error; }
        return parseTerm(context,minimum);
    }
    function parseTerm(context, minimum = 0) {
        let left;
        const prefix = peek().literal ? undefined : operatorFor(context,peek().value);
        const following = operatorFor(context,tokens[i + 1]?.value);
        if (prefix && ['fx','fy'].includes(prefix.associativity) &&
            (!following || ['fx','fy'].includes(following.associativity)) &&
            (['ATOM','VAR','ANY'].includes(tokens[i + 1]?.kind) || ['[','{'].includes(tokens[i + 1]?.value))) {
            const token = take();
            if (prefix.ambiguous) issue(token,`Ambiguous syntax operator '${token.value}'; qualify the predicate system.`);
            const operand = term(context,600 - prefix.precedence + (prefix.associativity === 'fx' ? 1 : 0));
            if ((operand.priority || 0) > prefix.precedence || (operand.priority === prefix.precedence && prefix.associativity === 'fx')) {
                issue(token,'Operator requires parentheses at equal or weaker precedence.');
                throw new Error('syntax');
            }
            left = { token, args: [operand], call: true, systemName: prefix.system, priority: prefix.precedence };
        } else if (['(', '[', '{'].includes(peek().value)) {
            const opening = take().value;
            if (opening === '[' && peek().value === ']' && operatorFor(context,'|')) {
                const token = take();
                return { token: { ...token, value: 'nil' }, args: [], call: false, priority: 0 };
            }
            left = term(context);
            expect(opening === '(' ? ')' : opening === '[' ? ']' : '}');
            left = { ...left, priority: 0 };
        } else {
        const token = name(/^(?:[a-zA-Z0-9]\w*|_|[=<>!+*\/&?|\-$@#\\'"`]+)$/);
        if (/^[A-Z]/.test(token.value)) references.push({ ...token, kind: context.query ? 'global' : 'local', context });
        const args = [];
        let call = false;
        if (accept('(')) {
            if (peek().value !== ')') {
                args.push(term(context));
                while (true) {
                    const comma = accept(',');
                    if (!comma && !startsTerm() && peek().value !== '(') break;
                    if (!comma && tokens[i - 1]?.end === peek().start) {
                        issue(peek(),'Adjacent arguments need a comma or whitespace.'); throw new Error('syntax');
                    }
                    args.push(term(context));
                }
            }
            expect(')');
            if (/^[A-Z_]/.test(token.value)) issue(token, 'A predicate or compound term must start with a lowercase letter or digit.');
            call = true;
        }
        left = { token, args, call };
        }
        while (true) {
            const spec = peek().literal ? undefined : operatorFor(context,peek().value);
            if (!spec || ['fx','fy'].includes(spec.associativity) || 600 - spec.precedence < minimum) break;
            if (spec.ambiguous) issue(peek(),`Ambiguous syntax operator '${peek().value}'; qualify the predicate system.`);
            if ((left.priority || 0) > spec.precedence || (left.priority === spec.precedence && spec.associativity.startsWith('x'))) {
                issue(peek(), 'Operator requires parentheses at equal or weaker precedence.');
                throw new Error('syntax');
            }
            const operator = take();
            const args = [left];
            if (spec.arity === 2) {
                const right = term(context, 600 - spec.precedence + (spec.associativity.endsWith('y') ? 0 : 1));
                if ((right.priority || 0) > spec.precedence || (right.priority === spec.precedence && spec.associativity.endsWith('x'))) {
                    issue(operator,'Operator requires parentheses at equal or weaker precedence.');
                    throw new Error('syntax');
                }
                args.push(right);
            }
            left = { token: operator, args, call: true, systemName: spec.system, priority: spec.precedence };
        }
        return left;
    }
    function predicate(context, definition = false) {
        const negated = accept('~');
        const before = references.length;
        let systemName;
        if (!definition && tokens[i + 1]?.value === ':') {
            const qualifier = name(/^[a-z0-9]\w*$/);
            expect(':');
            systemName = qualifier.value;
            references.push({ ...qualifier, kind: 'system', context });
        }
        const previousOperatorSystem = context.operatorSystem;
        if (systemName) context.operatorSystem = systemName;
        let result = term(context);
        if (peek().value === ':=') {
            issue(peek(),':= is only for declarations; use a relation such as C = A op B.');
            throw new Error('syntax');
        }
        if (!result.call) issue(result.token, 'Expected a predicate with parentheses.');
        if (definition) {
            const declaration = symbol(result.token, 'predicate', { arity: result.args.length, system: context.system });
            context.system.predicates.push(declaration);
        } else if (result.reference) result.reference.systemName = systemName || result.reference.systemName;
        else references.push({ ...result.token, kind: 'predicate', arity: result.args.length, context, systemName: systemName || result.systemName });
        context.operatorSystem = previousOperatorSystem;
    }
    function clause(system) {
        const context = { system, start: peek().start };
        predicate(context, true);
        const declaration = system.predicates.at(-1);
        if (accept('<-')) {
            predicate(context);
            while (accept(',') || startsTerm() || peek().value === '~') predicate(context);
        }
        context.end = expect('.').end;
        declaration.definition = text.slice(context.start, context.end);
        declaration.filename = filename;
        // Only a contiguous block of comment-only lines directly above the clause.
        const lineStart = text.lastIndexOf('\n', context.start - 1) + 1;
        const comments = [];
        if (!text.slice(lineStart, context.start).trim()) {
            const preceding = text.slice(0, lineStart).replace(/\r?\n$/, '').split(/\r?\n/);
            for (let n = preceding.length - 1; n >= 0; n--) {
                const match = /^\s*% ?(.*)$/.exec(preceding[n]);
                if (!match) break;
                comments.unshift(match[1]);
            }
        }
        declaration.documentation = comments.join('\n');
        const locals = references.filter(ref => ref.kind === 'local' && ref.context === context);
        for (const variable of new Set(locals.map(ref => ref.value))) {
            const occurrences = locals.filter(ref => ref.value === variable);
            if (occurrences.length === 1) issue(occurrences[0], `Variable '${variable}' is used only once; use '_' if intentional.`, 'warning');
        }
    }
    function syntaxDeclaration(owner) {
        take(); expect('[');
        while (peek().value && peek().value !== ']') {
            expect('opp');
            if (peek().value === 'w') {
                take();
                if (accept('/')) expect('o');
            }
            let priority;
            if (/^\d+$/.test(peek().value)) priority = Number(take().value);
            const associativity = take();
            if (!['yfx','xfy','xfx','fx','fy','xf','yf'].includes(associativity.value)) issue(associativity,'Expected fx, fy, xf, yf, yfx, xfy or xfx.');
            const rawName = name(/^(?:[a-z]\w*|[0-9]|[=<>!+*\/&?|\-$@#\\'"`]+)$/);
            const joinedSlash = rawName.kind === 'ATOM' && rawName.value.length > 1 && rawName.value.endsWith('/');
            const token = joinedSlash ? { ...rawName,value:rawName.value.slice(0,-1),end:rawName.end-1 } : rawName;
            if (['let','def','import','from','syntax','opp'].includes(token.value)) issue(token,'Reserved syntax operator name.');
            if (declaredOperators.has((owner || '') + ':' + token.value)) issue(token,`Duplicate syntax operator '${token.value}'.`);
            declaredOperators.add((owner || '') + ':' + token.value);
            if (!joinedSlash) expect('/');
            const arity = name(/^\d+$/);
            priority ??= 550;
            if (Number(arity.value) !== (associativity.value.length === 2 ? 1 : 2)) issue(arity,'Unary operators require arity 1; infix operators require arity 2.');
            if (priority < 1 || priority > 599) issue(token,'Operator priority must be 1 through 599.');
            expect('.');
        }
        expect(']'); expect('.');
    }
    while (i < tokens.length) {
        const before = i;
        try {
            if (peek().value === 'syntax' && tokens[i + 1]?.value === '[') {
                syntaxDeclaration();
            } else if (accept('import')) {
                const token = name(/^[a-z0-9]\w*$/);
                expect('from');
                if (peek().kind !== 'IMPORT_PATH') { issue(peek(), 'Expected an import path in parentheses.'); throw new Error('syntax'); }
                const path = take();
                expect(';');
                const specifier = path.value.slice(1, -1).trim();
                if (!specifier) issue(path, 'Import path cannot be empty.');
                const system = symbol(token, 'system', { predicates: [], imported: true, path: specifier,
                    signatures: importedSignatures.get(token.value) || [], syntax: importedOperators.get(token.value) || new Map() });
                systems.push(system);
            } else if (accept('let')) {
                const token = name(/^[A-Z]\w*$/);
                let count;
                if (accept('^')) count = name(/^\d+$/);
                expect(':='); expect('[');
                if (peek().value !== ']') {
                    term({ domain: true });
                    while (accept(',') || startsTerm()) term({ domain: true });
                }
                expect(']'); expect(';');
                const declaration = symbol(token, 'variable', { count: count ? Number(count.value) : undefined });
                if (count && Number(count.value) > 100000) issue(count, 'Variable family is too large for editor indexing.', 'warning');
                else if (count) for (let n = 0; n <= Number(count.value); n++) globals.set(token.value + n, declaration);
                else globals.set(token.value, declaration);
            } else if (accept('def')) {
                const token = name(/^[a-z0-9]\w*$/);
                const system = symbol(token, 'system', { predicates: [], syntax: systemOperators.get(token.value) || new Map() });
                systems.push(system);
                if (accept('extends')) {
                    const parent = name(/^[a-z0-9]\w*$/);
                    system.parentName = parent.value;
                    references.push({ ...parent,kind:'system' });
                }
                expect(':='); expect('{');
                system.bodyStart = tokens[i - 1].end;
                while (peek().value && peek().value !== '}') {
                    const start = i;
                    try {
                        if (peek().value === 'syntax' && tokens[i + 1]?.value === '[') syntaxDeclaration(system.name);
                        else clause(system);
                    }
                    catch (error) {
                        if (error.message !== 'syntax') throw error;
                        while (peek().value && !['.', '}', ';', 'let', 'def'].includes(peek().value)) take();
                        accept('.');
                        if ([';', 'let', 'def'].includes(peek().value)) break;
                    }
                    if (i === start) break;
                }
                system.bodyEnd = peek().start;
                expect('}'); expect(';');
            } else {
                const token = name(/^[a-z0-9]\w*$/);
                const context = { query: true, systemName: token.value };
                references.push({ ...token, kind: 'system', context });
                expect('['); predicate(context); expect(']');
                expect(';');
            }
        } catch (error) {
            if (error.message !== 'syntax') throw error;
            while (peek().value && ![';', 'let', 'def'].includes(peek().value)) take();
            accept(';');
        }
        if (i === before) take();
    }
    for (const system of systems) {
        if (system.imported) continue;
        const hidden = new Set();
        const body = text.slice(system.bodyStart,system.bodyEnd);
        for (const match of body.matchAll(/^\s*%\s*@hidden\s+(\S+)\/(\d+)\s*$/gm))
            hidden.add(`${match[1]}/${Number(match[2])}`);
        for (const pred of system.predicates) {
            if (/^\s*@hidden\s*$/m.test(pred.documentation || '')) hidden.add(`${pred.name}/${pred.arity}`);
        }
        system.hiddenSignatures = hidden;
        for (const pred of system.predicates) {
            pred.hidden = hidden.has(`${pred.name}/${pred.arity}`);
            pred.documentation = (pred.documentation || '').split('\n').filter(line => !/^\s*@hidden(?:\s|$)/.test(line)).join('\n');
        }
    }
    for (const ref of references) {
        if (ref.kind === 'global') {
            ref.target = globals.get(ref.value);
            if (!ref.target) issue(ref, `Undeclared query variable '${ref.value}'.`);
        } else if (ref.kind === 'system') {
            ref.target = systems.find(system => system.name === ref.value);
            if (!ref.target) issue(ref, `Unknown predicate system '${ref.value}'.`);
        } else if (ref.kind === 'predicate') {
            const system = ref.systemName !== undefined ? systems.find(system => system.name === ref.systemName) :
                ref.context.system || systems.find(system => system.name === ref.context.systemName);
            if (!system) continue;
            let current = system;
            const visited = new Set();
            const candidates = [];
            while (current && !visited.has(current.name)) {
                visited.add(current.name);
                if (current.imported) {
                    ref.target = current.signatures.find(pred => pred.name === ref.value && pred.arity === ref.arity);
                    break; // Missing external signatures remain the runtime loader's responsibility.
                }
                candidates.push(...current.predicates);
                ref.target = current.predicates.find(pred => pred.name === ref.value && pred.arity === ref.arity);
                if (ref.target) break;
                current = systems.find(item => item.name === current.parentName);
            }
            if (!ref.target && current?.imported) continue;
            if (!ref.target) {
                const arities = [...new Set(candidates.filter(pred => pred.name === ref.value).map(pred => pred.arity))];
                issue(ref, arities.length ? `Predicate '${ref.value}' expects ${arities.join(' or ')} argument(s), received ${ref.arity}.` : `Unknown predicate '${ref.value}/${ref.arity}' in '${system.name}'.`);
            }
        } else if (ref.kind === 'local') {
            const first = references.find(other => other.kind === 'local' && other.context === ref.context && other.value === ref.value);
            ref.target = { name: ref.value, kind: 'local variable', start: first.start, end: first.end };
        }
    }
    function signatures(system,visited = new Set()) {
        if (!system || visited.has(system.name)) return [];
        if (system.imported) return system.signatures;
        visited.add(system.name);
        const own = [];
        for (const pred of system.predicates) {
            if (own.some(item => item.name === pred.name && item.arity === pred.arity)) continue;
            own.push({ name: pred.name, arity: pred.arity, kind: 'predicate', system: { name: system.name },
                start: pred.start, end: pred.end, filename: pred.filename,
                definition: pred.definition, documentation: pred.documentation, hidden: pred.hidden });
        }
        const seen = new Set(own.map(pred => `${pred.name}/${pred.arity}`));
        for (const pred of signatures(systems.find(item => item.name === system.parentName),visited))
            if (!seen.has(`${pred.name}/${pred.arity}`)) {
                own.push(system.hiddenSignatures?.has(`${pred.name}/${pred.arity}`) ? { ...pred,hidden:true } : pred);
                seen.add(`${pred.name}/${pred.arity}`);
            }
        return own;
    }
    for (const system of systems) if (!system.imported) system.signatures = signatures(system);
    for (const ref of references) if (ref.kind === 'predicate') {
        const owner = ref.systemName !== undefined ? systems.find(system => system.name === ref.systemName) :
            ref.context.system || systems.find(system => system.name === ref.context.systemName);
        ref.hidden = !!owner?.signatures.find(pred => pred.name === ref.value && pred.arity === ref.arity)?.hidden;
    }
    return { diagnostics, symbols, references, systems, globals, tokens, operators };
}
module.exports = { analyze };
