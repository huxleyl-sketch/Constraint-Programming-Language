type variable = { name: string; domain: domain; };
type domain = Array<Expr>;
type constraint = { scope: variable[]; rel: { sys: string; pred: string; }; };
type Assignment = { key: string; val: Expr }[];
type Solver = (vars: variable[], cons: constraint[], systems: Map<string, predicateSystem>) => Assignment | false;
class constraintSystem {
    algorithm: Solver;
    variables: Map<string, variable>;
    constraints: constraint[];
    predSystems: Map<string, predicateSystem>;
    constructor(algorithm: Solver) {
        this.algorithm = algorithm;

        this.variables = new Map(); //Variable Array

        this.constraints = []; //Constraint Array

        this.predSystems = new Map();
    }

    addVariable(variable: variable) { this.variables.set(variable.name, variable); }

    searchVariables = (variable: variable): boolean =>
        this.variables.has(variable.name);

    searchConstraints = (con: constraint): boolean => this.constraints.map((c): string => JSON.stringify(c)).includes(JSON.stringify(con));

    addConstraint(scope: string[], rel: { sys: string; pred: string }) {
        let con = resolve(this.createConstraint(scope, rel))
        if (!this.searchConstraints(con))
            this.constraints.push(con);
    }

    createConstraint(scope: string[], rel: { sys: string; pred: string }): constraint | undefined {
        let element = '';
        try {

            let vars = scope.map((e): variable => {
                element = e;
                return resolve(this.variables.get(e))
            });
            return { scope: vars, rel };
        } catch (e) {
            logToConsole(`${element} is not defined as a variable`);
        }
    }

    parseSystem(code: string): boolean {
        try {
            parser(code, this);
            return true;
        } catch (e) {
            return false;
        }
    }

    returnAssignment(): string | false {
        return (this.findAssignment() as Assignment | false) ? (this.findAssignment() as Assignment).map((e): string => `${e.key} => ${printExpr(e.val)}`).join(`\n- `) : false
    }

    findAssignment(): Assignment | false { return this.algorithm([...this.variables.values()], this.constraints, this.predSystems); }
}

function printExpr(assignment: Expr | Expr[]): string {
    if (!Array.isArray(assignment)) assignment = [assignment];

    return assignment.map((e): string => {
        if (e.lhs == null && e.rhs == null) return e.match;
        const lhs = e.lhs == null ? null : printExpr(e.lhs);
        const rhs = e.rhs == null ? null : printExpr(e.rhs);
        return `${lhs}(${rhs})`;
    }).join(",");
}
