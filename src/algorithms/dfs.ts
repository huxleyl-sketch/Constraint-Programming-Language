function* Dfs(problem: Problem, domains: Domains): Solutions {
    const names = [...domains.keys()];
    const assignment = new Map<VariableId, Expr>();

    function* search(index: number): Solutions {
        if (index === names.length) {
            const valid = problem.constraints.every((con): boolean => problem.check(con, con.scope.map((name): Expr => resolve(assignment.get(name)))));
            if (valid) yield Object.freeze(names.map((name): { readonly key: string; readonly val: Expr } =>
                Object.freeze({ key: name, val: resolve(assignment.get(name)) })));
            return;
        }
        const name = resolve(names[index]);
        for (const value of resolve(domains.get(name))) {
            assignment.set(name, value);
            yield* search(index + 1);
        }
        assignment.delete(name);
        return;
    }
    yield* search(0);
}
