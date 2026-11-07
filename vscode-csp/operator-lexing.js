// Generated from src/tokeniser.ts.
function* joinedTokenizations(input, operators) {
    const joined = [...operators].filter(([, spec]) => spec.spacing === 'w/o')
        .map(([name]) => name).sort((a, b) => b.length - a.length);
    const boundary = (left, right) => !left || !right || left.end !== right.start || /^[()[\]{},.;:~]$/.test(left.value) || /^[()[\]{},.;:~]$/.test(right.value);
    const mark = (piece, before, after) => operators.get(piece.value)?.spacing === 'w' && (!boundary(before, piece) || !boundary(piece, after))
        ? { ...piece, literal: true } : piece;
    function* split(value, offset) {
        if (!value) {
            yield [];
            return;
        }
        const names = joined.filter(name => value.startsWith(name));
        for (const name of names) {
            for (const tail of split(value.slice(name.length), offset + name.length))
                yield [{ value: name, kind: 'ATOM', start: offset, end: offset + name.length }, ...tail];
        }
        if (names.length)
            return;
        let end = 1;
        while (end < value.length && !joined.some(name => value.startsWith(name, end)))
            end++;
        const head = value.slice(0, end);
        for (const tail of split(value.slice(end), offset + end))
            yield [{ value: head, kind: /^[A-Z]/.test(head) ? 'VAR' : head === '_' ? 'ANY' : 'ATOM', start: offset, end: offset + end }, ...tail];
    }
    function* walk(index) {
        if (index >= input.length) {
            yield [];
            return;
        }
        const first = input[index];
        let end = index + 1;
        // Variables and explicit functor names retain their identities.
        if (first.kind === 'ATOM' && input[end]?.value !== '(') {
            while (input[end]?.kind === 'ATOM' && input[end - 1].end === input[end].start)
                end++;
        }
        const group = input.slice(index, end);
        const text = group.map(t => t.value).join('');
        const variants = first.kind === 'ATOM' && input[index + 1]?.value !== '(' && joined.some(name => text.includes(name))
            ? split(text, first.start) : [group];
        for (const variant of variants) {
            const marked = variant.map((piece, n) => mark(piece, variant[n - 1] ?? input[index - 1], variant[n + 1] ?? input[end]));
            for (const rest of walk(end))
                yield [...marked, ...rest];
        }
    }
    yield* walk(0);
}

module.exports = { joinedTokenizations };
