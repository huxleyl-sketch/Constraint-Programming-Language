interface CspSource { id: string; code: string }
interface CspImports {
    filename: string;
    read: (specifier: string, importer: string) => CspSource;
    modules?: Map<string, constraintSystem>;
    stack?: readonly string[];
    definitionsOnly?: boolean;
}

function parser(code: string, system: constraintSystem, imports?: CspImports) {
    const hidden = hiddenPredicateTags(code);
    const syntax = new Map(system.syntax);
    const modules = imports?.modules ?? new Map<string, constraintSystem>();
    const stack = imports?.stack ?? (imports ? [imports.filename] : []);
    const preloaded = new Map<string,predicateSystem>();
    const loadImport = (name: string, specifier: string): predicateSystem => {
        if (!imports) throw new Error('Imports require a file loader. Load a .csp file first.');
        if (!specifier) throw new Error('Import path cannot be empty');
        let source: CspSource;
        try { source = imports.read(specifier, imports.filename); }
        catch (error) { throw new Error(`Cannot import "${specifier}" from ${imports.filename}: ${error instanceof Error ? error.message : String(error)}`); }
        if (stack.includes(source.id)) throw new Error(`Circular import: ${[...stack,source.id].join(' -> ')}`);
        let module = modules.get(source.id);
        if (!module) {
            module = new constraintSystem(system.algorithm);
            parser(source.code,module,{ filename: source.id, read: imports.read, modules,
                stack: [...stack,source.id], definitionsOnly: true });
            modules.set(source.id,module);
        }
        const exported = module.getPredicateSystem(name);
        preloaded.set(name,exported);
        return exported;
    };
    const environment = system.syntaxEnvironment();
    environment.loadImport = (name,path) => loadImport(name,path).syntax;
    let tree = interpreter(code, syntax, environment);
    const declarations = new Set<string>();
    for (let eLine of tree) {
        var line: Expr = eLine.kind === 'LINE' ? resolve(eLine.lhs?.[0]) : eLine;
        if (imports?.definitionsOnly && line.kind !== 'IMPORT' && line.kind !== 'DEFINE') continue;
        switch (line.kind) {
            case 'IMPORT': {
                const from = resolve(line.rhs?.[0]);
                const name = resolve(from.lhs?.[0]);
                const path = resolve(from.rhs?.[0]);
                if (from.kind !== 'FROM' || from.lhs?.length !== 1 || from.rhs?.length !== 1 ||
                    name.kind !== 'ATOM' || path.kind !== 'IMPORT_PATH' || eLine.kind !== 'LINE') {
                    throw new Error('Expected import system from (./file.csp);');
                }
                if (declarations.has(name.match)) throw new Error(`Duplicate predicate system: ${name.match}`);
                declarations.add(name.match);
                const specifier = path.match.slice(1, -1).trim();
                system.addImportedSystem(name.match, preloaded.get(name.match) ?? loadImport(name.match,specifier));
                break;
            }
            case 'VARIABLE':
                var def = resolve(line.rhs?.[0])
                var lhs = resolve(def.lhs?.[0]);
                var dom = resolve(def.rhs?.[0]?.rhs);
                var vars = lhs.kind === 'MANY' ?
                    Array.from({ length: Number(resolve(lhs.rhs?.[0]).match) + 1 }, (_, i): string => resolve(lhs.lhs?.[0]).match + i) :
                    [lhs.match];
                for (let name of vars) {
                    system.addVariable(name, dom)
                }
                break;
            case 'DEFINE':
                var def = resolve(line.rhs?.[0])
                var name = resolve(def.lhs?.[0]).match
                if (declarations.has(name)) throw new Error(`Duplicate predicate system: ${name}`);
                declarations.add(name);
                var preds = resolve(def.rhs?.[0]?.rhs);
                var sys = new predicateSystem(name => system.getPredicateSystem(name));
                sys.hiddenPredicates = new Set(hidden.get(name));
                sys.parentName = environment.parents?.get(name);
                sys.syntax = new Map(environment.systems.get(name));
                system.addPredicateSystem(name, parsePreds(preds, sys));
                break;
            case 'QUERY':
                var sysKey = resolve(line.lhs?.[0]).match
                var pred = resolve(line.rhs?.[0]);
                if (pred.kind === 'IMPLIES') {
                    const expanded = syntaxPredicate(pred, system.getPredicateSystem(sysKey));
                    const wrapper = new predicateSystem();
                    wrapper.preds.set(new Expr(expanded.key,'ATOM'), expanded);
                    let privateName = '$syntaxExpressionSystem';
                    while (true) {
                        try { system.getPredicateSystem(privateName); privateName += '_'; }
                        catch { break; }
                    }
                    system.addSyntaxSystem(privateName,wrapper);
                    sysKey = privateName;
                    pred = resolve(pred.lhs?.[0]);
                }
                if (line.lhs?.length !== 1 || line.rhs?.length !== 1 || pred.kind !== 'PRED') {
                    throw new Error('Expected system[predicate(X,Y)]');
                }
                var predKey = resolve(pred.lhs?.[0]).match;
                var vars = resolve(pred.rhs).filter((e): boolean => e.kind !== 'ANY').map((e): string => e.match);
                let con = system.createConstraint(vars, { system: sysKey, predicate: predKey })
                system.searchConstraints(resolve(con))
                system.addConstraint(vars, { system: sysKey, predicate: predKey });
                break;
            case 'QUALIFIED':
                throw new Error('Constraints use system[predicate(X,Y)]; qualified calls belong in predicate rule bodies');
            default:
                throw new Error(`Expected a variable declaration, system definition, or constraint`)

        }
    }
    system.syntax = syntax;
}

/** Presentation metadata, scoped to the original source rather than expanded syntax. */
function hiddenPredicateTags(source: string): Map<string,Set<string>> {
    const result = new Map<string,Set<string>>();
    let owner: string | undefined, depth = 0;
    for (const match of source.matchAll(/%[^\r\n]*|\bdef\s+([a-z0-9]\w*)(?:\s+extends\s+[a-z0-9]\w*)?\s*:=\s*\{|[{}]/g)) {
        if (match[1]) { owner = match[1]; depth = 1; continue; }
        if (match[0] === '{') { depth++; continue; }
        if (match[0] === '}') { if (--depth === 0) owner = undefined; continue; }
        if (!owner || !/^%\s*@hidden(?:\s|$)/.test(match[0])) continue;
        const explicit = /^%\s*@hidden\s+(\S+)\/(\d+)\s*$/.exec(match[0]);
        let signature = explicit ? `${explicit[1]}/${Number(explicit[2])}` : undefined;
        if (!signature && /^%\s*@hidden\s*$/.test(match[0])) {
            const tail = source.slice(match.index + match[0].length).replace(/^(?:\s+|%[^\r\n]*)*/, '');
            const head = /^(?:[a-z0-9]\w*|[=<>!+*\/&?|\-$@#\\'"`]+)\s*\(/.exec(tail);
            if (head) {
                let nesting = 1, end = head[0].length;
                for (; end < tail.length && nesting; end++) {
                    if (tail[end] === '(') nesting++;
                    if (tail[end] === ')') nesting--;
                }
                try {
                    const pred = interpreter(tail.slice(0,end))[0];
                    if (pred?.kind === 'PRED') signature = `${pred.lhs?.[0]?.match}/${pred.rhs?.length ?? 0}`;
                } catch { /* Incomplete source is reported by the language parser. */ }
            }
        }
        if (signature) {
            if (!result.has(owner)) result.set(owner,new Set());
            result.get(owner)?.add(signature);
        }
    }
    return result;
}

/** Compile generated conjunctions as ordinary definitions with the original lookup scope. */
function syntaxPredicate(expression: Expr, context: predicateSystem): predicate {
    const temporary = parsePreds([new Expr('.', 'CLAUSE', [expression])], new predicateSystem());
    const head = resolve(expression.lhs?.[0]);
    const name = resolve(head.lhs?.[0]).match;
    const result = new predicate(name, context);
    for (const definition of temporary.grabPred(name).defs) result.addDefinition(definition.args, context, definition.deps);
    return result;
}

function parsePreds(tree: readonly Expr[], system: predicateSystem): predicateSystem {

    for (let clause of tree) {
        if (clause.kind !== 'CLAUSE') throw new Error(`Expected token CLAUSE, got ${clause.kind} instead`);
        //find node
        let node = resolve(clause.lhs?.[0]);
        switch (node.kind) {
            case 'PRED':
                //create predicate without dependencies
                createPred(node);
                break;
            case 'IMPLIES':
                //create predicate with dependencies
                createDPred(node);
                break;
            default:
                throw new Error(`node type expected PRED or IMPLIES, got ${node.kind}`)
        }

    }
    /**
     * From predEnd
     */
    function createPred(pred: Expr, deps: Deps = []) {
        if (pred.kind !== 'PRED') throw new Error(`Expected token PRED, got ${pred.kind} instead`)
        //find predicate atom
        let name = resolve(pred.lhs?.[0])
        //find predicate args
        let args = resolve(pred.rhs)
        system.addPredicate(name, args, deps)
    }
    /**
     * From implies
     */
    function createDPred(implies: Expr) {
        if (implies.kind !== 'IMPLIES') throw new Error(`Expected token IMPLIES, got ${implies.kind} instead`)
        //find the predEnd token
        let predEnd = resolve(implies.lhs?.[0]);
        //run parse dependencies
        let deps = resolve(implies.rhs).map((dep): Dep => resolve(parseDep(dep)));
        /**
         * parse a predicate with dependencies
         */
        function parseDep(cur: Expr): Dep {
            if (!cur) throw new Error(`Expected rhs, ${cur}`)
            switch (cur.kind) {
                case 'QUALIFIED': {
                    let qualifier = resolve(cur.lhs?.[0]);
                    const negated = qualifier.kind === 'NOT';
                    if (negated) qualifier = resolve(qualifier.rhs?.[0]);
                    if (cur.lhs?.length !== 1 || cur.rhs?.length !== 1 || qualifier.kind !== 'ATOM') {
                        throw new Error('Expected system:predicate(Args) in rule body');
                    }
                    const dep = parseDep(resolve(cur.rhs?.[0]));
                    dep.systemName = qualifier.match;
                    dep.not = dep.not || negated;
                    return dep;
                }
                case 'NOT':
                    //change not of the predicate to true
                    var rhs = resolve(cur.rhs?.[0])
                    var dep = parseDep(rhs);
                    dep.not = true;
                    return dep;
                case 'PRED':
                    //find the predicate Atom
                    var predInit = resolve(cur.lhs?.[0])
                    var pred = predInit.kind === 'NOT' ? resolve(predInit.rhs?.[0]) : predInit
                    //find the predicate arguments
                    var args = resolve(cur.rhs);
                    return { pred, args, not: predInit.kind === 'NOT' }
            }
            throw new Error(`Unexpected token: ${cur}`)
        }
        createPred(predEnd, deps);
    }
    return system;
}
/**
 * resolves value that could return nullish
 */
function resolve<A>(val: A | null | undefined, inp: unknown = val): NonNullable<A> {
    if (val == null) throw new Error(`${val} was nullish from ${inp}`)
    return val;
}
