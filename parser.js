//@ts-check

/**
 * 
 * @param {string} code 
 * @param {constraintSystem} system 
 */
function parser(code,system){
    let tree = interpreter(code);
    for(let eLine of tree){
        /**@type {Expr} */
        var line = eLine.token.type !== 'LINE' ? resolve(eLine.lhs?.[0]) : eLine;
        switch(line.token.kind){
            case 'VARIABLE':
                var def = resolve(line.rhs?.[0])
                var lhs = resolve(def.lhs?.[0]);
                var dom = resolve(def.rhs?.[0].rhs);
                var vars = lhs.token.kind === 'MANY' ? 
                Array.from({length:Number(resolve(lhs.rhs?.[0]).match)+1}, (_, i) => resolve(lhs.lhs?.[0]).match + i):
                [lhs.match];
                for(let name of vars){
                    system.addVariable({name, domain: dom})
                }
            break;
            case 'DEFINE':
                var def = resolve(line.rhs?.[0])
                var name = resolve(def.lhs?.[0]).match
                var preds = resolve(def.rhs?.[0].rhs);
                var sys = new predicateSystem();
                system.predSystems.set(name,parsePreds(preds,sys));
            break;
            case 'QUERY':
                var sysKey = resolve(line.lhs?.[0]).match
                var pred = resolve(line.rhs?.[0]);
                var predKey = resolve(pred.lhs?.[0]).match;
                var vars = resolve(pred.rhs).filter(e => e.token.kind !== 'ANY').map(e => e.match);
                let con = system.createConstraint(vars, {sys: sysKey, pred: predKey})
                system.searchConstraints(resolve(con))
                system.addConstraint(vars, {sys: sysKey, pred: predKey});
            break;
            default:
                throw new Error(`No tokens of type VARIABLE, DEFINE, QUERY`)

        }
    }
    
    logToConsole(system.returnAssignment());
}



/**
 * @param {Expr[]} tree
 * @param {predicateSystem} system 
 * @returns {predicateSystem}
 */
function parsePreds(tree,system){

    for(let clause of tree){
        if(clause.token.kind !== 'CLAUSE') throw new Error(`Expected token CLAUSE, got ${clause.token.kind} instead`);
        //find node
        let node = resolve(clause.lhs?.[0]);
        switch(node.token.kind){
            case 'PRED':
                //create predicate without dependencies
                createPred(node);
                break;
            case 'IMPLIES':
                //create predicate with dependencies
                createDPred(node);
                break;
            default:
                throw new Error(`node type expected PRED or IMPLIES, got ${node.token.kind}`)
        }

    }
    /**
     * From predEnd
     * @param {Expr} pred
     * @param {Deps} [deps = []]
     */
    function createPred(pred,deps = []){
        if(pred.token.kind !== 'PRED') throw new Error(`Expected token PRED, got ${pred.token.kind} instead`)
        //find predicate atom
        let name = resolve(pred.lhs?.[0])
        //find predicate args
        let args = resolve(pred.rhs)
        system.addPredicate(name,args,deps)
    }
    /**
     * From implies
     * @param {Expr} implies
     */
    function createDPred(implies){
        if(implies.token.kind !== 'IMPLIES') throw new Error(`Expected token IMPLIES, got ${implies.token.kind} instead`)
        //find the predEnd token
        let predEnd = resolve(implies.lhs?.[0]);
        //run parse dependencies
        let deps = resolve(implies.rhs).map(dep => resolve(parseDep(dep)));
        /**
         * parse a predicate with dependencies
         * @param {Expr} cur 
         * @returns {Dep}
         */
        function parseDep(cur){
            if(!cur) throw new Error(`Expected rhs, ${cur}`)
            switch(cur.token.kind){
                case 'NOT':
                    //change not of the predicate to true
                    var rhs = resolve(cur.rhs?.[0])
                    var dep = parseDep(rhs);
                    dep.not = true;
                    return dep;
                case 'PRED':
                    //find the predicate Atom
                    var predInit = resolve(cur.lhs?.[0])
                    var pred = predInit.token.kind === 'NOT' ? resolve(predInit.rhs?.[0]) : predInit
                    //find the predicate arguments
                    var args = resolve(cur.rhs);
                    return {pred, args, not: predInit.token.kind === 'NOT'}
            }
            throw new Error(`Unexpected token: ${cur}`)
        }
        createPred(predEnd,deps);
    }
    return system;
}
/**
 * resolves value that could return nullish
 * @template A
 * 
 * @param {A | null | undefined} val 
 * @param {any} inp
 * @returns {A}
 */
function resolve(val,inp = val){
    if(val == null) throw new Error(`${val} was nullish from ${inp}`)
    return val;
}
