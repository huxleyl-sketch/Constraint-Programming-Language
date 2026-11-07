/** Graph adapter only: the language parser and solver remain the source of truth. */
interface GraphVariable { name: string; domain: string; x: number; y: number }
interface GraphRelation { system: string; predicate: string; expression?: string; arity?: number; args: string[]; triangle: boolean; x: number; y: number }
interface GraphPredicate { system: string; name: string; arity: number }
function graphStatements(source: string): string[] {
    const result: string[] = [];
    let start = 0, depth = 0, comment = false;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (comment) { if (c === '\n') comment = false; continue; }
        if (c === '%') { comment = true; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        if (c === ')' || c === ']' || c === '}') depth--;
        if (c === ';' && depth === 0) { result.push(source.slice(start, i + 1)); start = i + 1; }
    }
    if (source.slice(start).trim()) result.push(source.slice(start));
    return result;
}
/** Replace named local definitions; retain existing constraints and append new ones. */
function graphMergeRelations(source: string, draft: string): string {
    const clean = (statement: string) => statement.replace(/%[^\n]*/g,'').trim();
    const statements = graphStatements(source);
    let changed = false;
    for (const statement of graphStatements(draft)) {
        const code = clean(statement);
        if (!code) continue;
        const definition = /^(def|import)\s+([a-z0-9]\w*)\b/.exec(code);
        if (!definition && !/^[a-z0-9]\w*\s*\[/.test(code))
            throw new Error('Use def blocks, imports, or system[...] constraints. Add variable domains in the graph or source editor.');
        if (!definition && statements.some(existing=>clean(existing) === code)) continue;
        const index = definition ? statements.findIndex(existing => {
            const match = /^(def|import)\s+([a-z0-9]\w*)\b/.exec(clean(existing));
            return match?.[1] === definition[1] && match?.[2] === definition[2];
        }) : -1;
        if (index < 0) statements.push(statement); else statements[index] = statement;
        changed = true;
    }
    if (!changed && !draft.trim()) throw new Error('Write a predicate system or constraint first.');
    // Definitions must precede expression constraints that use their syntax and context.
    return [...statements.filter(s=>/^(def|import)\b/.test(clean(s))),
        ...statements.filter(s=>!/^(def|import)\b/.test(clean(s)))].join('\n').trim() + '\n';
}
class CspGraph {
    variables: GraphVariable[] = [];
    relations: GraphRelation[] = [];
    preserved: string[] = [];
    catalog: GraphPredicate[] = [];
    mismatch(relation: GraphRelation): boolean {
        if (relation.expression !== undefined) return relation.arity !== relation.args.length;
        return !!relation.predicate && !this.catalog.some(p => p.system === relation.system && p.name === relation.predicate && p.arity === (relation.arity ?? relation.args.length) && p.arity === relation.args.length);
    }
    private expressionPredicate(owner: string, expression: string, system: constraintSystem): { predicate: predicate; args: string[]; hidden: boolean } {
        const tree = interpreter(`${owner}[${expression}];`,new Map(system.syntax),system.syntaxEnvironment());
        const line = resolve(tree[0]);
        const query = line.kind === 'LINE' ? resolve(line.lhs?.[0]) : line;
        const root = resolve(query.rhs?.[0]);
        const inputs = root.kind === 'IMPLIES' ? resolve(root.lhs?.[0]?.rhs) : undefined;
        const variables = new Set<string>();
        const collect = (expr: Expr) => {
            if (expr.kind === 'VAR') variables.add(expr.match);
            expr.lhs?.forEach(collect); expr.rhs?.forEach(collect);
        };
        if (inputs) inputs.forEach(collect); else collect(root);
        const args = [...variables];
        const head = new Expr('(','PRED',[new Expr('graphExpression','ATOM')],args.map(name=>new Expr(name,'VAR')));
        const body = root.kind === 'IMPLIES' ? resolve(root.rhs) : [root];
        const rule = new Expr('<-','IMPLIES',[head],body);
        const hidden = body.some(goal => {
            if (goal.kind === 'NOT') goal = resolve(goal.rhs?.[0]);
            let scope = owner;
            if (goal.kind === 'QUALIFIED') {
                const qualifier = resolve(goal.lhs?.[0]);
                scope = qualifier.kind === 'NOT' ? resolve(qualifier.rhs?.[0]).match : qualifier.match;
                goal = resolve(goal.rhs?.[0]);
            }
            return goal.kind === 'PRED' && system.getPredicateSystem(scope)
                .isHiddenPredicate(resolve(goal.lhs?.[0]).match,goal.rhs?.length ?? 0);
        });
        return { predicate:syntaxPredicate(rule,system.getPredicateSystem(owner)),args,hidden };
    }
    check(relation: GraphRelation, system: constraintSystem, values: readonly Expr[]): boolean {
        if (relation.expression === undefined)
            return system.check({scope:relation.args,relation:{system:relation.system,predicate:relation.predicate}},values);
        const expanded = this.expressionPredicate(relation.system,relation.expression,system);
        for (const answer of expanded.predicate.query(values)) if (answer) return true;
        return false;
    }
    assertComplete() {
        if (this.relations.some(r => !r.predicate || this.mismatch(r))) throw new Error('Choose a predicate and match its argument count for every constraint before solving or saving.');
    }
    load(source: string, system: constraintSystem) {
        const variables = [...system.domains].map(([name, values], i) => ({ name, domain: values.map(printExpr).join(', '), x: 130 + (i % 5) * 160, y: 100 + Math.floor(i / 5) * 150 }));
        const relations: GraphRelation[] = [], preserved: string[] = [];
        const drafts: GraphRelation[] = [];
        source = source.replace(/^% @graph-draft (.+)$/gm, (_, json: string) => {
            const value: unknown = JSON.parse(json);
            if (!value || typeof value !== 'object') throw new Error('Invalid graph draft.');
            const r = value as GraphRelation;
            if (typeof r.system !== 'string' || typeof r.predicate !== 'string' || !Array.isArray(r.args) || !r.args.every(a => typeof a === 'string' && variables.some(v => v.name === a)) || typeof r.x !== 'number' || typeof r.y !== 'number' || (r.arity !== undefined && (!Number.isInteger(r.arity) || r.arity < 1))) throw new Error('Invalid graph draft.');
            drafts.push(r); return '';
        });
        for (const statement of graphStatements(source)) {
            const clean = statement.replace(/%[^\n]*/g, '').trim();
            const comments = statement.match(/%[^\n]*/g)?.join('\n') ?? '';
            if (/^let\b/.test(clean)) { if (comments) preserved.push(comments); continue; }
            const match = /^([a-z0-9]\w*)\s*\[\s*([a-z0-9]\w*|[=<>!+*\/&?|\-$@#\\'"`]+)\s*\(([^()]*)\)\s*\]\s*;$/.exec(clean);
            const args = match?.[3]?.split(',').map(s => s.trim()) ?? [];
            if (match && system.getPredicateSystem(match[1]!).isHiddenPredicate(match[2]!,args.length)) {
                preserved.push(statement);
            } else if (match && args.every(arg => variables.some(v => v.name === arg))) {
                relations.push({ system: match[1]!, predicate: match[2]!, arity: args.length, args, triangle: args.length > 2, x: 400, y: 230 + relations.length * 70 });
                if (comments) preserved.push(comments);
            } else {
                const expression = /^([a-z0-9]\w*)\s*\[([\s\S]*)\]\s*;$/.exec(clean);
                if (expression) {
                    const owner = expression[1]!, goal = expression[2]!.trim();
                    const expanded = this.expressionPredicate(owner,goal,system);
                    if (!expanded.hidden && expanded.args.length && expanded.args.every(name=>variables.some(v=>v.name === name))) {
                        relations.push({system:owner,predicate:'$expression',expression:goal,args:expanded.args,
                            arity:expanded.args.length,triangle:expanded.args.length>2,x:400,y:230+relations.length*70});
                        if (comments) preserved.push(comments);
                    } else preserved.push(statement);
                } else preserved.push(statement);
            }
        }
        const catalog: GraphPredicate[] = [];
        for (const name of system.syntaxEnvironment().systems.keys()) {
            if (name.startsWith('$')) continue;
            for (const pred of system.getPredicateSystem(name).predicateNames()) for (const arity of new Set(system.getPredicateSystem(name).grabPred(pred).defs.map(d => d.args.length))) {
                if (arity > 0 && !system.getPredicateSystem(name).isHiddenPredicate(pred,arity)) catalog.push({ system: name, name: pred, arity });
            }
        }
        this.variables = variables; this.relations = [...relations, ...drafts]; this.preserved = preserved; this.catalog = catalog;
    }
    source(): string {
        for (const variable of this.variables) {
            if (!/^[A-Z]\w*$/.test(variable.name)) throw new Error('Variable names must start with an uppercase letter.');
        }
        if (new Set(this.variables.map(v => v.name)).size !== this.variables.length) throw new Error('Variable names must be unique.');
        const definitions: string[] = [], retained: string[] = [];
        for (const statement of this.preserved) {
            const clean = statement.replace(/%[^\n]*/g, '').trim();
            (/^(import|def)\b/.test(clean) || !clean ? definitions : retained).push(statement);
        }
        return definitions.join('\n').trim() + '\n\n' + this.variables.map(v => `let ${v.name} := [${v.domain}];`).join('\n') + '\n' + retained.join('\n') + '\n' + this.relations.map(r => {
            if (!r.args.every(a => this.variables.some(v => v.name === a))) throw new Error('Connect every constraint argument to a variable.');
            if (!r.predicate || this.mismatch(r)) return `% @graph-draft ${JSON.stringify(r)}`;
            if (r.expression !== undefined) return `${r.system}[${r.expression}];`;
            return `${r.system}[${r.predicate}(${r.args.join(',')})];`;
        }).join('\n') + '\n';
    }
}
