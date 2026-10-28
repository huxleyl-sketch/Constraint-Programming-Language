type TokenDefinition = { kind: string; regex: RegExp; type: string; pre: number };
type tokenTemp = TokenDefinition & { kind: TokenKind };
type token = tokenTemp & { lexeme: string };

const Tokens = [
    //{ kind: "DOMAIN",       regex: /dom/y,       type: "fx", pre: 1800},
    { kind: "VARIABLE", regex: /let/y, type: "fx", pre: 1800 },
    { kind: "DEFINE", regex: /def/y, type: "fx", pre: 1800 },

    { kind: "DEF", regex: /:=/y, type: "xfx", pre: 1500 },

    // { kind: "ATOM",         regex: /[a-z]\w*/y,  type: "x",   pre: 0},
    // { kind: "VAR",          regex: /[A-Z]\w*/y,  type: "x",   pre: 0},
    { kind: "MANY", regex: /\^/y, type: "xfx", pre: 1000 },

    { kind: "RELATION", regex: /{/y, type: "o", pre: 0 },
    { kind: "RELATION", regex: /}/y, type: "c", pre: 0 },

    // { kind: "CONST",        regex: /</y,         type: "o",  pre: 1800},
    // { kind: "CONSTEND",     regex: />/y,         type: "c",  pre: 1800},

    // { kind: "ARR",        regex: /\[/y,         type: "xfx",  pre: 1600},
    // { kind: "ARREND",     regex: /\]/y,         type: "xf",  pre: 1600},

    { kind: "CON", regex: /\|/y, type: "xfx", pre: 1200 },

    { kind: "QUERY", regex: /\[/y, type: "xfo", pre: 1199 },
    { kind: "QUERY", regex: /\]/y, type: "c", pre: 1199 },

    { kind: "LINE", regex: /\;/y, type: "xf", pre: 2000 },

    //=============================================================

    { kind: "IMPLIES", regex: /<-/y, type: "xfx", pre: 800 },

    { kind: "NOT", regex: /~/y, type: "fx", pre: 200 },

    { kind: "ATOM", regex: /[a-z0-9]\w*/y, type: "x", pre: 0 },
    { kind: "VAR", regex: /[A-Z]\w*/y, type: "x", pre: 0 },
    { kind: "ANY", regex: /\_/y, type: "x", pre: 0 },

    { kind: "PRED", regex: /\(/y, type: "xfo", pre: 500 },
    { kind: "PRED", regex: /\)/y, type: "c", pre: 500 },
    { kind: "COMMA", regex: /,/y, type: "x", pre: 500 },

    { kind: "CLAUSE", regex: /\./y, type: "xf", pre: 900 },

] as const satisfies readonly TokenDefinition[];

type TokenKind = typeof Tokens[number]["kind"];

//need to flip yfx and yf

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

function interpreter(code: string): Array<Expr> {

    //find Expr precedence
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

    //Sort Tokens
    let sTokens = Tokens.filter((t): boolean => "pre" in t).sort((a, b): number => b.pre - a.pre)

    const replaceTokens = [
        { kind: "COMMENT", regex: /%.*(?=\n)/g, replace: "" },
        { kind: "NEWLINE", regex: /\n+/g, replace: "" },
        { kind: "WHITESPACE", regex: /[ ]+/g, replace: " " },
        //{ kind: "SEPARATOR", regex: /,/g,   replace: " "},

    ];

    //Replace all replaceTokens from value
    for (let token of replaceTokens) {
        code = code.replaceAll(token.regex, token.replace);
    }

    function tokenise(code: string): token[] {
        //if there is no more code end recurrsion
        if (!code) return [];
        //skip spaces
        if (code[0] == ' ') return tokenise(code.slice(1));
        for (let token of Tokens) {
            //copy regex
            let regex = new RegExp(token.regex);
            //set last index
            regex.lastIndex = 0;
            //find the match
            const match = regex.exec(code)
            //if the match doesn't exist test next token
            if (!match) continue;
            //tokenise the rest of the code
            let tokens = tokenise(code.slice(match[0].length))
            //return the list of tokens with the new token at the head
            return [{ lexeme: match[0], ...token }, ...tokens];

        }
        //throw error when there are no token matches
        throw new Error(`Unexpected Token: ${code[0]}`)
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
            //if(debug) logToConsole(`Head: {type: ${head.type},kind: ${head.kind},pre: ${head.pre},lex: ${head.lexeme}}  `)
            switch (head.type.at(0)) {
                case 'x':
                case 'y':
                    var min = Exprs.findLastIndex((expr): boolean => getPrecedence(expr.kind) >= head.pre)
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
            //throw new Error(`no type match, ${head.type}`)

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
    let tokenised = tokenise(code)
    if (debug) console.log(tokenised)
    let ASTTree = ASTBuild(tokenised);
    let fASTTree = removeComma(ASTTree);
    if (debug) console.log(fASTTree)
    return fASTTree;
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
