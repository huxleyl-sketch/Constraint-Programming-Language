type Dep = { pred: Expr; args: Expr[]; not: boolean };
type Deps = Dep[];

class predicateSystem {
    preds: Lookup<predicate>;
    constructor() {

        this.preds = new Lookup();
    }

    addPredicate(name: Expr, args: Expr[], deps: Deps = []) {
        //only add predicate if it is not in preds
        if (!this.preds.has(name))
            this.preds.set(name, new predicate(name.match, this))
        //sort dependencies so that ones with not are last (beause they can't be solved)
        let s_deps = deps.sort((a, b): number => {
            let aVal = a.not ?? false ? 1 : 0;
            let bVal = b.not ?? false ? 1 : 0;
            return aVal - bVal;
        })
        //add definition to predicate
        this.preds.get(name)?.addDefinition(args, this, s_deps);
    }
    /**
     * Find predicate and return it
     */
    grabPred(name: Expr | string): predicate {
        return resolve(this.preds.grab(name), name);
    }
    /**
     * Can handle pure string input, then uses parseCheck.
     */
    parseQuery(Input: Expr[] | string): false | Expr[] {
        //convert input to tokens
        let Inp = typeof Input === 'string' ? interpreter(Input) : Input;
        if (Inp[0].kind !== 'PRED') throw new Error(`Input isn't predicate, got ${Inp[0].kind} instead`);
        //find predicate key
        let predKey = resolve(Inp[0].lhs?.[0])
        //find raw args
        let args = resolve(Inp[0].rhs);
        
        return this.parseCheck(predKey,args)
    }
    /**
     * Cannot handle pure string input, use parseQuery for in code queries.
     */
    parseCheck(predKey: string | Expr, args: Expr[]): false | Expr[] {
        //find predicate
        let pred = this.grabPred(predKey);
        //return result of predicate query
        let query = pred.query(args);
        for (let r = query.next(); !r.done; r = query.next()) {
            if (r.value) return r.value;
        }
        return false;
    }
}
class predicate {
    defs: definition[];
    key: string;
    system: predicateSystem;

    constructor(key: string, system: predicateSystem) {

        this.defs = []; //Definitions: [args, [predicate, args]].
        this.key = key;
        this.system = system
    }
    /**
     * Adds definitions to Defs.
     */
    addDefinition(args: Expr[], system: predicateSystem, deps: Deps) {
        this.defs.push(new definition(args, deps, system));
    }
    /**
     * Tests Args against each Definition of the Definitions.
     */
    *query(Inputs: Expr[] | string): Generator<false | Expr[], void, unknown> {
        let Inps = typeof Inputs === 'string' ? resolve(interpreter(Inputs), Inputs) : Inputs

        for (let def of this.defs) {
            if (debug) logToConsole('Pred: ' + this.key)
            let q = def.test(Inps);

            //if query fails test next definition
            if (!q) continue;
            //return successful definition
            yield q;
        }
        yield false;
    }
}
class definition {
    args: Expr[];
    deps: Deps;
    system: predicateSystem;

    constructor(args: Expr[], deps: Deps, system: predicateSystem) {
        this.args = args; //Arguements.
        this.deps = deps; //Dependencies.
        this.system = system
    }

    /**

     * Evaluates the definition from the Inputs.

     */
    test(Inps: Expr[]): false | Expr[] {
        let vars: Lookup<Expr> = new Lookup()

        //both arguments are the same length. (Heuristic)
        if (Inps.length != this.args.length) { return false }

        //every argument evaluates with each input, and variables are updated accordingly.
        if (!this.args.every((arg, i): boolean => this.unify(vars, arg, Inps[i]))) { return false }

        let v = this.assign(this.deps, vars)

        if (!v) return false;

        //finds all updated values of args and returns them
        return this.mapExprTree(this.args, v);
    }
    /**
     * Map an Expr tree by replacing VAR/ATOM nodes via a lookup.
     */
    mapExprTree(node: Expr | Expr[], lookup: Lookup<Expr>): Expr[] {
        if (Array.isArray(node)) return node.flatMap((n): Expr[] => this.mapExprTree(n, lookup));
        const mapped = lookup.grab(node) ?? node;
        if (mapped.lhs == null && mapped.rhs == null) return [mapped];
        const lhs = mapped.lhs == null ? null : (this.mapExprTree(mapped.lhs, lookup));
        const rhs = mapped.rhs == null ? null : (this.mapExprTree(mapped.rhs, lookup));
        return [new Expr(mapped.match, mapped.kind, lhs, rhs)];
    }
    /**
     * Unify a and b and update the mapping accordingly
     */
    unify(map: Lookup<Expr>, a: Expr, b: Expr, over: boolean = false): boolean {
        let ret = undefined;
        if (a.kind === 'ANY' || b.kind === 'ANY') ret = true;
        let A = resolve(map.grab(a), a);
        let B = resolve(map.grab(b), b);
        switch (`${A.kind}|${B.kind}`) {
            case 'ATOM|ATOM': ret = A.match === B.match; break;
            case 'ATOM|VAR': map.set(B, A); ret = true; break;
            case 'ATOM|PRED': ret = false; break;
            case 'VAR|ATOM': map.set(A, B); ret = true; break;
            case 'VAR|VAR': map.set(A, B); ret = true; break;
            case 'VAR|PRED': map.set(A, B); ret = true; break;
            case 'PRED|ATOM': ret = false; break;
            case 'PRED|VAR': map.set(B, A); ret = true; break;
            case 'PRED|PRED':
                const Alhs = resolve(A.lhs?.[0])
                const Blhs = resolve(B.lhs?.[0])
                if (!this.unify(map, Alhs, Blhs, true)) { ret = false; break; }
                const Arhss = resolve(A.rhs)
                const Brhss = resolve(B.rhs)
                if (Arhss.length !== Brhss.length) { ret = false; break; }
                ret = Arhss.every((Arhs, i): boolean => this.unify(map, Arhs, Brhss[i], true));
                break;
        }
        if (debug && !over) {
            let lA = A.lhs ? printExpr(A.lhs) : A.match
            let rA = A.rhs ? `(${printExpr(A.rhs)})` : ''
            let lB = B.lhs ? printExpr(B.lhs) : B.match
            let rB = B.rhs ? `(${printExpr(B.rhs)})` : ''
            logToConsole(`Unify: ${lA}${rA} - ${lB}${rB} - ${A.kind}|${B.kind}, ${ret}`)
        }
        if (typeof ret === 'boolean') return ret;
        //Something failed
        throw new Error(`Couldn't unify ${A.kind} and ${B.kind}`)
    }
    /**
     * finds an assignment given dependencies in Arr, and a current assignment mapping.
     */
    assign(Arr: Deps, Assignment: Lookup<Expr>): false | Lookup<Expr> {
        //escape condition, no more dependencies, return assignment
        if (Arr.length == 0) { return Assignment; }
        //find information about current dependency
        let [dep] = Arr;
        let arr = Arr.slice(1);
        let pred = resolve(this.system.preds.grab(dep.pred), dep.pred);
        let not = dep.not ?? false;

        /**

         * update args from assignment

         */
        let args = this.mapExprTree(dep.args, Assignment)
        //query predicate with args
        let query = pred.query(args);

        if (not) {
            //succeed only if no solution exists
            for (let r = query.next(); !r.done; r = query.next()) {
                if (r.value) return false;
            }
            return this.assign(arr, Assignment);
        }
        //foreach yeild of query
        for (let r = query.next(); !r.done; r = query.next()) {
            //find the next set of values
            let t = r.value;
            //if there are no more continue
            if (!t) continue;
            //copy assignment
            let ass = new Lookup(Assignment);
            //apply current bindings
            if (!t.every((val, i): boolean => this.unify(ass, args[i], val))) continue;
            //test current bindings
            let back = this.assign(arr, ass);
            //if there are no other solutions continue
            if (!back) continue;
            //if there are return the solution
            return back;
        }
        //there is no solution
        return false;
    }

}

class Lookup<T extends object> {
    map: Record<string, T>;

    constructor(Lookup: Lookup<T> | { map: {} } = { map: {} }) {
        let l = structuredClone(Lookup)

        this.map = l.map;
    }
    /**
     * Find A in keys, if found sets
     */
    set(key: Expr | string, val: T) {

        let sKey = typeof key === 'string' ? key : key.match;

        this.map[sKey] = val;
    }
    /**
     * gets the key from the map
     * returns undefined if key does not appear in Lookup
     */
    get(key: Expr | string): T | undefined {
        let sKey = typeof key === 'string' ? key : key.match;
        //return val
        return this.map[sKey];
    }

    /**
     * Note: the original overloads promise T | undefined, but a missing expression key
     * is returned unchanged as Expr. The overloads retain that existing limitation.
     */
    grab(key: Expr | string): T | undefined;
    grab(key: Expr | T | string): T | undefined;
    grab(key: Expr | T | string): Expr | T | undefined {

        if (!(typeof key === 'string' || 'match' in key)) return key;
        let sKey = typeof key === 'string' ? key : (key as Expr).match;

        let val = this.get(sKey)
        if (!val) return typeof key === 'string' ? undefined : key;
        let nVal = val
        return this.grab(nVal) ?? this.map[sKey];
    }

    has(key: Expr | string): boolean {
        let sKey = typeof key === 'string' ? key : key.match;
        return !!this.map[sKey]
    }
}
