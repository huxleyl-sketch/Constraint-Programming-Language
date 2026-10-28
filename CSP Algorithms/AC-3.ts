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

function ArcConsistency(sys: constraintSystem, vars?: Map<string,Expr> ): boolean {
  //Enforce generalized arc consistency using supporting tuples from current domains.

  //for each variable in the scope of each constraint:
  //for each value in the domain of a variable:
  //
  
  let cons = sys.constraints;
  let predSys = sys.predSystems;
  let queue = [...cons];
  while( queue.length > 0 ){
    const con = resolve(queue.pop());
    //find assignment to check
    const domains = con.scope.map(v => v.domain);
    //find values from domains
    const cartesian = <T>(...domains: readonly (readonly T[])[]): T[][] =>
        domains.reduce<T[][]>(
            (tuples, domain): T[][] => tuples.flatMap(
                (tuple): T[][] => domain.map((value): T[] => [...tuple, value])
            ),
            [[]]
        );
    const args = cartesian(...domains);
    const system = resolve(predSys.get(con.rel.sys));
    const validTuples = args.filter(
      (assignment): boolean => !!system.parseCheck(con.rel.pred, assignment)
    );
    if (validTuples.length === 0) return false;

    for (const [index, variable] of con.scope.entries()) {
      const newDomain = variable.domain.filter(
        (value): boolean => validTuples.some(
          (tuple): boolean => objEqual(value, tuple[index])
        )
      );

      if (newDomain.length < variable.domain.length) {
        variable.domain = newDomain;
        //Other constraints may lose support when this domain shrinks.
        for (const affected of cons) {
          if (affected !== con && affected.scope.includes(variable) && !queue.includes(affected)) {
            queue.push(affected);
          }
        }
      }
      if (variable.domain.length === 0) return false;
    }
    
  }

  return [...sys.variables.values()].every((variable): boolean => variable.domain.length > 0);
}