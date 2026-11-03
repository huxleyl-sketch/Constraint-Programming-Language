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
type Solutions = Generator<Assignment, void, unknown>;
type Solver = (problem: Problem, domains: Domains) => Solutions;

/** Build a problem here; solvers receive a readonly problem interface and separate domain state. */
class constraintSystem implements Problem {
    syntax: SyntaxOperators = new Map();
    readonly algorithm: Solver;
    private version = 0;

    get revision(): number { return this.version; }
    private readonly initialDomains = new Map<VariableId, domain>();
    private readonly constraintList: Constraint[] = [];
    private readonly predicateSystems = new Map<string, predicateSystem>();
    private readonly importedSystems = new Set<string>();
    private readonly internalSystems = new Set<string>();

    constructor(algorithm: Solver) {
        this.algorithm = algorithm;
    }

    get domains(): Domains { return new Map(this.initialDomains); }
    syntaxEnvironment(): SyntaxEnvironment {
        return {
            systems: new Map([...this.predicateSystems].map(([name,system]) => [name,new Map(system.syntax)])),
            imported: new Set(this.importedSystems),
            parents: new Map([...this.predicateSystems].filter(([name,value]) =>
                !this.importedSystems.has(name) && value.parentName !== undefined)
                .map(([name,value]) => [name,resolve(value.parentName)]))
        };
    }
    get constraints(): readonly Constraint[] { return Object.freeze([...this.constraintList]); }

    addVariable(name: VariableId, values: domain) {
        this.initialDomains.set(name, Object.freeze([...values]));
        this.version++;
    }

    addPredicateSystem(name: string, system: predicateSystem) {
        if (this.importedSystems.has(name)) throw new Error(`Duplicate predicate system: ${name}`);
        this.predicateSystems.set(name, system);
        this.version++;
    }

    addImportedSystem(name: string, system: predicateSystem) {
        if (this.predicateSystems.has(name)) throw new Error(`Duplicate predicate system: ${name}`);
        this.addPredicateSystem(name, system);
        this.importedSystems.add(name);
    }

    addSyntaxSystem(name: string, system: predicateSystem) {
        this.addPredicateSystem(name,system);
        this.internalSystems.add(name);
    }

    getPredicateSystem(name: string): predicateSystem {
        const system = this.predicateSystems.get(name);
        if (!system) throw new Error(`Unknown predicate system: ${name}`);
        return system;
    }

    searchVariables(name: VariableId): boolean {
        return this.initialDomains.has(name);
    }

    searchConstraints(con: Constraint): boolean {
        return this.constraintList.some((existing): boolean => objEqual(existing, con));
    }

    addConstraint(scope: readonly VariableId[], relation: Constraint["relation"]) {
        const con = resolve(this.createConstraint(scope, relation));
        if (!this.searchConstraints(con)) {
            this.constraintList.push(con);
            this.version++;
        }
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

    /** Console queries read predicates without adding constraints or changing domains. */
    queryPredicate(systemName: string | undefined, predicateName: string, args: readonly Expr[]): Generator<false | Expr[], void, unknown> {
        const system = this.querySystem(systemName);
        if (!system.hasPredicate(predicateName)) throw new Error(`Unknown predicate: ${predicateName}`);
        return system.grabPred(predicateName).query(args);
    }

    querySystem(systemName: string | undefined): predicateSystem {
        return this.getPredicateSystem(this.querySystemName(systemName));
    }

    querySystemName(systemName: string | undefined): string {
        if (systemName === undefined) {
            const visible = [...this.predicateSystems.keys()].filter(name => !this.internalSystems.has(name));
            if (visible.length !== 1) {
                throw new Error("Specify a predicate system, e.g. ?- test:greater(X,s(0)).");
            }
            systemName = resolve(visible[0]);
        }
        const system = this.predicateSystems.get(systemName);
        if (!system) throw new Error(`Unknown predicate system: ${systemName}`);
        return systemName;
    }

    check(constraint: Constraint, values: readonly Expr[]): boolean {
        const system = resolve(this.predicateSystems.get(constraint.relation.system));
        return !!system.parseCheck(constraint.relation.predicate, values);
    }

    /** Each iterator owns its search state; changes invalidate outstanding iterators. */
    solutions(): Solutions {
        const revision = this.revision;
        const problem: Problem = {
            constraints: this.constraints,
            check: (constraint, values): boolean => this.check(constraint, values)
        };
        const iterator = this.algorithm(problem, this.domains);
        const owner = this;
        return (function* (): Solutions {
            try {
                while (true) {
                    if (owner.revision !== revision) throw new Error("Problem changed. Run solve again.");
                    const result = iterator.next();
                    if (result.done) return;
                    yield result.value;
                }
            } finally {
                iterator.return();
            }
        })();
    }

    findAssignment(): Assignment | false {
        const iterator = this.solutions();
        try {
            const result = iterator.next();
            return result.done ? false : result.value;
        } finally {
            iterator.return();
        }
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
