function Dfs(problem: Problem, domains: Domains): Assignment | false {
    const names = [...domains.keys()];
    const assignment = new Map<VariableId, Expr>();

    function search(index: number): Assignment | false {
        if (index === names.length) {
            const valid = problem.constraints.every((con): boolean => problem.check(con, con.scope.map((name): Expr => resolve(assignment.get(name)))));
            return valid ? names.map((name): { readonly key: string; readonly val: Expr } =>
                ({ key: name, val: resolve(assignment.get(name)) })) : false;
        }
        const name = resolve(names[index]);
        for (const value of resolve(domains.get(name))) {
            assignment.set(name, value);
            const result = search(index + 1);
            if (result !== false) return result;
        }
        assignment.delete(name);
        return false;
    }
    return search(0);
}
