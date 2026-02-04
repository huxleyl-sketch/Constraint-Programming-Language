//@ts-check

/**
 * @typedef {{pred: Expr, args: Expr[],not: boolean}} Dep
 * @typedef {Array<{pred: Expr, args: Expr[],not: boolean}>} Deps
*/
class predicateSystem{
    constructor(){
        /**@type {Lookup<predicate>} */
        this.preds = new Lookup();
    }
    /**
     * 
     * @param {Expr} name 
     * @param {Expr[]} args 
     * @param {Deps} [deps = []]
     */
    addPredicate(name, args, deps = []){
        //only add predicate if it is not in preds
        if(!this.preds.has(name))
            this.preds.set(name,new predicate(name.match,this))
        //sort dependencies so that ones with not are last (beause they can't be solved)
        let s_deps = deps.sort((a,b) => {
            let aVal = a.not ?? false ? 1 : 0;
            let bVal = b.not ?? false ? 1 : 0;
            return aVal - bVal;
        })
        //add definition to predicate
        this.preds.get(name)?.addDefinition(args,this,s_deps);
    }
    /**
     * Find predicate and return it
     * @param {Expr | string} name 
     * @returns {predicate}
     */
    grabPred(name){
        return resolve(this.preds.grab(name),name);
    }
    /**
     * 
     * @param {Expr[] | string} Input 
     */
    parseQuery(Input){
        //convert input to tokens
        let Inp = typeof Input === 'string' ? interpreter(Input) : Input;
        if(Inp[0].token.kind !== 'PRED') throw new Error(`Input isn't predicate, got ${Inp[0].token.kind} instead`);
        //find predicate key
        let predKey = resolve(Inp[0].lhs?.[0])
        //find raw args
        let args = resolve(Inp[0].rhs);
        //find predicate
        let pred = this.grabPred(predKey);
        //return result of predicate query
        let query = pred.query(args);
        for (let r = query.next(); !r.done; r = query.next()) {
            if(r.value) return r.value;
        }
        return false;
    }
    /**
     * @param {string} predKey 
     * @param {Expr[]} args
     */
    parseCheck(predKey,args){
        //find predicate
        let pred = this.grabPred(predKey);
        //return result of predicate query
        let query = pred.query(args);
        for (let r = query.next(); !r.done; r = query.next()) {
            if(r.value) return r.value;
        }
        return false;
    }
}
class predicate{
    /**
     * @param {string} key
     * @param {predicateSystem} system 
     */
    constructor(key,system){
        /**@type {Array<definition>} */
        this.defs = []; //Definitions: [args, [predicate, args]].
        this.key = key;
        this.system = system
    }
    /**
     * Adds definitions to Defs.
     * @param {Expr[]} args
     * @param {Deps} deps
     * @param {predicateSystem} system
     */
    addDefinition(args, system ,deps){
        this.defs.push(new definition(args, deps, system));
    }
    /**
     * Tests Args against each Definition of the Definitions.
     * @param {Expr[] | string} Inputs
     * @yields {false | args}
     */
    *query(Inputs) {
        let Inps = typeof Inputs === 'string' ? resolve(interpreter(Inputs),Inputs) : Inputs
        
        for(let def of this.defs){
            if(debug) logToConsole('Pred: ' + this.key)
            let q = def.test(Inps);

            //if query fails test next definition
            if(!q) continue;
            //return successful definition
            yield q;
        }
        yield false;
    }
}
class definition{
    /**
     * @param {Expr[]} args 
     * @param {Deps} deps 
     * @param {predicateSystem} system
     */
    constructor(args, deps,system){
        this.args = args; //Arguements.
        this.deps = deps; //Dependencies.
        this.system = system
    }
    
    /**
     * Evaluates the definition from the Inputs.
     * @param {Expr[]} Inps
     * @returns {false | Expr[]}
     */
    test(Inps) {
        /**@type {Lookup<Expr>} */
        let vars = new Lookup()
        
        //both arguments are the same length. (Heuristic)
        if(Inps.length != this.args.length){return false} 

        //every argument evaluates with each input, and variables are updated accordingly.
        if(!this.args.every((arg,i) => this.unify(vars,arg,Inps[i]))){return false}

        let v = this.assign(this.deps,vars)
        
        if(!v) return false;
        
        //finds all updated values of args and returns them
        return this.mapExprTree(this.args,v);
    }
    /**
     * Map an Expr tree by replacing VAR/ATOM nodes via a lookup.
     * @param {Expr | Expr[]} node
     * @param {Lookup<Expr>} lookup
     * @returns {Expr[]}
     */
    mapExprTree(node, lookup){
        if(Array.isArray(node)) return node.flatMap(n => this.mapExprTree(n, lookup));
        const mapped = lookup.grab(node) ?? node;
        if(mapped.lhs == null && mapped.rhs == null) return [mapped];
        const lhs = mapped.lhs == null ? null : /** @type {Expr[]} */(this.mapExprTree(mapped.lhs, lookup));
        const rhs = mapped.rhs == null ? null : /** @type {Expr[]} */(this.mapExprTree(mapped.rhs, lookup));
        return [new Expr(mapped.match, mapped.token, lhs, rhs)];
    }
    /**
     * Unify a and b and update the mapping accordingly
     * @param {Lookup<Expr>} map
     * @param {Expr} a
     * @param {Expr} b
     * @returns {boolean}
     */
    unify(map,a,b){
        let ret = undefined;
        if (a.token.kind === 'ANY' || b.token.kind === 'ANY') ret = true;
        let A = resolve(map.grab(a),a);
        let B = resolve(map.grab(b),b);
        switch(`${A.token.kind}|${B.token.kind}`){
            case 'ATOM|ATOM': ret = A.match === B.match; break;
            case 'ATOM|VAR': map.set(B,A); ret = true; break;
            case 'ATOM|PRED': ret = false; break;
            case 'VAR|ATOM': map.set(A,B); ret = true; break;
            case 'VAR|VAR': map.set(A,B);map?.set(B,A); ret = true; break;
            case 'VAR|PRED': map.set(A,B); ret = true; break;
            case 'PRED|ATOM': ret = false; break;
            case 'PRED|VAR': map.set(B,A); ret = true; break;
            case 'PRED|PRED':
                const Alhs = resolve(A.lhs?.[0])
                const Blhs = resolve(B.lhs?.[0])
                if(!this.unify(map,Alhs,Blhs)) {ret = false; break;}
                const Arhss = resolve(A.rhs)
                const Brhss = resolve(B.rhs)
                if(Arhss.length !== Brhss.length) {ret = false; break;}
                ret = Arhss.every((Arhs,i) => this.unify(map,Arhs,Brhss[i]));
                break;
        }
        if(debug) {
            let lA = A.lhs?.map(e => e.match).join(',') ?? A.match
            let rA = A.rhs ? `(${A.rhs.map(e => e.match).join(',')})` : ''
            let lB = B.lhs?.map(e => e.match).join(',') ?? B.match
            let rB = B.rhs ? `(${B.rhs.map(e => e.match).join(',')})` : ''
            logToConsole(`Unify: ${lA}${rA} - ${lB}${rB} - ${A.token.kind}|${B.token.kind}, ${ret}`)
        }
        if(typeof ret === 'boolean') return ret;
        //Something failed
        throw new Error(`Couldn't unify ${A.token.kind} and ${B.token.kind}`)
    }
    /**
     * finds an assignment given dependencies in Arr, and a current assignment mapping.
     * @param {Deps} Arr 
     * @param {Lookup<Expr>} Assignment 
     * @returns {false | Lookup<Expr>}
     */
    assign(Arr,Assignment){
        //escape condition, no more dependencies, return assignment
        if(Arr.length == 0) {return Assignment;}
        //find information about current dependency
        let [dep] = Arr;
        let arr = Arr.slice(1);
        let pred = resolve(this.system.preds.grab(dep.pred),dep.pred);
        let not = dep.not ?? false;

        /**
         * update args from assignment
         * @type {Expr[]} */
        let args = this.mapExprTree(dep.args,Assignment)
        //query predicate with args
        let query = pred.query(args);

        if(not){
            //succeed only if no solution exists
            for (let r = query.next(); !r.done; r = query.next()) {
                if(r.value) return false;
            }
            return this.assign(arr,Assignment);
        }
        //foreach yeild of query
        for (let r = query.next(); !r.done; r = query.next()) {
            //find the next set of values
            let t = r.value;  
            //if there are no more continue
            if(!t) continue;
            //copy assignment
            let ass = new Lookup(Assignment);
            //apply current bindings
            if(!t.every((val, i) => this.unify(ass,args[i],val))) continue;
            //test current bindings
            let back = this.assign(arr,ass);
            //if there are no other solutions continue
            if(!back) continue;
            //if there are return the solution
            return back;
        }
        //there is no solution
        return false;
    }

    
}
/**
 * @template {Object} T
 */
class Lookup {
    /**
     * @param {Lookup<T> | {map: {}}} Lookup
     */
    constructor(Lookup = {map: {}}){
        let l = structuredClone(Lookup)
        /**@type {{[key: string]: T}} */
        this.map = l.map;
    }
    /**
     * Find A in keys, if found sets 
     * @param {Expr | string} key 
     * @param {T} val 
     * @returns {void}
     */
    set(key,val){

        let sKey = typeof key === 'string' ? key: key.match;

        this.map[sKey] = val;
    }
    /**
     * gets the key from the map
     * @param {Expr | string} key 
     * @returns {T | undefined} returns undefined if key does not appear in Lookup
     */
    get(key){
        let sKey = typeof key === 'string' ? key: key.match;
        //return val
        return this.map[sKey];
    } 
    /**
     * @overload
     * @param {Expr | string } key 
     * @returns {T | undefined}
     */
    /**
     * @overload
     * @param {Expr | T | string } key 
     * @returns {T | undefined}
     */
    /**
     * @param {Expr | T | string } key 
     * @returns {Expr | T | undefined}
     */
    grab(key){
        
        if(!(typeof key === 'string'|| 'match' in key)) return key;
        let sKey = typeof key === 'string' ? key : key.match;
        
        let val = this.get(sKey)
        if(!val) return typeof key === 'string' ? undefined : key;
        let nVal = val
        return this.grab(nVal) ?? this.map[sKey];
    }
    /**
     * @param {Expr | string} key 
     * @returns {boolean}
     */
    has(key){
        let sKey = typeof key === 'string' ? key: key.match;
        return !!this.map[sKey]
    }
}