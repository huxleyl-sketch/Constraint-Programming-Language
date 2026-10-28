function MAC(sys: constraintSystem): Assignment | false {

  let assignment: Expr[] = [];

  let cons = sys.constraints;
  let predSys = sys.predSystems;
  let vars = [...sys.variables.values()]

  function rMAC(){
    ArcConsistency(sys)
  }

  function rDfs(ind: number, rest: variable[]): boolean {
      if (rest.length === 0) return false;
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
/**
 * function BACKTRACKING-SEARCH(csp) returns a solution or failure
    return BACKTRACK(csp,{})
  function BACKTRACK(csp,assignment) returns a solution or failure
    if assignment is complete then return assignment
    var ←SELECT-UNASSIGNED-VARIABLE(csp,assignment)
    for each value in ORDER-DOMAIN-VALUES(csp,var,assignment) do
      if value is consistent with assignment then
        add {var = value}to assignment
        inferences ←INFERENCE(csp,var,assignment)
        if inferences 6= failure then
          add inferences to csp
          result ←BACKTRACK(csp,assignment)
          if result 6= failure then return result
        remove inferences from csp
      remove {var = value}from assignment
  return failure
 */
