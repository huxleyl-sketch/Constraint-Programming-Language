type VariableId = string;
type domain = readonly Expr[];
interface Constraint {
    readonly scope: readonly VariableId[];
    readonly relation: { readonly system: string; readonly predicate: string };
}
type Domains = ReadonlyMap<VariableId, domain>;
type Assignment = readonly { readonly key: VariableId; readonly val: Expr }[];
interface Problem {
    readonly constraints: readonly Constraint[];
    check(constraint: Constraint, values: readonly Expr[]): boolean;
}
type Solver = (problem: Problem, domains: Domains) => Assignment | false;

/** Build a problem here; solvers receive a readonly problem interface and separate domain state. */
class constraintSystem implements Problem {
    readonly algorithm: Solver;
    private readonly initialDomains = new Map<VariableId, domain>();
    private readonly constraintList: Constraint[] = [];
    private readonly predicateSystems = new Map<string, predicateSystem>();

    constructor(algorithm: Solver) {
        this.algorithm = algorithm;
    }

    get domains(): Domains { return new Map(this.initialDomains); }
    get constraints(): readonly Constraint[] { return Object.freeze([...this.constraintList]); }

    addVariable(name: VariableId, values: domain) {
        this.initialDomains.set(name, Object.freeze([...values]));
    }

    addPredicateSystem(name: string, system: predicateSystem) {
        this.predicateSystems.set(name, system);
    }

    searchVariables(name: VariableId): boolean {
        return this.initialDomains.has(name);
    }

    searchConstraints(con: Constraint): boolean {
        return this.constraintList.some((existing): boolean => objEqual(existing, con));
    }

    addConstraint(scope: readonly VariableId[], relation: Constraint["relation"]) {
        const con = resolve(this.createConstraint(scope, relation));
        if (!this.searchConstraints(con)) this.constraintList.push(con);
    }

    createConstraint(scope: readonly VariableId[], relation: Constraint["relation"]): Constraint | undefined {
        const missing = scope.find((name): boolean => !this.initialDomains.has(name));
        if (missing !== undefined) {
            logToConsole(`${missing} is not defined as a variable`);
            return undefined;
        }
        return Object.freeze({ scope: Object.freeze([...scope]), relation: Object.freeze({ ...relation }) });
    }

    parseSystem(code: string): boolean {
        try { parser(code, this); return true; }
        catch { return false; }
    }

    returnAssignment(): string | false {
        const assignment = this.findAssignment();
        return assignment === false ? false : assignment.map((entry): string =>
            `${entry.key} => ${printExpr(entry.val)}`).join(`\n- `);
    }

    check(constraint: Constraint, values: readonly Expr[]): boolean {
        const system = resolve(this.predicateSystems.get(constraint.relation.system));
        return !!system.parseCheck(constraint.relation.predicate, values);
    }

    findAssignment(): Assignment | false {
        return this.algorithm(this, this.domains);
    }
}

function printExpr(assignment: Expr | readonly Expr[]): string {
    const expressions: readonly Expr[] = "kind" in assignment ? [assignment] : assignment;

    return expressions.map((e): string => {
        if (e.lhs == null && e.rhs == null) return e.match;
        const lhs = e.lhs == null ? null : printExpr(e.lhs);
        const rhs = e.rhs == null ? null : printExpr(e.rhs);
        return `${lhs}(${rhs})`;
    }).join(",");
}
