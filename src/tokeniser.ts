type TokenDefinition = { kind: string; regex: RegExp; type: string; pre: number };
type tokenTemp = TokenDefinition & { kind: TokenKind };
type token = tokenTemp & { lexeme: string; start?: number; end?: number; literal?: boolean };

const Tokens = [

    { kind: "VARIABLE", regex: /let\b/y, type: "fx", pre: 1800 },
    { kind: "DEFINE", regex: /def\b/y, type: "fx", pre: 1800 },
    { kind: "IMPORT", regex: /import\b/y, type: "fx", pre: 1800 },
    { kind: "FROM", regex: /from\b/y, type: "xfx", pre: 1500 },
    { kind: "IMPORT_PATH", regex: /\([^()\r\n]*\)/y, type: "x", pre: 0 },

    { kind: "DEF", regex: /:=/y, type: "xfx", pre: 1500 },

    { kind: "MANY", regex: /\^/y, type: "xfx", pre: 1000 },

    { kind: "RELATION", regex: /{/y, type: "o", pre: 0 },
    { kind: "RELATION", regex: /}/y, type: "c", pre: 0 },





    { kind: "QUALIFIED", regex: /:/y, type: "xfx", pre: 600 },

    { kind: "QUERY", regex: /\[/y, type: "xfo", pre: 1199 },
    { kind: "QUERY", regex: /\]/y, type: "c", pre: 1199 },

    { kind: "LINE", regex: /\;/y, type: "xf", pre: 2000 },

    //=============================================================

    { kind: "IMPLIES", regex: /<-/y, type: "xfx", pre: 800 },

    { kind: "NOT", regex: /~/y, type: "fx", pre: 200 },
    { kind: "ATOM", regex: /(?:[a-z0-9]\w*|[=<>!+*\/&?|\-$@#\\'"`]+)/y, type: "x", pre: 0 },
    { kind: "VAR", regex: /[A-Z]\w*/y, type: "x", pre: 0 },
    { kind: "ANY", regex: /\_/y, type: "x", pre: 0 },

    { kind: "PRED", regex: /\(/y, type: "xfo", pre: 500 },
    { kind: "PRED", regex: /\)/y, type: "c", pre: 500 },
    { kind: "COMMA", regex: /,/y, type: "x", pre: 500 },

    { kind: "CLAUSE", regex: /\./y, type: "xf", pre: 900 },

] as const satisfies readonly TokenDefinition[];

type TokenKind = typeof Tokens[number]["kind"];


class Expr {
    readonly match: string;
    readonly kind: TokenKind;
    /** Binding identity; spelling alone is only shared within an uninstantiated query. */
    readonly variableId: string | undefined;
    readonly lhs: readonly Expr[] | null;
    readonly rhs: readonly Expr[] | null;

    constructor(
        match: string,
        token: tokenTemp | TokenKind,
        lhs: readonly Expr[] | null = null,
        rhs: readonly Expr[] | null = null,
        variableId?: string
    ) {
        this.match = match;
        this.kind = typeof token === 'string' ? token : token.kind;
        this.variableId = this.kind === 'VAR' ? variableId ?? match : undefined;
        this.lhs = lhs === null ? null : Object.freeze([...lhs]);
        this.rhs = rhs === null ? null : Object.freeze([...rhs]);
        Object.freeze(this);
    }
}

type SyntaxOperator = { name: string; arity: 1 | 2; associativity: 'yfx' | 'xfy' | 'xfx' | 'fx' | 'fy' | 'xf' | 'yf'; precedence: number; spacing?: 'w' | 'w/o'; system?: string; ambiguous?: boolean };
type SyntaxOperators = Map<string, SyntaxOperator>;
type SyntaxEnvironment = {
    systems: Map<string, SyntaxOperators>;
    imported: Set<string>;
    parents?: Map<string,string>;
    scope?: string;
    loadImport?: (name: string, path: string) => SyntaxOperators;
};


// BEGIN SHARED OPERATOR LEXING
// Transpiled for the editor by sync-operator-lexing.cjs.
type OperatorPiece = { value: string; kind: string; start: number; end: number; literal?: boolean };
function* joinedTokenizations(
    input: readonly OperatorPiece[],
    operators: ReadonlyMap<string, { spacing?: 'w' | 'w/o' }>
): Generator<OperatorPiece[]> {
    const joined = [...operators].filter(([,spec]) => spec.spacing === 'w/o')
        .map(([name]) => name).sort((a,b) => b.length - a.length);
    const boundary = (left: OperatorPiece | undefined, right: OperatorPiece | undefined) =>
        !left || !right || left.end !== right.start || /^[()[\]{},.;:~]$/.test(left.value) || /^[()[\]{},.;:~]$/.test(right.value);
    const mark = (piece: OperatorPiece, before?: OperatorPiece, after?: OperatorPiece): OperatorPiece =>
        operators.get(piece.value)?.spacing === 'w' && (!boundary(before,piece) || !boundary(piece,after))
            ? { ...piece, literal: true } : piece;
    function* split(value: string, offset: number): Generator<OperatorPiece[]> {
        if (!value) { yield []; return; }
        const names = joined.filter(name => value.startsWith(name));
        for (const name of names) {
            for (const tail of split(value.slice(name.length),offset + name.length))
                yield [{ value: name, kind: 'ATOM', start: offset, end: offset + name.length }, ...tail];
        }
        if (names.length) return;
        let end = 1;
        while (end < value.length && !joined.some(name => value.startsWith(name,end))) end++;
        const head = value.slice(0,end);
        for (const tail of split(value.slice(end),offset + end))
            yield [{ value: head, kind: /^[A-Z]/.test(head) ? 'VAR' : head === '_' ? 'ANY' : 'ATOM', start: offset, end: offset + end }, ...tail];
    }
    function* walk(index: number): Generator<OperatorPiece[]> {
        if (index >= input.length) { yield []; return; }
        const first = input[index]!;
        let end = index + 1;
        // Variables and explicit functor names retain their identities.
        if (first.kind === 'ATOM' && input[end]?.value !== '(') {
            while (input[end]?.kind === 'ATOM' && input[end - 1]!.end === input[end]!.start) end++;
        }
        const group = input.slice(index,end);
        const text = group.map(t => t.value).join('');
        const variants = first.kind === 'ATOM' && input[index + 1]?.value !== '(' && joined.some(name => text.includes(name))
            ? split(text,first.start) : [group];
        for (const variant of variants) {
            const marked = variant.map((piece,n) => mark(piece,variant[n - 1] ?? input[index - 1],variant[n + 1] ?? input[end]));
            for (const rest of walk(end)) yield [...marked,...rest];
        }
    }
    yield* walk(0);
}
// END SHARED OPERATOR LEXING

function interpreter(code: string, syntax: SyntaxOperators = new Map(), environment?: SyntaxEnvironment): Array<Expr> {

    // Find expression precedence
    const precedenceByKind = new Map<TokenKind, number>();
    for (const token of Tokens) {
        const existing = precedenceByKind.get(token.kind);

        if (existing !== undefined && existing !== token.pre) {
            throw new Error(`Conflicting precedence for ${token.kind}`);
        }

        precedenceByKind.set(token.kind, token.pre);
    }

    function getPrecedence(kind: TokenKind): number {
        return resolve(precedenceByKind.get(kind), `precedence for ${kind}`);
    }

    // Skip trivia while scanning, so import paths remain unchanged.

    function tokenise(code: string, expectPath = false): token[] {
        const result: token[] = [];
        let offset = 0;
        while (offset < code.length) {
            const remaining = code.slice(offset);
            const trivia = /^(?:\s+|%[^\r\n]*)/.exec(remaining);
            if (trivia) { offset += trivia[0].length; continue; }
            let found = false;
            for (const definition of Tokens) {
                if (definition.kind === 'IMPORT_PATH' && !expectPath) continue;
                const regex = new RegExp(definition.regex);
                const match = regex.exec(remaining);
                if (!match) continue;
                result.push({ ...definition, lexeme: match[0], start: offset, end: offset + match[0].length });
                offset += match[0].length;
                expectPath = definition.kind === 'FROM';
                found = true;
                break;
            }
            if (!found) throw new Error(`Unexpected Token: ${code[offset]}`);
        }
        return result;
    }

    function ASTBuild(tokens: token[]): Expr[] {
        let Exprs: Expr[] = []
        for (let i = 0; i < tokens.length; i++) {
            let head = resolve(tokens[i])
            let tail = tokens.slice(i + 1);
            let lhs: Expr[] | null = null;
            let rhs: Expr[] | null = null;

            let rem = Exprs;
            if (head.type === 'x') {
                var expr = new Expr(head.lexeme, head, lhs, rhs)
                Exprs.push(expr);
                continue;
            }

            switch (head.type.at(0)) {
                case 'x':
                case 'y':
                    var min = Exprs.findLastIndex((expr): boolean => getPrecedence(expr.kind) >= head.pre ||
                        (head.kind === 'QUALIFIED' && expr.kind === 'COMMA'))
                    if (min === -1) {
                        rem = [];
                        lhs = Exprs.slice();
                    } else {
                        rem = Exprs.slice(0, min + 1);
                        lhs = Exprs.slice(min + 1);
                    }
                    break;
                case 'c':
                    continue;
            }
            switch (head.type.at(-1)) {
                case 'x':
                case 'y':
                    var cap = tail.findIndex((token): boolean => token.pre >= head.pre)
                    if (head.kind === 'QUALIFIED') {
                        let depth = 0;
                        cap = tail.findIndex(token => {
                            if (depth === 0 && (token.kind === 'COMMA' || token.pre >= head.pre)) return true;
                            if (token.type.endsWith('o')) depth++;
                            if (token.type === 'c') depth--;
                            return false;
                        });
                    }
                    if (cap === -1) cap = tail.length;
                    i += cap;
                    rhs = ASTBuild(tail.slice(0, cap));
                    break;
                case 'o':
                    var depth = 0;
                    var closeIndex = -1;
                    for (let j = 0; j < tail.length; j++) {
                        const t = resolve(tail[j]);
                        if (/o/g.test(t.type)) depth++;
                        if (/c/g.test(t.type)) {
                            if (depth === 0) { closeIndex = j; break; }
                            depth--;
                        }
                    }
                    if (closeIndex === -1) throw new Error(`Missing closing 'c' token for 'o' opener, at ${i} from ${head.kind} ${head.type}`);
                    rhs = ASTBuild(tail.slice(0, closeIndex));
                    i += closeIndex;
                    break;
            }
            var expr = new Expr(head.lexeme, head, lhs, rhs)
            rem.push(expr);
            Exprs = rem;

        }
        return Exprs;
    }

    function removeComma(ASTTree: readonly Expr[]): Expr[] {
        return ASTTree.filter((e): boolean => e.kind !== 'COMMA').map((e): Expr => {
            if (e.lhs == null && e.rhs == null) return e;
            const lhs = e.lhs == null ? null : (removeComma(e.lhs));
            const rhs = e.rhs == null ? null : (removeComma(e.rhs));
            return new Expr(e.match, e.kind, lhs, rhs);
        })
    }
    const operators = new Map(syntax);
    const originalTokens = tokenise(code);
    if (environment?.loadImport) {
        let depth = 0;
        for (let i = 0; i < originalTokens.length; i++) {
            const t = resolve(originalTokens[i]);
            if (depth === 0 && t.kind === 'IMPORT' && originalTokens[i + 2]?.kind === 'FROM' &&
                originalTokens[i + 3]?.kind === 'IMPORT_PATH' && originalTokens[i + 4]?.lexeme === ';') {
                const name = resolve(originalTokens[i + 1]).lexeme;
                const path = resolve(originalTokens[i + 3]).lexeme.slice(1,-1).trim();
                environment.systems.set(name,new Map(environment.loadImport(name,path)));
                environment.imported.add(name);
            }
            if (['(', '[', '{'].includes(t.lexeme)) depth++;
            if ([')', ']', '}'].includes(t.lexeme)) depth--;
        }
    }
    const hasSyntax = operators.size || originalTokens.some(t => t.lexeme === 'extends') || [...(environment?.systems.values() ?? [])].some(ops => ops.size) ||
        originalTokens.some((t,i) => t.lexeme === 'syntax' && originalTokens[i + 1]?.lexeme === '[');
    const expandedTokens = hasSyntax
        ? tokenise(new SyntaxExpander(originalTokens, operators,tokenise,environment).expand()) : originalTokens;
    const tokenised = expandedTokens;
    if (debug) console.log(tokenised)
    let ASTTree = ASTBuild(tokenised);
    let fASTTree = removeComma(ASTTree);
    syntax.clear();
    for (const [name, operator] of operators) syntax.set(name, operator);
    if (debug) console.log(fASTTree)
    return fASTTree;
}

type SyntaxTerm = { text: string; args?: SyntaxTerm[]; operator?: SyntaxOperator; qualifier?: string; priority?: number };

/** Source sugar only: expansion produces ordinary predicate calls before ASTBuild. */
class SyntaxExpander {
    private serial = 0;
    private readonly used: Set<string>;
    private operators: SyntaxOperators;
    private scope: string | undefined;
    private readonly environment: SyntaxEnvironment;
    constructor(private readonly tokens: readonly token[], private readonly globals: SyntaxOperators, private readonly tokenise: (code: string) => token[], environment?: SyntaxEnvironment) {
        this.used = new Set(tokens.map(t => t.lexeme));
        this.environment = environment ?? { systems: new Map(), imported: new Set() };
        this.operators = globals;
        this.scope = this.environment.scope;
    }

    private inScope(scope: string | undefined): SyntaxOperators {
        const result = new Map(this.globals);
        for (const name of this.environment.imported) {
            for (const [word,spec] of this.environment.systems.get(name) ?? []) {
                if (this.globals.has(word)) continue;
                const previous = result.get(word);
                result.set(word,{ ...spec, system: name, ambiguous: !!previous && previous.system !== name });
            }
        }
        if (scope) for (const [word,spec] of this.environment.systems.get(scope) ?? [])
            result.set(word,{ ...spec, system: scope, ambiguous: false });
        return result;
    }

    private fresh(prefix: string): string {
        let name: string;
        do { name = prefix + this.serial++; } while (this.used.has(name));
        this.used.add(name);
        return name;
    }

    private text(tokens: readonly token[]): string { return tokens.map(t => t.lexeme).join(' '); }

    private close(tokens: readonly token[], start: number): number {
        const opening = tokens[start]?.lexeme;
        const closing = opening === '(' ? ')' : opening === '[' ? ']' : '}';
        let depth = 0;
        for (let i = start; i < tokens.length; i++) {
            const value = tokens[i]?.lexeme;
            if (value === opening) depth++;
            if (value === closing) {
                depth--;
                if (depth === 0) return i;
            }
        }
        throw new Error(`Missing closing '${closing}' in syntax expression`);
    }

    private collect(tokens: readonly token[], owner?: string): token[] {
        const body: token[] = [];
        let depth = 0;
        for (let i = 0; i < tokens.length; i++) {
            const t = resolve(tokens[i]);
            if (depth === 0 && t.lexeme === 'def') {
                const inherited = tokens[i + 2]?.lexeme === 'extends';
                const open = i + (inherited ? 5 : 3);
                if (tokens[open - 1]?.lexeme !== ':=' || tokens[open]?.lexeme !== '{')
                    throw new Error('Expected def name [extends parent] := { ... };');
                const end = this.close(tokens,open);
                const name = resolve(tokens[i + 1]).lexeme;
                this.environment.parents?.delete(name);
                if (inherited) {
                    const parent = resolve(tokens[i + 3]).lexeme;
                    if (!/^[a-z0-9]\w*$/.test(parent)) throw new Error('Expected a parent predicate system name');
                    this.environment.parents ??= new Map();
                    this.environment.parents.set(name,parent);
                }
                // A new definition owns its own syntax, rather than inheriting a replaced import.
                this.environment.systems.set(name,new Map());
                body.push(...tokens.slice(i,i + 2),resolve(tokens[open - 1]),resolve(tokens[open]),
                    ...this.collect(tokens.slice(open + 1,end),name),resolve(tokens[end]));
                i = end;
                continue;
            }
            if (depth === 0 && t.lexeme === 'syntax' && tokens[i + 1]?.lexeme === '[') {
                const end = this.close(tokens, i + 1);
                const declaration = tokens.slice(i + 2, end).flatMap(t =>
                    t.kind === 'ATOM' && t.lexeme.length > 1 && t.lexeme.endsWith('/')
                        ? [{ ...t,lexeme:t.lexeme.slice(0,-1) },{ ...t,lexeme:'/' }] : [t]);
                const target = owner ? resolve(this.environment.systems.get(owner)) : this.globals;
                let p = 0;
                while (p < declaration.length) {
                    if (declaration[p++]?.lexeme !== 'opp') throw new Error('Expected opp in syntax declaration');
                    let spacing: 'w' | 'w/o' | undefined;
                    if (declaration[p]?.lexeme === 'w') {
                        p++;
                        spacing = 'w';
                        if (declaration[p]?.lexeme === '/' && declaration[p + 1]?.lexeme === 'o') { p += 2; spacing = 'w/o'; }
                    }
                    let precedence: number | undefined;
                    if (/^\d+$/.test(declaration[p]?.lexeme ?? '')) precedence = Number(declaration[p++]?.lexeme);
                    const associativity = declaration[p++]?.lexeme;
                    const name = declaration[p++]?.lexeme;
                    if (!['yfx', 'xfy', 'xfx', 'fx', 'fy', 'xf', 'yf'].includes(associativity ?? '') || !name ||
                        !/^(?:[a-z]\w*|[0-9]|[=<>!+*\/&?|\-$@#\\'"`]+)$/.test(name) || ['let','def','import','from','syntax','opp'].includes(name) ||
                        declaration[p++]?.lexeme !== '/') throw new Error('Expected opp [priority] yfx|xfy|xfx name/2 or fx|fy|xf|yf name/1.');
                    const arity = Number(declaration[p++]?.lexeme);
                    precedence ??= 550;
                    if (arity !== (associativity?.length === 2 ? 1 : 2) || declaration[p++]?.lexeme !== '.' || precedence < 1 || precedence > 599)
                        throw new Error('Syntax operators require arity 1 for fx|fy|xf|yf, arity 2 for xfx|xfy|yfx, and priority 1 through 599');
                    if (target.has(name)) throw new Error(`Duplicate syntax operator: ${name}`);
                    const spec: SyntaxOperator = { name, arity: arity as 1 | 2, precedence, associativity: associativity as SyntaxOperator['associativity'] };
                    if (spacing) spec.spacing = spacing;
                    if (owner) spec.system = owner;
                    target.set(name,spec);
                }
                if (tokens[end + 1]?.lexeme !== '.') throw new Error("Expected '.' after syntax[...] declaration");
                i = end + 1;
                continue;
            }
            if (['(', '[', '{'].includes(t.lexeme)) depth++;
            if ([')', ']', '}'].includes(t.lexeme)) depth--;
            body.push(t);
        }
        return body;
    }

    expand(): string {
        const body = this.collect(this.tokens);
        const completed = new Set<string>();
        const visiting = new Set<string>();
        const inherit = (name: string) => {
            if (completed.has(name)) return;
            if (visiting.has(name)) throw new Error(`Cyclic predicate system inheritance: ${name}`);
            const own = this.environment.systems.get(name);
            if (!own) throw new Error(`Unknown parent predicate system: ${name}`);
            visiting.add(name);
            const parent = this.environment.parents?.get(name);
            if (parent) {
                inherit(parent);
                const merged = new Map(this.environment.systems.get(parent));
                for (const [word,spec] of own) merged.set(word,spec);
                this.environment.systems.set(name,new Map([...merged].map(([word,spec]) => [word,{...spec,system:name}])));
            }
            visiting.delete(name);
            completed.add(name);
        };
        for (const name of this.environment.parents?.keys() ?? []) inherit(name);
        this.operators = this.inScope(this.scope);
        const output: string[] = [];
        for (let i = 0; i < body.length;) {
            const current = resolve(body[i]);
            if (current.lexeme === 'def') {
                const open = i + 3;
                if (body[open]?.lexeme !== '{') throw new Error('Expected def name := { ... };');
                const end = this.close(body, open);
                const previousScope = this.scope;
                const previousOperators = this.operators;
                this.scope = resolve(body[i + 1]).lexeme;
                this.operators = this.inScope(this.scope);
                output.push(this.text(body.slice(i, open + 1)));
                let start = open + 1;
                let j = start;
                while (j < end) {
                    if (['(', '[', '{'].includes(body[j]?.lexeme ?? '')) { j = this.close(body,j) + 1; continue; }
                    if (body[j]?.lexeme === '.') {
                        output.push(this.clause(body.slice(start,j)) + '.');
                        start = j + 1;
                    }
                    j++;
                }
                if (start !== end) throw new Error("Expected '.' after predicate clause");
                output.push('}');
                this.scope = previousScope;
                this.operators = previousOperators;
                i = end + 1;
            } else if (current.lexeme === 'let' || current.lexeme === 'import') {
                const start = i;
                while (i < body.length && body[i]?.lexeme !== ';') i++;
                if (current.lexeme === 'let') {
                    const open = body.findIndex((t,p) => p >= start && p < i && t.lexeme === '[');
                    const end = this.close(body,open);
                    const terms = this.goals([...this.tokenise('syntaxDomain('),...body.slice(open + 1,end),...this.tokenise(')')])[0];
                    output.push(this.text(body.slice(start,open + 1)),resolve(terms).slice('syntaxDomain('.length,-1),']');
                    continue;
                }
                output.push(this.text(body.slice(start,i)));
            } else if (body[i + 1]?.lexeme === '[') {
                const end = this.close(body,i + 1);
                const inside = body.slice(i + 2,end);
                const previousScope = this.scope;
                const previousOperators = this.operators;
                this.scope = current.lexeme;
                this.operators = this.inScope(this.scope);
                output.push(`${current.lexeme}[${this.query(inside)}]`);
                this.scope = previousScope;
                this.operators = previousOperators;
                i = end + 1;
            } else if (current.lexeme === ';') {
                output.push(';'); i++;
            } else {
                output.push(this.query(body.slice(i)));
                i = body.length;
            }
        }
        return output.join(' ');
    }

    private clause(tokens: readonly token[]): string {
        const implies = tokens.findIndex(t => t.lexeme === '<-');
        const head = implies < 0 ? tokens : tokens.slice(0,implies);
        const heads = this.goals(head);
        if (heads.length !== 1) throw new Error('Expected a single predicate clause head');
        if (implies < 0) return resolve(heads[0]);
        return `${heads[0]} <- ${this.goals(tokens.slice(implies + 1)).join(',')}`;
    }

    private query(tokens: readonly token[]): string {
        const goals = this.goals(tokens);
        if (goals.length === 1 && !/^(?:~|[a-z]\w*\s*:)/.test(resolve(goals[0])) && (resolve(goals[0]).match(/\(/g)?.length ?? 0) === 1) return resolve(goals[0]);
        const variables = [...new Set(tokens.filter(t => t.kind === 'VAR').map(t => t.lexeme))];
        return `${this.fresh('syntaxExpression')}(${variables.join(',')}) <- ${goals.join(',')}`;
    }

    private goals(tokens: readonly token[]): string[] {
        const specs = new Map(this.operators);
        // Qualified calls may select syntax which is not imported globally.
        for (let i = 0; i < tokens.length - 1; i++) if (tokens[i + 1]?.lexeme === ':')
            for (const [name,spec] of this.inScope(tokens[i]?.lexeme)) specs.set(name,spec);
        let firstError: unknown;
        for (const pieces of joinedTokenizations(tokens.map((t,i) => ({
            value: t.lexeme, kind: t.kind, start: t.start ?? -i * 2 - 2, end: t.end ?? -i * 2 - 1
        })), specs)) {
            const expanded = pieces.map(piece => ({
                ...resolve(Tokens.find(t => t.kind === piece.kind)), lexeme: piece.value,
                start: piece.start, end: piece.end, literal: piece.literal ?? false
            }));
            try { return this.parseGoals(expanded); }
            catch (error) { firstError ??= error; }
        }
        throw firstError ?? new Error('Expected a predicate goal');
    }

    private parseGoals(tokens: readonly token[]): string[] {
        let position = 0;
        const at = () => tokens[position]?.lexeme;
        const consume = (value: string) => {
            if (at() !== value) throw new Error(`Expected '${value}' in syntax expression`);
            position++;
        };
        const primary = (): SyntaxTerm => {
            const opening = at();
            if (opening === '(' || opening === '[' || opening === '{') {
                position++;
                // Empty brackets denote the finite-list terminator only in list syntax scopes.
                if (opening === '[' && at() === ']' && this.operators.has('|')) {
                    position++;
                    return { text: 'nil' };
                }
                const result = expression(0);
                consume(opening === '(' ? ')' : opening === '[' ? ']' : '}');
                return { ...result, priority: 0 };
            }
            const prefix = tokens[position]?.literal ? undefined : this.operators.get(at() ?? '');
            const following = this.operators.get(tokens[position + 1]?.lexeme ?? '');
            if (prefix && ['fx','fy'].includes(prefix.associativity) &&
                (!following || ['fx','fy'].includes(following.associativity)) &&
                (['ATOM','VAR','ANY'].includes(tokens[position + 1]?.kind ?? '') || ['[','{'].includes(tokens[position + 1]?.lexeme ?? ''))) {
                if (prefix.ambiguous) throw new Error(`Ambiguous syntax operator '${prefix.name}'; qualify the predicate system`);
                position++;
                const operand = expression(600 - prefix.precedence + (prefix.associativity === 'fx' ? 1 : 0));
                if ((operand.priority ?? 0) > prefix.precedence || (prefix.associativity === 'fx' && operand.priority === prefix.precedence))
                    throw new Error(`Operator '${prefix.name}' requires parentheses at equal or weaker precedence`);
                return { text: prefix.name, operator: prefix, args: [operand], priority: prefix.precedence };
            }
            const t = tokens[position++];
            if (!t || !['ATOM','VAR','ANY'].includes(t.kind)) throw new Error('Expected an operand in syntax expression');
            const result: SyntaxTerm = { text: t.lexeme };
            if (at() === ':') {
                position++;
                const previousOperators = this.operators;
                this.operators = this.inScope(t.lexeme);
                let qualified: SyntaxTerm;
                try { qualified = primary(); }
                finally { this.operators = previousOperators; }
                qualified.qualifier = t.lexeme;
                return qualified;
            }
            if (at() === '(') {
                position++;
                result.args = [];
                while (at() !== ')') {
                    result.args.push(expression(0));
                    if (at() !== ',' && at() !== ')' && tokens[position - 1]?.end === tokens[position]?.start)
                        throw new Error('Adjacent arguments need a comma or whitespace');
                    if (at() === ',') { position++; if (at() === ')') throw new Error('Expected argument after comma'); }
                    if (position >= tokens.length) throw new Error("Missing closing ')' in syntax expression");
                }
                position++;
            }
            return result;
        };
        const expression = (minimum: number): SyntaxTerm => {
            let left = primary();
            while (position < tokens.length) {
                const t = resolve(tokens[position]);
                const spec = t.literal ? undefined : (left.qualifier ? this.environment.systems.get(left.qualifier)?.get(t.lexeme) : undefined)
                    ?? this.operators.get(t.lexeme);
                if (!spec || ['fx','fy'].includes(spec.associativity)) break;
                if (spec.ambiguous) throw new Error(`Ambiguous syntax operator '${spec.name}'; qualify the predicate system`);
                const strength = 600 - spec.precedence;
                if (strength < minimum) break;
                const leftPriority = left.priority ?? 0;
                if (leftPriority > spec.precedence || (leftPriority === spec.precedence && spec.associativity.startsWith('x')))
                    throw new Error(`Operator '${spec.name}' requires parentheses at equal or weaker precedence`);
                position++;
                const qualifier = left.qualifier;
                const operand = { ...left };
                delete operand.qualifier;
                const args = [operand];
                if (spec.arity === 2) {
                    const right = expression(strength + (spec.associativity.endsWith('y') ? 0 : 1));
                    if ((right.priority ?? 0) > spec.precedence || (right.priority === spec.precedence && spec.associativity.endsWith('x')))
                        throw new Error(`Operator '${spec.name}' requires parentheses at equal or weaker precedence`);
                    args.push(right);
                }
                left = { text: spec.name, operator: spec, args, priority: spec.precedence };
                if (qualifier) left.qualifier = qualifier;
            }
            return left;
        };
        const call = (node: SyntaxTerm, args: readonly string[]) => {
            const owner = node.qualifier ?? (node.operator?.system !== this.scope ? node.operator?.system : undefined);
            return `${owner ? owner + ' : ' : ''}${node.text}(${args.join(',')})`;
        };
        // Nested operators construct ordinary compound terms; only the outer goal is called.
        const lower = (node: SyntaxTerm): string => {
            if (node.args) return `${node.text}(${node.args.map(lower).join(',')})`;
            return node.text;
        };
        const result: string[] = [];
        while (position < tokens.length) {
            const negated = at() === '~';
            if (negated) position++;
            const node = expression(0);
            if (at() === ':=') throw new Error(':= is only for declarations; use a relation such as C = A op B in predicate code');
            if (!node.args) throw new Error('Expected a predicate call or declared infix relation');
            const args = node.args.map(lower);
            result.push((negated ? '~' : '') + call(node,args));
            if (at() === ',') { position++; if (position === tokens.length) throw new Error('Expected goal after comma'); }
        }
        if (!result.length) throw new Error('Expected a predicate goal');
        return result;
    }
}

/** Compare records, class instances and arrays by their own enumerable properties. */
function objEqual(obj1: unknown, obj2: unknown): boolean {
    const ancestors1 = new Map<object, object>();
    const ancestors2 = new Map<object, object>();

    function equal(a: unknown, b: unknown): boolean {
        if (Object.is(a, b)) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
            return false;
        }
        if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
        if (ancestors1.has(a) || ancestors2.has(b)) {
            return ancestors1.get(a) === b && ancestors2.get(b) === a;
        }

        if (Array.isArray(a)) {
            if (!Array.isArray(b) || a.length !== b.length) return false;
        } else if (Object.prototype.toString.call(a) !== '[object Object]'
            || Object.prototype.toString.call(b) !== '[object Object]') {
            // Built-ins with internal state (such as Map and Date) require identity.
            return false;
        }

        const keys = (value: object): PropertyKey[] => Reflect.ownKeys(value)
            .filter(key => Object.prototype.propertyIsEnumerable.call(value, key));
        const keysA = keys(a);
        const keysB = keys(b);
        if (keysA.length !== keysB.length) return false;

        ancestors1.set(a, b);
        ancestors2.set(b, a);
        try {
            return keysA.every(key => Object.prototype.propertyIsEnumerable.call(b, key)
                && equal(Reflect.get(a, key), Reflect.get(b, key)));
        } finally {
            ancestors1.delete(a);
            ancestors2.delete(b);
        }
    }

    return equal(obj1, obj2);
}
