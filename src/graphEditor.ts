// Browser-only controller; deliberately does not load the console DOM adapter.
(window as unknown as { logToConsole: (message: unknown) => void }).logToConsole = (message: unknown) => { document.getElementById('output')!.textContent += String(message) + '\n'; };
(() => {
    const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const source = el<HTMLTextAreaElement>('source'), canvas = document.getElementById('canvas') as unknown as SVGSVGElement;
    const graph = new CspGraph(), files = new Map<string, string>();
    let filename = 'graph.csp', session: SolutionSession | undefined, queries: PrologConsole | undefined;
    let selected: GraphVariable | GraphRelation | undefined, pending: GraphVariable | GraphRelation | undefined, dirty = false;
    let mode: 'select' | 'connect' = 'select';
    let assignedValues: ReadonlyMap<string, Expr> | undefined;
    const constraintResults = new Map<GraphRelation, boolean>();
    interface WritableHandle { name: string; getFile(): Promise<File>; createWritable(): Promise<{write(data: string): Promise<void>; close(): Promise<void>}> }
    const picker = window as unknown as { showOpenFilePicker?: (options: unknown) => Promise<WritableHandle[]>; showSaveFilePicker?: (options: unknown) => Promise<WritableHandle> };
    let handle: WritableHandle | undefined;
    let directAccessBlocked = false;
    const errorNamed = (error: unknown, name: string) => !!error && typeof error === 'object' && 'name' in error && error.name === name;
    const accessDenied = (error: unknown) => errorNamed(error, 'NotAllowedError') || errorNamed(error, 'SecurityError');
    const status = (text: string) => { el('status').textContent = text; };
    const safe = (action: () => void | Promise<void>) => async () => { try { await action(); } catch (error) { status(String(error)); } };
    const button = (id: string, action: () => void | Promise<void>) => el(id).addEventListener('click', safe(action));
    function invalidate() {
        session?.stop(); session = undefined; queries?.cancel(); queries = undefined;
        assignedValues = undefined; constraintResults.clear(); el('output').textContent = ''; render();
    }
    function normalize(path: string) { const parts: string[] = []; for (const p of path.split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); } return parts.join('/'); }
    function compile(code: string, onSolution?: (assignment: Assignment, system: constraintSystem) => void) {
        const algorithm = el<HTMLSelectElement>('algorithm').value === 'dfs' ? Dfs : MAC;
        const system: constraintSystem = new constraintSystem(onSolution ? function* (problem, domains): Solutions {
            for (const assignment of algorithm(problem, domains)) {
                onSolution(assignment, system);
                yield assignment;
            }
        } : algorithm);
        const candidates = [...files.keys()].filter(p => p === filename || p.endsWith('/' + filename));
        if (candidates.length > 1) throw new Error('Ambiguous filename in import folder.');
        parser(code, system, { filename: candidates[0] ?? filename, read(specifier, importer) {
            const id = normalize(importer.slice(0, importer.lastIndexOf('/') + 1) + specifier), code = files.get(id);
            if (code === undefined) throw new Error(`Missing ${id}. Select the repository with Import folder, then Apply source.`);
            return { id, code };
        }});
        return system;
    }
    function showSolution(assignment: Assignment, system: constraintSystem) {
        assignedValues = new Map(assignment.map(entry => [entry.key, entry.val]));
        constraintResults.clear();
        for (const relation of graph.relations) {
            const values = relation.args.map(name => resolve(assignedValues!.get(name)));
            constraintResults.set(relation, graph.check(relation,system,values));
        }
        render();
    }
    function apply() {
        invalidate(); const system = compile(source.value); graph.load(source.value, system); selected = undefined; pending = undefined; dirty = false; render(); inspect();
        status('Source loaded. Select a node or add a variable.');
        refreshRelationSystems();
    }
    function sync() {
        invalidate(); source.value = graph.source(); dirty = false; render();
        status('Source updated. Save to write the .csp file.');
        refreshRelationSystems();
    }
    const relationExample = 'def custom := {\n  syntax[opp xfx same/2.].\n  same(X,X).\n};\n';
    function refreshRelationSystems() {
        const control=el<HTMLSelectElement>('relation-system'), previous=control.value;
        control.replaceChildren();
        const option=document.createElement('option');option.value='';option.textContent='New system';control.append(option);
        const names=graphStatements(source.value).map(statement=>/^def\s+([a-z0-9]\w*)\b/.exec(statement.replace(/%[^\n]*/g,'').trim())?.[1]).filter((name): name is string=>!!name);
        for(const name of names){const option=document.createElement('option');option.value=name;option.textContent=name;control.append(option);}
        control.value=names.includes(previous)?previous:'';
    }
    el('relation-system').addEventListener('change',()=>{
        const name=el<HTMLSelectElement>('relation-system').value;
        const statement=graphStatements(source.value).find(statement=>/^def\s+([a-z0-9]\w*)\b/.exec(statement.replace(/%[^\n]*/g,'').trim())?.[1] === name);
        el<HTMLTextAreaElement>('relation-editor').value=statement?.trim() ?? relationExample;
        el('relation-status').textContent='';
    });
    button('apply-relations',()=>{
        try {
            ready();
            const candidate=graphMergeRelations(source.value,el<HTMLTextAreaElement>('relation-editor').value);
            const system=compile(candidate);
            graph.load(candidate,system);
            source.value=candidate;dirty=false;selected=undefined;pending=undefined;
            invalidate();inspect();refreshRelationSystems();
            el('relation-status').textContent='Relations applied. Use the graph predicate choices or add a system[...] constraint in this editor.';
            status('Relations applied to the graph and source. Save .csp to keep them.');
        } catch(error) {
            el('relation-status').textContent=String(error);
            throw error;
        }
    });
    function ready() { if (dirty) throw new Error('Apply your source edits before changing the graph.'); }
    function svg(tag: string, attrs: Record<string, string | number>, text?: string) {
        const item = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value));
        if (text !== undefined) item.textContent = text;
        canvas.appendChild(item); return item;
    }
    function edge(d: string, classes: string, relation: GraphRelation) {
        // Keep the visible stroke thin while giving mouse and touch a wider target.
        for (const kind of ['edge-hit', 'edge-visible']) {
            const path = svg('path', { d, fill: 'none', class: `${classes} ${kind}` });
            path.addEventListener('click', event => { event.stopPropagation(); choose(relation); });
        }
    }
    let drag: { node: GraphVariable | GraphRelation; dx: number; dy: number; startX: number; startY: number; moved: boolean } | undefined;
    function point(event: PointerEvent) { const p = new DOMPoint(event.clientX, event.clientY); return p.matrixTransform(canvas.getScreenCTM()!.inverse()); }
    function setMode(next: 'select' | 'connect') {
        mode = next; pending = undefined; drag = undefined;
        el('mode-select').setAttribute('aria-pressed', String(mode === 'select'));
        el('mode-connect').setAttribute('aria-pressed', String(mode === 'connect'));
        el('constraint-tools').hidden = mode !== 'connect';
        canvas.setAttribute('data-mode', mode);
        el('mode-help').textContent = mode === 'select'
            ? 'Select mode: click a variable to edit its name or domain. Click a constraint to inspect its predicate. Drag nodes to arrange them.'
            : 'Constraint mode: click two variables to create a constraint, or the same variable twice for a unary loop. Click a constraint, then a variable to add an argument. Remove arguments in the inspector. Escape returns to Select mode.';
        inspect(); render(); status(mode === 'select' ? 'Select mode: click a variable to edit it.' : 'Constraint mode: click variables to connect them.');
    }
    function choose(node: GraphVariable | GraphRelation) {
        if (dirty) { status('Apply source edits first.'); return; }
        if (mode === 'connect' && 'name' in node && pending) {
            if ('name' in pending) {
                const args = pending === node ? [node.name] : [pending.name, node.name];
                const relation: GraphRelation = { system: '', predicate: '', args, triangle: false, x: (pending.x+node.x)/2, y: (pending.y+node.y)/2-65 };
                graph.relations.push(relation); selected = relation;
            } else {
                pending.args.push(node.name); pending.triangle = pending.args.length > 2; selected = pending;
            }
            pending = undefined; sync(); inspect();
            status('Connection added. Choose a predicate in the inspector.');
            return;
        }
        selected = node; pending = mode === 'connect' && !('expression' in node && node.expression !== undefined) ? node : undefined; inspect(); render();
        status(mode === 'connect' ? 'Click a variable to connect, or press Escape to return to Select mode.' : 'Edit the selection in the inspector.');
    }
    function nodeEvents(item: SVGElement, node: GraphVariable | GraphRelation) {
        item.addEventListener('pointerdown', event => {
            event.stopPropagation();
            if (dirty) { status('Apply source edits first.'); return; }
            const p = point(event);
            drag = { node, dx: p.x-node.x, dy: p.y-node.y, startX: event.clientX, startY: event.clientY, moved: false };
            canvas.setPointerCapture(event.pointerId);
        });
    }
    canvas.addEventListener('pointermove', event => {
        if (!drag) return;
        if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) > 4) drag.moved = true;
        if (!drag.moved) return;
        pending = undefined;
        drag.node.x=Math.max(45,Math.min(955,point(event).x-drag.dx));
        drag.node.y=Math.max(45,Math.min(535,point(event).y-drag.dy)); render();
    });
    canvas.addEventListener('pointerup', () => { const ended=drag; drag=undefined; if(ended && !ended.moved) choose(ended.node); });
    canvas.addEventListener('pointercancel', () => { drag=undefined; pending=undefined; });
    canvas.addEventListener('pointerdown', event => { if(event.target===canvas){pending=undefined;status('Connection cancelled.');} });
    document.addEventListener('keydown', event => { if(event.key==='Escape') setMode('select'); });
    function render() {
        canvas.replaceChildren();
        for (const relation of graph.relations) {
            relation.triangle = relation.args.length > 2;
            const nodes = relation.args.map(a => graph.variables.find(v => v.name === a));
            const result = constraintResults.get(relation);
            const classes = `${selected===relation?'selected ':''}${graph.mismatch(relation)?'invalid ':''}${result === true?'satisfied ':result === false?'unsatisfied ':''}${!relation.predicate?'draft':''}`;
            const label = relation.expression !== undefined ? `${relation.system}[${relation.expression}]` : relation.predicate ? `${relation.system}:${relation.predicate}/${relation.arity ?? relation.args.length}` : 'Choose predicate';
            const loop = relation.args.length === 1 || nodes.every(n => n === nodes[0]);
            if (!relation.triangle && nodes[0]) {
                const a=nodes[0], b=nodes[1] ?? a, mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
                const d=loop ? `M ${a.x-24} ${a.y-24} C ${a.x-110} ${a.y-125}, ${a.x+110} ${a.y-125}, ${a.x+24} ${a.y-24}` : `M ${a.x} ${a.y} Q ${mx+35} ${my-45} ${b.x} ${b.y}`;
                edge(d, classes, relation);
                svg('text',{x:loop?a.x:mx+12,y:loop?a.y-103:my-26,'text-anchor':'middle'},`${label} (${relation.args.map((_,i)=>i+1).join(', ')})`);
            } else {
                nodes.forEach((v,i)=>{if(v){
                    // Offset repeated arguments so their connections stay individually visible.
                    const offset=(i-(nodes.length-1)/2)*18;
                    edge(`M ${relation.x} ${relation.y} Q ${(relation.x+v.x)/2+offset} ${(relation.y+v.y)/2-20} ${v.x} ${v.y}`, classes, relation);
                    svg('text',{x:(relation.x+v.x)/2+offset/2+8,y:(relation.y+v.y)/2-12},String(i+1));
                }});
                const shape=svg('polygon',{points:`${relation.x},${relation.y-32} ${relation.x-36},${relation.y+28} ${relation.x+36},${relation.y+28}`,class:`node ${classes}`});nodeEvents(shape,relation);
                svg('text',{x:relation.x,y:relation.y+49,'text-anchor':'middle'},label);
            }
        }
        for (const v of graph.variables) {
            const circle=svg('circle',{cx:v.x,cy:v.y,r:34,class:selected===v?'node selected':'node'});
            nodeEvents(circle,v);
            const value = assignedValues?.get(v.name);
            svg('text',{x:v.x,y:v.y+5,'text-anchor':'middle'},value ? `${v.name}:${printExpr(value)}` : v.name);
        }
    }
    function inspect() {
        const panel=el('inspector');panel.replaceChildren();const target=selected;if(!target)return;
        function field(title:string,input:HTMLElement){const label=document.createElement('label');label.textContent=title;panel.append(label,input);}
        function input(title:string,value:string,change:(value:string)=>void){const item=document.createElement('input');item.value=value;item.addEventListener('change',safe(()=>{ready();change(item.value);sync();}));field(title,item);}
        function select(title:string,options:{value:string;label:string}[],value:string,change:(value:string)=>void){const item=document.createElement('select');for(const option of options){const o=document.createElement('option');o.value=option.value;o.textContent=option.label;item.append(o);}item.value=value;item.addEventListener('change',safe(()=>{ready();change(item.value);sync();inspect();}));field(title,item);}
        if('name' in target){
            input('Variable name',target.name,value=>{
                if(!/^[A-Z]\w*$/.test(value)||graph.variables.some(v=>v!==target&&v.name===value))throw new Error('Use a unique uppercase variable name.');
                // Retained syntax constraints may reference this name; refuse unsafe rewrites.
                if(graph.preserved.some(s=>new RegExp(`\\b${target.name}\\b`).test(s.replace(/%[^\n]*/g,''))))throw new Error('This variable appears in preserved source. Rename it in the source editor.');
                for(const r of graph.relations){r.args=r.args.map(a=>a===target.name?value:a);if(r.expression !== undefined)r.expression=r.expression.replace(new RegExp(`\\b${target.name}\\b`,'g'),value);}target.name=value;
            });
            input('Domain (CSP terms separated by commas)',target.domain,value=>{const test=new constraintSystem(Dfs);parser(`let Test := [${value}];`,test);target.domain=value;});
        } else if (target.expression !== undefined) {
            const expression=document.createElement('p');expression.textContent=`${target.system}[${target.expression}]`;panel.append(expression);
            const info=document.createElement('p');info.textContent=`Variables: ${target.args.join(', ')}. Edit the expression in the source and Apply source to change its connections.`;panel.append(info);
        } else {
            const available=graph.catalog;
            select('1 ? System',[{value:'',label:'Choose system'}, ...[...new Set(available.map(p=>p.system))].map(s=>({value:s,label:s}))],target.system,value=>{target.system=value;target.predicate='';delete target.arity;});
            const choices=available.filter(p=>p.system===target.system);
            select('2 ? Predicate',[{value:'',label:'Choose predicate'}, ...choices.map(p=>({value:`${p.name}/${p.arity}`,label:`${p.name} / ${p.arity}`}))],target.predicate?`${target.predicate}/${target.arity ?? target.args.length}`:'',value=>{
                const p=choices.find(p=>`${p.name}/${p.arity}`===value);
                target.predicate=p?.name??'';if(p)target.arity=p.arity;else delete target.arity;
            });
            const info=document.createElement('p');
            info.textContent=graph.mismatch(target)?`Arity mismatch: predicate expects ${target.arity ?? target.args.length}; connected arguments: ${target.args.length}.`:`Connected arguments: ${target.args.length}. ${mode === 'connect' ? 'Click this constraint, then a variable to add an argument.' : 'Switch to Constraint mode to change connections.'}`;
            panel.append(info);
            target.args.forEach((arg,i)=>{
                if (mode === 'connect') select(`Argument ${i+1}`,graph.variables.map(v=>({value:v.name,label:v.name})),arg,value=>{target.args[i]=value;});
                else { const argument=document.createElement('p'); argument.textContent=`Argument ${i+1}: ${arg}`; panel.append(argument); }
                if(mode === 'connect' && target.args.length>1){const removeArg=document.createElement('button');removeArg.textContent=`Remove argument ${i+1}`;removeArg.onclick=safe(()=>{ready();target.args.splice(i,1);pending=undefined;sync();inspect();});panel.append(removeArg);}
            });

        }
        const remove=document.createElement('button');remove.textContent='Delete selected';remove.onclick=safe(()=>{ready();if('name'in target){if(graph.preserved.some(s=>new RegExp(`\\b${target.name}\\b`).test(s.replace(/%[^\n]*/g,''))))throw new Error('Variable referenced in preserved source; edit source first.');graph.variables=graph.variables.filter(v=>v!==target);graph.relations=graph.relations.filter(r=>!r.args.includes(target.name));}else graph.relations=graph.relations.filter(r=>r!==target);selected=undefined;pending=undefined;sync();inspect();});panel.append(remove);
    }
    button('mode-select',()=>setMode('select'));
    button('mode-connect',()=>setMode('connect'));
    button('add',()=>{ready();setMode('select');let n=1;while(graph.variables.some(v=>v.name===`V${n}`))n++;const v={name:`V${n}`,domain:'0, 1',x:110+graph.variables.length%5*160,y:100+Math.floor(graph.variables.length/5)*130};graph.variables.push(v);selected=v;sync();inspect();});
    button('edge',()=>{ready();setMode('connect');status('Click two variables to create an empty constraint. Click the same variable twice for a unary loop.');});
    button('triangle',()=>{ready();setMode('connect');if(!graph.variables.length)throw new Error('Create a variable first.');const r:GraphRelation={system:'',predicate:'',args:[graph.variables[0]!.name],triangle:false,x:450,y:280};graph.relations.push(r);selected=r;pending=r;sync();inspect();status('Click variables to add arguments. Three or more arguments form a triangle.');});
    source.addEventListener('input',()=>{dirty=true;invalidate();status('Source changed. Apply source to rebuild the graph.');});
    button('apply',apply);
    el('algorithm').addEventListener('change',invalidate);
    button('solve',()=>{invalidate();if(dirty)apply();graph.assertComplete();const system=compile(source.value,showSolution);session=new SolutionSession(system);queries=new PrologConsole(system);logToConsole(session.execute('solve'));status('Search started.');});
    button('next',()=>{if(!session)throw new Error('Solve first.');logToConsole(session.execute('next'));});
    button('stop',()=>{session?.stop();queries?.cancel();status('Search stopped.');});
    button('run-query',()=>{if(dirty)apply();graph.assertComplete();queries??=new PrologConsole(compile(source.value));logToConsole(queries.execute(el<HTMLInputElement>('query').value));});
    button('query-next',()=>{if(!queries)throw new Error('Run a query first.');logToConsole(queries.execute(';'));});
    async function load(file: File, fileHandle?: WritableHandle) {
        const text = await file.text();
        invalidate(); filename=file.name; source.value=text; handle=fileHandle; dirty=true; apply();
    }
    button('open', async () => {
        if (!picker.showOpenFilePicker || directAccessBlocked) { el('file').click(); return; }
        let candidate: WritableHandle | undefined;
        let file: File;
        try {
            candidate = (await picker.showOpenFilePicker({types:[{description:'CSP script',accept:{'text/plain':['.csp']}}]}))[0];
            if (!candidate) return;
            file = await candidate.getFile();
        } catch (error) {
            if (errorNamed(error, 'AbortError')) return;
            if (!accessDenied(error)) throw error;
            directAccessBlocked = true;
            // A new user gesture may be required after an asynchronous permission failure.
            el('file').hidden = false;
            status('Direct file access is blocked by this browser. Choose your .csp file using the upload control, or click Open again. Saving will download an updated copy.');
            return;
        }
        await load(file, candidate);
    });
    el('file').addEventListener('change',safe(async()=>{const input=el<HTMLInputElement>('file');const f=input.files?.[0];if(f){try { await load(f); } finally { input.value=''; }}}));
    el('folder').addEventListener('change',safe(async()=>{invalidate();const entries=await Promise.all(Array.from(el<HTMLInputElement>('folder').files??[]).filter(f=>f.name.endsWith('.csp')).map(async f=>{const path=f.webkitRelativePath;return [path?path.slice(path.indexOf('/')+1):f.name,await f.text()] as const;}));files.clear();for(const [path,text]of entries)files.set(path,text);status('Import folder ready. Apply source to load dependencies.');}));
    function downloadSource() {
        const url=URL.createObjectURL(new Blob([source.value],{type:'text/plain'}));
        const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        status('Downloaded updated .csp file.');
    }
    button('save',async()=>{
        if(dirty)apply(); graph.assertComplete(); compile(source.value);
        try {
            if(!handle && picker.showSaveFilePicker && !directAccessBlocked) handle=await picker.showSaveFilePicker({suggestedName:filename,types:[{description:'CSP script',accept:{'text/plain':['.csp']}}]});
            if(handle){
                const writer=await handle.createWritable();
                await writer.write(source.value); await writer.close(); filename=handle.name;
                status(`Saved ${filename}.`); return;
            }
        } catch (error) {
            if(errorNamed(error,'AbortError')) return;
            if(!accessDenied(error)) throw error;
            handle=undefined; directAccessBlocked=true;
        }
        downloadSource();
    });
    source.value='def graph := {\n  different(A,B) <- ~equal(A,B).\n  equal(X,X).\n  allDifferent(A,B,C) <- different(A,B), different(A,C), different(B,C).\n};\nlet A := [0,1,2];\nlet B := [0,1,2];\nlet C := [0,1,2];\ngraph[allDifferent(A,B,C)];\n';
    el<HTMLTextAreaElement>('relation-editor').value=relationExample;
    setMode('select');
    apply();
})();

