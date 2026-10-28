/** Returns pruned branch-local domains; never edits the input state or problem. */
function ArcConsistency(problem: Problem, input: Domains): Domains | false {
    const domains = new Map<VariableId, domain>();
    for (const [name, values] of input) {
        if (values.length === 0) return false;
        domains.set(name, Object.freeze([...values]));
    }
    const queue = [...problem.constraints];
    const cartesian = <T>(...sets: readonly (readonly T[])[]): T[][] =>
        sets.reduce<T[][]>((tuples, set): T[][] => tuples.flatMap(
            (tuple): T[][] => set.map((value): T[] => [...tuple, value])
        ), [[]]);

    while (queue.length > 0) {
        const con = resolve(queue.pop());
        const tuples = cartesian(...con.scope.map((name) => resolve(domains.get(name))));
        const valid = tuples.filter((tuple) => {
            // Repeated scope names must denote the same value in every position.
            const consistent = con.scope.every((name, index) =>
                objEqual(resolve(tuple[index]), resolve(tuple[con.scope.indexOf(name)])));
            return consistent && problem.check(con, tuple);
        });
        if (valid.length === 0) return false;

        for (const [index, name] of con.scope.entries()) {
            const previous = resolve(domains.get(name));
            const reduced = previous.filter( value => valid.some( tuple => objEqual(value, resolve(tuple[index])) ) );
            if (reduced.length === 0) return false;
            if (reduced.length < previous.length) {
                domains.set(name, Object.freeze(reduced));
                for (const affected of problem.constraints) {
                    if (affected !== con && affected.scope.includes(name) && !queue.includes(affected)) {
                        queue.push(affected);
                    }
                }
            }
        }
    }
    return domains;
}
