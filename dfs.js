//@ts-check

   
/**
 * 
 * @param {variable[]} vars 
 * @param {constraint[]} cons 
 * @param {Map<string,predicateSystem>} systems 
 * @returns {{key: string, val:Expr}[] | false}
 */
function Dfs(vars, cons, systems){

   /**@type {Expr[]} */
   let assignment = [];
   
   let check = () => cons.every(con => {
      let values = con.scope.map(v => assignment[vars.indexOf(v)]);      
      return systems.get(con.rel.sys)?.parseCheck(con.rel.pred,values);
   })
   /**
    * 
    * @param {number} ind 
    * @param {variable[]} rest 
    * @returns {boolean}
    */
   function rDfs(ind,rest){
      if(rest.length === 0) return check();
      let dom = resolve(rest.pop()?.domain)
      for(let x of dom) {
         assignment[ind] = x;
         if(rDfs(ind-1,[...rest])) return true;
      }
      return false;
   }
   let ret = rDfs(vars.length-1,[...vars])
   let ass = assignment
   return ret ? ass.map((v,i) => ({key: vars[i].name,val: v})) : false;
}
  
