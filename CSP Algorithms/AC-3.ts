/**
 * function AC-3(csp) returns false if an inconsistency is found and true otherwise
    queue ←a queue of arcs, initially all the arcs in csp
    while queue is not empty do
      (Xi, Xj ) ←POP(queue)
      if REVISE(csp, Xi, Xj) then
        if size of Di = 0 then return false
      for each Xk in Xi.NEIGHBORS - {Xj} do
        add (Xk, Xi) to queue
    return true
  function REVISE(csp, Xi, Xj ) returns true iff we revise the domain of Xi
    revised ←false
    for each x in Di do
      if no value y in Dj allows (x,y) to satisfy the constraint between Xi and Xj then
        delete x from Di
        revised ←true
    return revised
 */

function ArcConsistency(sys: constraintSystem): Assignment | false {
  //First the constraints must be able to be reinterpreted as binary for this algorithm to work.
  //For each constraint, ensure that the variables involved are consistent to depth 1 or "arc consistent"

  //for each variable in the scope of each constraint:
  //for each value in the domain of a variable:
  //
  let cons = sys.constraints;
  let vars = sys.variables;
  let predSys = sys.predSystems;
  let queue = [...cons];
  while( queue.length > 0){
    const con = resolve(queue.pop());
    let addToQueue = false;
    const checkExprs = Array.from(
      { length: con.scope.length },
      (_, i): Expr => new Expr(`X${i}`, 'VAR')
    );
    con.scope.every((v,i) => {
      let x_i = [...v.domain];
      let curPredSys = predSys.get(con.rel.sys)
      let testedVals = x_i.map(x => resolve(curPredSys).parseCheck(con.rel.pred,checkExprs.with(i,x)))
      let newDomain = v.domain.filter((_,k) =>  {
        let valsK = testedVals[k];
        return !!valsK ? con.scope.every((v_j,j) => v_j.domain.some(d => objEqual(d,valsK[j]))) : false;
      });
      if(newDomain.length < v.domain.length) addToQueue = true;
      v.domain = newDomain;
      return v.domain.length > 0;
    })
    if (addToQueue) queue.push(con)
    
  }

  return false;

}
/**
    let assignment: Expr[] = [];

    let check = (): boolean => cons.every((con) | undefined => {
        let values = con.scope.map((v) => assignment[vars.indexOf(v)]);
        return systems.get(con.rel.sys)?.parseCheck(con.rel.pred, values);
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
    */