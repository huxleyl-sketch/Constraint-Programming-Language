//@ts-check
/**
 * @typedef {{lexeme: string, kind: string, regex: RegExp, type: string, pre: number}} token
 * @typedef {{kind: string, regex: RegExp, type: string, pre: number}} tokenTemp
 * */

//need to flip yfx and yf




class Expr{
    /**
     * @param {string} match
     * @param {tokenTemp} token
     * @param {Array<Expr> | null} lhs 
     * @param {Array<Expr> | null} rhs 
     */
    constructor(match,token,lhs = null,rhs = null){
        this.match = match
        this.token = token;
        this.lhs = lhs;
        this.rhs = rhs;
    }
}

/**
 * 
 * @param {string} code 
 * @returns {Array<Expr>}
 */
function interpreter(code){
    /**@type {Array<tokenTemp>} */
    const Tokens = [
        //{ kind: "DOMAIN",       regex: /dom/y,       type: "fx", pre: 1800},
        { kind: "VARIABLE",     regex: /let/y,       type: "fx", pre: 1800},
        { kind: "DEFINE",       regex: /def/y,       type: "fx", pre: 1800},
        
        { kind: "DEF",          regex: /:=/y,        type: "xfx",  pre: 1500},
        
        // { kind: "ATOM",         regex: /[a-z]\w*/y,  type: "x",   pre: 0},
        // { kind: "VAR",          regex: /[A-Z]\w*/y,  type: "x",   pre: 0},
        { kind: "MANY",         regex: /\^/y,       type: "xfx",   pre: 1000},
        
        { kind: "RELATION",     regex: /{/y,        type: "o", pre: 0},
        { kind: "RELATION",     regex: /}/y,        type: "c", pre: 0},

        // { kind: "CONST",        regex: /</y,         type: "o",  pre: 1800},
        // { kind: "CONSTEND",     regex: />/y,         type: "c",  pre: 1800},

        // { kind: "ARR",        regex: /\[/y,         type: "xfx",  pre: 1600},
        // { kind: "ARREND",     regex: /\]/y,         type: "xf",  pre: 1600},

        { kind: "CON",          regex: /\|/y,        type: "xfx",  pre: 1200},
        

        { kind: "QUERY",        regex: /\[/y,        type: "xfo", pre: 1199},
        { kind: "QUERY",        regex: /\]/y,        type: "c", pre: 1199},

        
        { kind: "LINE",         regex: /\;/y,       type: "xf",  pre: 2000},

        //=============================================================

        { kind: "IMPLIES",  regex: /<-/y,       type: "xfx",pre: 800},

        { kind: "NOT",      regex: /~/y,        type: "fx", pre: 200},

        { kind: "ATOM",     regex: /[a-z0-9]\w*/y, type: "x",  pre: 0},
        { kind: "VAR",      regex: /[A-Z]\w*/y, type: "x",  pre: 0},
        { kind: "ANY",      regex: /\_/y,       type: "x",  pre: 0},

        { kind: "PRED",   regex: /\(/y,         type: "xfo",pre: 500},
        { kind: "PRED",   regex: /\)/y,         type: "c",  pre: 0},
        { kind: "COMMA",    regex: /,/y,        type: "x",  pre: 500},


        
        { kind: "CLAUSE",  regex: /\./y,       type: "xf",  pre: 900},

    ]
    //Sort Tokens
    let sTokens = Tokens.filter(t => "pre" in t).sort((a,b) => b.pre - a.pre)

    const replaceTokens = [
        { kind: "COMMENT",   regex: /%.*(?=\n)/g, replace: ""},
        { kind: "NEWLINE",   regex: /\n+/g, replace: ""},
        { kind: "WHITESPACE",regex: /[ ]+/g, replace: " "},
        //{ kind: "SEPARATOR", regex: /,/g,   replace: " "},

    ];

    //Replace all replaceTokens from value
    for(let token of replaceTokens){
        code = code.replaceAll(token.regex,token.replace);
    }
    /**
     * 
     * @param {string} code 
     * @returns {Array<token>}
     */
    function tokenise(code){
        //if there is no more code end recurrsion
        if(!code) return [];
        //skip spaces
        if(code[0] == ' ') return tokenise(code.slice(1));
        for(let token of Tokens){
            //copy regex
            let regex = new RegExp(token.regex);
            //set last index
            regex.lastIndex = 0;
            //find the match
            const match = regex.exec(code)
            //if the match doesn't exist test next token
            if(!match) continue;
            //tokenise the rest of the code
            let tokens = tokenise(code.slice(match[0].length))
            //return the list of tokens with the new token at the head
            return [{lexeme: match[0], ...token},...tokens];
            
        }
        //throw error when there are no token matches
        throw new Error(`Unexpected Token: ${code[0]}`)
    }
    /**
     * 
     * @param {token[]} tokens 
     * @returns {Array<Expr>}
     */
    function ASTBuild(tokens){
        /**@type {Expr[]} */
        let Exprs = []
        for(let i = 0; i < tokens.length; i++){
            let head = tokens[i]
            let tail = tokens.slice(i+1);
            /**@type {Expr[] | null} */
            let lhs = null;
            /**@type {Expr[] | null} */
            let rhs = null;

            let rem = Exprs;
            if(head.type === 'x') {
                var expr = new Expr(head.lexeme,head,lhs,rhs)
                Exprs.push(expr);
                continue;
            }
            //if(debug) logToConsole(`Head: {type: ${head.type},kind: ${head.kind},pre: ${head.pre},lex: ${head.lexeme}}  `)
            switch(head.type.at(0)){
                case 'x':
                case 'y':
                    var min = Exprs.findLastIndex(expr => expr.token.pre >= head.pre)
                    if(min === -1){
                        rem = [];
                        lhs = Exprs.slice();
                    }else{
                        rem = Exprs.slice(0,min+1);
                        lhs = Exprs.slice(min+1);
                    }
                    break;
                case 'c':
                    continue;
            }
            switch(head.type.at(-1)){
                case 'x':
                case 'y':
                    var cap = tail.findIndex(token => token.pre >= head.pre)
                    if(cap === -1) cap = tail.length;
                    i += cap;
                    rhs = ASTBuild(tail.slice(0,cap));
                    break;
                case 'o':
                    var depth = 0;
                    var closeIndex = -1;
                    for(let j = 0; j < tail.length; j++){
                        const t = tail[j];
                        if(/o/g.test(t.type)) depth++;
                        if(/c/g.test(t.type)){
                            if(depth === 0){ closeIndex = j; break; }
                            depth--;
                        }
                    }
                    if(closeIndex === -1) throw new Error(`Missing closing 'c' token for 'o' opener, at ${i} from ${head.kind} ${head.type}`);
                    rhs = ASTBuild(tail.slice(0,closeIndex));
                    i += closeIndex;
                    break;
            }
            var expr = new Expr(head.lexeme,head,lhs,rhs)
            rem.push(expr);
            Exprs = rem;
            //throw new Error(`no type match, ${head.type}`)

        }
        return Exprs;
    }
    /**
     * 
     * @param {Expr[]} ASTTree 
     * @returns {Expr[]}
     */
    function removeComma(ASTTree){
        return ASTTree.filter(e => e.token.kind !== 'COMMA').map(e => {
            if(e.lhs == null && e.rhs == null) return e;
            const lhs = e.lhs == null ? null : /** @type {Expr[]} */(removeComma(e.lhs));
            const rhs = e.rhs == null ? null : /** @type {Expr[]} */(removeComma(e.rhs));
            return new Expr(e.match, e.token, lhs, rhs);
        })
    }
    let tokenised = tokenise(code)
    if(debug) console.log(tokenised)
    let ASTTree = ASTBuild(tokenised);
    let fASTTree = removeComma(ASTTree);
    if(debug) console.log(fASTTree)
    return fASTTree;
}
/**
 * 
 * @param {Object} obj1 
 * @param {Object} obj2 
 * @returns {boolean}
 */
function objEqual(obj1,obj2){
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}
