/** Backtracking with generalized arc consistency and isolated domain maps per branch. */
function* MAC(problem: Problem, initialDomains: Domains): Solutions {
    function* search(input: Domains): Solutions {
        const domains = ArcConsistency(problem, input);
        if (domains === false) return;
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
            yield Object.freeze([...domains.keys()].map((name): { readonly key: string; readonly val: Expr } =>
                Object.freeze({ key: name, val: resolve(resolve(domains.get(name))[0]) })));
            return;
        }
        for (const value of resolve(domains.get(chosen))) {
            const branch = new Map(domains);
            branch.set(chosen, Object.freeze([value]));
            yield* search(branch);
        }
        return;
    }
    yield* search(initialDomains);
}
