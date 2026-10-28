// Compile-only checks: each forbidden mutation must remain an IDE/compiler error.
function checkReadonlyContract(problem: Problem, domains: Domains, expr: Expr) {
    // @ts-expect-error Predicate systems are hidden behind check.
    problem.predSystems;
    // @ts-expect-error Solver views cannot replace domain entries.
    domains.set("X", []);
    // @ts-expect-error Stored domains cannot be shortened in place.
    resolve(domains.get("X")).pop();
    // @ts-expect-error Constraint lists cannot be edited by solvers.
    problem.constraints.push({ scope: [], relation: { system: "s", predicate: "p" } });
    const con = resolve(problem.constraints[0]);
    // @ts-expect-error Constraint scopes cannot be edited.
    con.scope.push("Y");
    // @ts-expect-error Relations cannot be redirected by a solver.
    con.relation.predicate = "other";
    // @ts-expect-error Shared expressions cannot change kind.
    expr.kind = "VAR";
    // @ts-expect-error Binding identities cannot change after construction.
    expr.variableId = "other";
    // @ts-expect-error Shared child arrays cannot be mutated.
    expr.rhs?.push(expr);
}
