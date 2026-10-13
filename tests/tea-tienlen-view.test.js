const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../features/tea/tienlen');
const view = require('../public/tea/tienlen-view');

const c = (rank, suit = 0) => ({ id: `tl-${rank}-${suit}`, rank, suit });
const pair = rank => [c(rank), c(rank, 1)];
const pairs = (...ranks) => ranks.flatMap(pair);
const four = rank => [0, 1, 2, 3].map(suit => c(rank, suit));
const canonical = moves => moves.map(cards => cards.map(card => card.id).sort().join('|')).sort();
const game = input => ({ id: 'match-1', version: 1, status: 'active', players: [{ id: 'one' }, { id: 'two' }], turn: 'one', top: null, openingCardId: null, passed: [], ...input });

test('client and server classify every subset of a representative 13-card hand identically', () => {
  const hand = [...four(3), ...pairs(4, 5, 6), c(7), c(14), c(15)];
  for (let mask = 1; mask < 2 ** hand.length; mask++) {
    const cards = hand.filter((_, index) => mask & (1 << index));
    const browser = view.classify(cards), authority = server.classify(cards);
    if (!authority) assert.equal(browser, null, cards.map(card => card.id).join(','));
    else for (const field of ['kind', 'length', 'high', 'rank']) assert.equal(browser[field], authority[field], `${field}: ${cards.map(card => card.id).join(',')}`);
  }
});

test('client and server agree on rank, suit, length and every supported bomb response', () => {
  const combinations = [[c(3)], [c(3, 3)], [c(14, 3)], [c(15)], [c(15, 3)], pair(3), [c(3, 2), c(3, 3)], pair(15), four(15).slice(0, 3), four(3).slice(0, 3), four(3), four(10), [c(3), c(4), c(5)], [c(3), c(4), c(5, 3)], [c(4), c(5), c(6)], [c(4), c(5), c(6), c(7)], pairs(3, 4, 5), pairs(6, 7, 8), pairs(3, 4, 5, 6), pairs(4, 5, 6, 7)];
  for (const cards of combinations) for (const top of combinations) assert.equal(view.beats(view.classify(cards), view.classify(top)), server.beats(server.classify(cards), server.classify(top)), `${cards.map(c => c.id)} > ${top.map(c => c.id)}`);
});

test('highlighted and suggested moves obey the same opening and response rules as the server', () => {
  const hand = [...pairs(3, 4, 5, 6), c(10), c(15)];
  for (const [cards, opening] of [[null, c(3).id], [null, null], [[c(8)], null], [[c(15, 3)], null], [pair(15), null], [four(8), null]]) {
    const top = cards && { cards, ...server.classify(cards), playerId: 'two' };
    const state = game({ top, openingCardId: opening });
    assert.deepEqual(canonical(view.moves(hand, state, 'one')), canonical(server.legalMoves(hand, top, opening)));
  }
});

test('four consecutive pairs remain selectable off turn and after passing only when they can legally chop', () => {
  const bomb = pairs(3, 4, 5, 6), top = { cards: [c(15)], ...server.classify([c(15)]), playerId: 'two' };
  const offTurn = game({ top, turn: 'two', passed: ['one'] });
  assert.equal(view.legal(bomb, offTurn, 'one'), true); assert.equal(view.legal(four(9), offTurn, 'one'), false); assert.equal(view.legal([c(15, 3)], offTurn, 'one'), false);
  assert.deepEqual(canonical(view.moves(bomb, offTurn, 'one')), canonical(server.legalMoves(bomb, top, null, true)));
  assert.equal(view.legal(bomb, game({ turn: 'two', top: null }), 'one'), false);
  assert.equal(view.legal(bomb, game({ turn: 'two', top: { cards: [c(14)], ...server.classify([c(14)]) } }), 'one'), false);
  assert.equal(view.legal(bomb, { ...offTurn, status: 'finished' }, 'one'), false); assert.equal(view.legal(bomb, offTurn, 'spectator'), false);
});

test('older snapshots cannot rewind a hand while a new match or same-version poll is accepted', () => {
  const current = game({ version: 5 });
  assert.equal(view.acceptsView(current, game({ version: 4 })), false);
  assert.equal(view.acceptsView(current, game({ version: 5 })), true);
  assert.equal(view.acceptsView(current, game({ version: 6 })), true);
  assert.equal(view.acceptsView(current, game({ id: 'rematch', version: 1 })), true);
  assert.equal(view.acceptsView(null, current), true);
});
