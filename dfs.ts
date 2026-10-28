function Dfs(sys: constraintSystem): Assignment | false {

    let assignment: Expr[] = [];

    let cons = sys.constraints;
    let predSys = sys.predSystems;
    let vars = [...sys.variables.values()]

    let check = (): boolean => cons.every((con): false | Expr[] | undefined => {
        let values = con.scope.map((v): Expr => assignment[vars.indexOf(v)]);
        return predSys.get(con.rel.sys)?.parseCheck(con.rel.pred, values);
    })

    function rDfs(ind: number, rest: variable[]): boolean {
        if (rest.length === 0) return check();
        let dom = resolve(rest.pop()?.domain)
        for (let x of dom) {
            assignment[ind] = x;
            if (rDfs(ind - 1, [...rest])) return true;
        }
        return false;
    }
    let ret = rDfs(vars.length - 1, [...vars])
    let ass = assignment
    return ret ? ass.map((v, i): { key: string; val: Expr; } => ({ key: vars[i].name, val: v })) : false;
}
