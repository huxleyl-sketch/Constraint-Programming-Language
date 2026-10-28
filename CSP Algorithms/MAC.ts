/** Backtracking with generalized arc consistency and isolated domain maps per branch. */
function MAC(problem: Problem, initialDomains: Domains): Assignment | false {
    function search(input: Domains): Assignment | false {
        const domains = ArcConsistency(problem, input);
        if (domains === false) return false;
        let chosen: VariableId | undefined;
        let smallest = Infinity;
        for (const name of domains.keys()) {
            const values = resolve(domains.get(name));
            if (values.length > 1 && values.length < smallest) {
                chosen = name;
                smallest = values.length;
            }
        }
        if (chosen === undefined) {
            return [...domains.keys()].map((name): { readonly key: string; readonly val: Expr } =>
                ({ key: name, val: resolve(resolve(domains.get(name))[0]) }));
        }
        for (const value of resolve(domains.get(chosen))) {
            const branch = new Map(domains);
            branch.set(chosen, Object.freeze([value]));
            const result = search(branch);
            if (result !== false) return result;
        }
        return false;
    }
    return search(initialDomains);
}
