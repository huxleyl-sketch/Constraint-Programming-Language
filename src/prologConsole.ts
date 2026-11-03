/** A query session is independent of CSP domains and can be discarded between commands. */
class PrologConsole {
    private answers: Generator<false | Expr[], void, unknown> | undefined;
    private args: readonly Expr[] = [];

    constructor(private readonly system: constraintSystem) {}

    cancel() {
        this.answers?.return();
        this.answers = undefined;
    }

    execute(command: string): string {
        const text = command.trim();
        if (text === ";") return this.next();
        if (text === ".") {
            this.cancel();
            return "Query finished.";
        }
        this.cancel();
        if (!text.startsWith("?-")) throw new Error("Start a query with ?-.");
        let query = text.slice(2).trim().replace(/\.$/, "").trim();
        let systemName: string | undefined;
        const qualified = /^([a-z][\w]*):\s*([\s\S]+)$/.exec(query);
        if (qualified) {
            systemName = resolve(qualified[1]);
            query = resolve(qualified[2]);
        }
        const environment = this.system.syntaxEnvironment();
        environment.scope = this.system.querySystemName(systemName);
        const tree = interpreter(query, new Map(this.system.syntax), environment);
        const root = resolve(tree[0], "query");
        if (tree.length === 1 && root.kind === 'IMPLIES') {
            const expanded = syntaxPredicate(root,this.system.querySystem(systemName));
            this.args = resolve(root.lhs?.[0]?.rhs);
            this.answers = expanded.query(this.args);
            return this.next();
        }
        if (tree.length !== 1 || root.kind !== "PRED") {
            throw new Error("Enter one predicate query, e.g. ?- test:greater(X,s(0)).");
        }
        this.args = resolve(root.rhs);
        const name = resolve(root.lhs?.[0]);
        if (name.kind !== "ATOM") throw new Error("Expected a predicate name.");
        this.answers = this.system.queryPredicate(systemName, name.match, this.args);
        return this.next();
    }

    private next(): string {
        if (!this.answers) return "No active query.";
        try {
            for (let result = this.answers.next(); !result.done; result = this.answers.next()) {
                if (result.value) return this.format(result.value);
            }
            this.cancel();
            return "false.";
        } catch (error) {
            this.cancel();
            throw error;
        }
    }

    private format(answer: readonly Expr[]): string {
        const bindings = new Map<string, Expr>();
        const aliases = new Map<string, string>();
        const collect = (input: Expr, output: Expr) => {
            if (input.kind === "VAR") {
                bindings.set(input.match, output);
                if (output.kind === "VAR" && !aliases.has(resolve(output.variableId))) {
                    aliases.set(resolve(output.variableId), input.match);
                }
                return;
            }
            input.lhs?.forEach((child, index) => collect(child, resolve(output.lhs?.[index])));
            input.rhs?.forEach((child, index) => collect(child, resolve(output.rhs?.[index])));
        };
        this.args.forEach((arg, index) => collect(arg, resolve(answer[index])));
        let anonymous = 0;
        const print = (expr: Expr): string => {
            if (expr.kind === "VAR") {
                const id = resolve(expr.variableId);
                if (!aliases.has(id)) aliases.set(id, `_G${++anonymous}`);
                return resolve(aliases.get(id));
            }
            if (expr.kind === "PRED") {
                return `${print(resolve(expr.lhs?.[0]))}(${(expr.rhs ?? []).map(print).join(", ")})`;
            }
            return expr.match;
        };
        const lines: string[] = [];
        for (const [name, value] of bindings) {
            const rendered = print(value);
            if (rendered !== name) lines.push(`${name} = ${rendered}`);
        }
        return lines.length ? lines.join(",\n") + "." : "true.";
    }
}
