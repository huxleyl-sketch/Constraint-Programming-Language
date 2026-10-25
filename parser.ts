function parser(code: string, system: constraintSystem) {
    let tree = interpreter(code);
    for (let eLine of tree) {
        var line: Expr = eLine.kind !== 'LINE' ? resolve(eLine.lhs?.[0]) : eLine;
        switch (line.kind) {
            case 'VARIABLE':
                var def = resolve(line.rhs?.[0])
                var lhs = resolve(def.lhs?.[0]);
                var dom = resolve(def.rhs?.[0].rhs);
                var vars = lhs.kind === 'MANY' ?
                    Array.from({ length: Number(resolve(lhs.rhs?.[0]).match) + 1 }, (_, i): string => resolve(lhs.lhs?.[0]).match + i) :
                    [lhs.match];
                for (let name of vars) {
                    system.addVariable({ name, domain: dom })
                }
                break;
            case 'DEFINE':
                var def = resolve(line.rhs?.[0])
                var name = resolve(def.lhs?.[0]).match
                var preds = resolve(def.rhs?.[0].rhs);
                var sys = new predicateSystem();
                system.predSystems.set(name, parsePreds(preds, sys));
                break;
            case 'QUERY':
                var sysKey = resolve(line.lhs?.[0]).match
                var pred = resolve(line.rhs?.[0]);
                var predKey = resolve(pred.lhs?.[0]).match;
                var vars = resolve(pred.rhs).filter((e): boolean => e.kind !== 'ANY').map((e): string => e.match);
                let con = system.createConstraint(vars, { sys: sysKey, pred: predKey })
                system.searchConstraints(resolve(con))
                system.addConstraint(vars, { sys: sysKey, pred: predKey });
                break;
            default:
                throw new Error(`No tokens of type VARIABLE, DEFINE, QUERY`)

        }
    }

    logToConsole(system.returnAssignment());
}

function parsePreds(tree: Expr[], system: predicateSystem): predicateSystem {

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
