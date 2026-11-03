/** Forward-only CSP enumeration shared by the browser and terminal adapters. */
class SolutionSession {
    private iterator: Solutions | undefined;
    private count = 0;

    constructor(private readonly system: constraintSystem) {}

    stop() {
        this.iterator?.return();
        this.iterator = undefined;
    }

    execute(command: "solve" | "next" | "stop"): string {
        if (command === "stop") {
            this.stop();
            return "Search stopped.";
        }
        if (command === "solve") {
            this.stop();
            this.count = 0;
            this.iterator = this.system.solutions();
        }
        if (!this.iterator) return "No active search. Enter solve to start.";
        try {
            const result = this.iterator.next();
            if (result.done) {
                this.stop();
                return this.count === 0 ? "No solutions." : "No more solutions.";
            }
            this.count++;
            const lines = result.value.map((entry): string => `${entry.key} = ${printExpr(entry.val)}`);
            return `Solution ${this.count}:\n${lines.length ? lines.join("\n") : "true."}`;
        } catch (error) {
            this.stop();
            throw error;
        }
    }
}
