//@ts-check
/**
 * @typedef {{name: string, domain: domain}} variable
 * @typedef {Array<Expr>} domain
 * @typedef {{scope: variable[], rel: {sys: string, pred: string}}} constraint
 */
class constraintSystem{
    /**
     * 
     * @param {(vars: variable[],cons: constraint[],systems: Map<string,predicateSystem>) => any} algorithm 
     */
    constructor(algorithm){
        this.algorithm = algorithm;

        /**@type {Map<string,variable>} */
        this.variables = new Map(); //Variable Array

        /**@type {constraint[]} */
        this.constraints = []; //Constraint Array
        /**@type {Map<string,predicateSystem>} */
        this.predSystems = new Map();
    }
    /**
     * 
     * @param {variable} variable 
     */
    addVariable(variable){ this.variables.set(variable.name,variable);}
    /**
     * 
     * @param {variable} variable 
     */
    searchVariables = (variable) => 
        this.variables.has(variable.name);
    /**
     * 
     * @param {constraint} con
     */
    searchConstraints = (con) => this.constraints.map(c => JSON.stringify(c)).includes(JSON.stringify(con));
    /**
     * 
     * @param {string[]} scope
     * @param {{sys: string,pred: string}} rel 
     */
    addConstraint(scope, rel){
        let con = resolve(this.createConstraint(scope,rel))
        if(!this.searchConstraints(con))
            this.constraints.push(con);
    }
    /**
     * 
     * @param {string[]} scope 
     * @param {{sys: string, pred: string}} rel 
     * @returns 
     */
    createConstraint(scope, rel){
        let element = '';
        try{

            let vars = scope.map(e => {
                element = e;
                return resolve(this.variables.get(e))
            });
            return {scope: vars, rel};
        }catch(e){
            logToConsole(`${element} is not defined as a variable`);
        }
    }
    /**
     * 
     * @param {string} code 
     * @returns
     */
    parseSystem(code){
        try{
            parser(code,this);
            return true;
        }catch(e){
            return false;
        }
    }
    /**
     * 
     * @param {Expr | Expr[]} assignment 
     * @returns {string}
     */
    formAssignment(assignment){
        if(!Array.isArray(assignment)) assignment = [assignment];

        return assignment.map(e => {
            if(e.lhs == null && e.rhs == null) return e.match;
            const lhs = e.lhs == null ? null : this.formAssignment(e.lhs);
            const rhs = e.rhs == null ? null : this.formAssignment(e.rhs);
            return `${lhs}(${rhs})`;
        }).join(",");
    }
    returnAssignment(){
        return this.findAssignment() ? this.findAssignment().map(e => `${e.key} => ${this.formAssignment(e.val)}`).join(`\n- `) : false
    }
    /**
     * @returns {{key: string, val: Expr}[]}
     */
    findAssignment(){return this.algorithm([...this.variables.values()],this.constraints,this.predSystems);}
}


