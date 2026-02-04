

let pre = `
parent(s(a),s(b)).
parent(s(a),s(c)).
parent(s(d),s(c)).
equal(X,X).
sibling(X,Y) :- 
    parent(X,Z),
    ~equal(X,Y),
    parent(Y,Z).
`
let c = `
%dom x := [m,h,n,k];
let X1 := [m,s(a),n,k];
let X2 := [m,h,n,s(d)];

def system := {
    parent(s(a),s(b)).
    parent(s(a),s(c)).
    parent(s(d),s(c)).
    equal(X,X).
    sibling(X,Y) :- 
        parent(X,Z), 
        ~equal(X,Y),
        parent(Y,Z).
};

system[sibling(X1,X2)];
`
/**@type {constraintSystem} */
let conSystem;
let debug = false;
