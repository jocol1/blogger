const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, act, progress, view, evaluateFive, evaluateSeven, chooseBotAction, compareScore, makeDeck, TURN_MS } = require('../features/tea/poker');

const c = (rank, suit = 0) => ({ id: `pk-${rank}-${suit}`, rank, suit });
const game = (players = ['A', 'B', 'C'], dealerIndex = 0) => createGame({ id: 'test-hand', tableId: 'table-1', players, names: { A: 'Alice', B: 'Bob', C: 'Charlie' }, now: 1_000, dealerIndex });
const turn = g => g.players[g.turnIndex];
const play = (g, action, raiseTo, now = 1_001) => act(g, turn(g), { action, ...(raiseTo === undefined ? {} : { raiseTo }) }, now);
const chipTotal = g => g.players.reduce((sum, id) => sum + g.playerState[id].stack + (g.status === 'active' ? g.playerState[id].totalBet : 0), 0);
function street(g, stage = 'flop') {
  g.stage = stage; g.board = [c(2), c(7, 1), c(9, 2)]; g.currentBet = 0; g.minRaise = 20;
  g.players.forEach(id => Object.assign(g.playerState[id], { stack: 1_000, bet: 0, totalBet: 0, folded: false, allIn: false, actedAtBet: null }));
  g.hands = Object.fromEntries(g.players.map((id, index) => [id, [c(10 + Math.floor(index / 2), (index % 2) * 2), c(10 + Math.floor(index / 2), (index % 2) * 2 + 1)]]));
  g.turnIndex = 0; g.turnEndsAt = 31_000; g.burned = [];
  const used = new Set([...g.board, ...Object.values(g.hands).flat()].map(card => card.id));
  g.deck = makeDeck().filter(card => !used.has(card.id));
  return g;
}
const errorCode = code => error => error.classicCardError === true && error.code === code;

test('poker ranks all nine categories and wheel is five-high', () => {
  const examples = [
    [c(14), c(11, 1), c(9, 2), c(6, 3), c(2)],
    [c(14), c(14, 1), c(9, 2), c(6, 3), c(2)],
    [c(14), c(14, 1), c(9, 2), c(9, 3), c(2)],
    [c(14), c(14, 1), c(14, 2), c(6, 3), c(2)],
    [c(14), c(2, 1), c(3, 2), c(4, 3), c(5)],
    [c(14), c(11), c(9), c(6), c(2)],
    [c(14), c(14, 1), c(14, 2), c(6, 3), c(6)],
    [c(14), c(14, 1), c(14, 2), c(14, 3), c(2)],
    [c(10), c(11), c(12), c(13), c(14)],
  ];
  examples.forEach((cards, index) => assert.equal(evaluateFive(cards).value, index));
  assert.deepEqual(evaluateFive(examples[4]).score, [4, 5]);
  assert.equal(compareScore(evaluateFive([c(2), c(3, 1), c(4, 2), c(5, 3), c(6)]).score, evaluateFive(examples[4]).score) > 0, true);
});

test('kickers, two pairs, full houses and flushes compare by ranks without suit ordering', () => {
  assert.equal(compareScore(evaluateFive([c(10), c(10, 1), c(14, 2), c(8, 3), c(2)]).score, evaluateFive([c(10, 2), c(10, 3), c(13), c(12, 1), c(9)]).score) > 0, true);
  assert.equal(compareScore(evaluateFive([c(10), c(10, 1), c(8, 2), c(8, 3), c(14)]).score, evaluateFive([c(10, 2), c(10, 3), c(7), c(7, 1), c(14, 2)]).score) > 0, true);
  assert.equal(compareScore(evaluateFive([c(9), c(9, 1), c(9, 2), c(14), c(14, 1)]).score, evaluateFive([c(8), c(8, 1), c(8, 2), c(14, 2), c(14, 3)]).score) > 0, true);
  assert.equal(compareScore(evaluateFive([c(14), c(11), c(9), c(6), c(3)]).score, evaluateFive([c(14, 3), c(11, 3), c(9, 3), c(6, 3), c(3, 3)]).score), 0);
});

test('best five of seven finds the larger full house, board-playing tie and straight flush', () => {
  assert.deepEqual(evaluateSeven([c(14), c(14, 1), c(14, 2), c(13), c(13, 1), c(13, 2), c(2)]).score, [6, 14, 13]);
  const board = [10, 11, 12, 13, 14].map(rank => c(rank));
  assert.equal(compareScore(evaluateSeven([...board, c(2, 1), c(3, 1)]).score, evaluateSeven([...board, c(14, 2), c(14, 3)]).score), 0);
  assert.equal(evaluateSeven([c(2), c(3), c(4), c(5), c(6), c(14, 3), c(14, 2)]).category, 'straight_flush');
});

test('evaluators reject forged, duplicate or wrong-length cards', () => {
  for (const cards of [[], [c(2), c(3), c(4), c(5)], [c(2), c(3), c(4), c(5), c(5)], [c(2), c(3), c(4), c(5), c(15)], [c(2), c(3), c(4), c(5), c(6, 4)]]) assert.equal(evaluateFive(cards), null);
  assert.equal(evaluateSeven(Array.from({ length: 8 }, (_, i) => c(i + 2))), null);
});

test('2–8 player deal preserves 52 unique cards and starts each free hand with 1000 virtual chips', () => {
  for (let count = 2; count <= 8; count++) {
    const ids = Array.from({ length: count }, (_, i) => `person-${i}`), g = game(ids);
    assert.equal(g.key, 'poker'); assert.equal(g.version, 1); assert.equal(g.deck.length, 52 - count * 2);
    assert.equal(new Set([...g.deck, ...Object.values(g.hands).flat()].map(card => card.id)).size, 52);
    assert.equal(Object.values(g.hands).every(cards => cards.length === 2), true);
    assert.equal(chipTotal(g), count * 1_000);
    assert.equal(view(g, ids[0], 1_001).pot, 30);
  }
  for (const players of [['A'], Array.from({ length: 9 }, (_, i) => String(i)), ['A', 'A']]) assert.throws(() => game(players), errorCode('bad_player_count'));
});

test('heads-up dealer posts small blind, acts first preflop and last after the flop', () => {
  const g = game(['A', 'B']);
  assert.equal(view(g, 'A', 1_001).smallBlindId, 'A'); assert.equal(view(g, 'A', 1_001).bigBlindId, 'B'); assert.equal(turn(g), 'A');
  play(g, 'call'); assert.equal(turn(g), 'B'); assert.equal(view(g, 'B', 1_001).canCheck, true);
  play(g, 'check'); assert.equal(g.stage, 'flop'); assert.equal(g.board.length, 3); assert.equal(g.burned.length, 1); assert.equal(turn(g), 'B');
  play(g, 'check'); assert.equal(turn(g), 'A');
});

test('multiway order begins after the big blind and rotates postflop left of dealer', () => {
  const g = game(['A', 'B', 'C', 'D'], 1);
  assert.equal(turn(g), 'A'); assert.equal(view(g, 'A', 1_001).smallBlindId, 'C'); assert.equal(view(g, 'A', 1_001).bigBlindId, 'D');
  play(g, 'call'); play(g, 'call'); play(g, 'call'); play(g, 'check');
  assert.equal(g.stage, 'flop'); assert.equal(turn(g), 'C'); assert.equal(chipTotal(g), 4_000);
});

test('four betting streets deal 3/1/1 with three burns and showdown conserves chips', () => {
  const g = game(['A', 'B']); play(g, 'call'); play(g, 'check');
  for (const next of ['turn', 'river', 'showdown']) { play(g, 'check'); play(g, 'check'); assert.equal(g.stage, next); }
  assert.equal(g.status, 'finished'); assert.equal(g.board.length, 5); assert.equal(g.burned.length, 3); assert.equal(g.deck.length, 40); assert.equal(chipTotal(g), 2_000);
  assert.equal(g.payouts.reduce((sum, payout) => sum + payout.amount, 0), 40); assert.equal(g.results.length, 2);
});

test('input validation refuses off-turn, unseated, expired, bogus checks/calls and unsafe raise amounts', () => {
  const g = game();
  assert.throws(() => act(g, 'B', { action: 'call' }, 1_001), errorCode('not_turn'));
  assert.throws(() => act(g, 'stranger', { action: 'call' }, 1_001), errorCode('not_player'));
  assert.throws(() => act(g, 'A', { action: 'call' }, g.turnEndsAt), errorCode('turn_expired'));
  assert.throws(() => play(g, 'check'), errorCode('cannot_check'));
  for (const raiseTo of [null, '50', 50.1, -1, NaN, Infinity, 1_001, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => play(g, 'raise', raiseTo), errorCode('bad_raise'));
  assert.throws(() => play(g, 'raise', 20), errorCode('bad_raise')); assert.throws(() => play(g, 'raise', 39), errorCode('raise_too_small'));
  assert.equal(g.version, 1); assert.equal(chipTotal(g), 3_000);
});

test('minimum full raise follows the prior full raise size rather than total wager', () => {
  const g = game(); play(g, 'raise', 50); assert.equal(g.minRaise, 30);
  assert.throws(() => play(g, 'raise', 79), errorCode('raise_too_small'));
  play(g, 'raise', 80); play(g, 'raise', 130); assert.equal(g.minRaise, 50);
  assert.equal(view(g, 'A', 1_001).minRaiseTo, 180); assert.throws(() => play(g, 'raise', 179), errorCode('raise_too_small'));
  play(g, 'raise', 180); assert.equal(g.currentBet, 180); assert.equal(g.version, 5);
});

test('short stack cannot use a full-raise input but can go all-in below the minimum raise', () => {
  const g = game(); g.playerState.A.stack = 30;
  const state = view(g, 'A', 1_001);
  assert.equal(state.minRaiseTo, 40); assert.equal(state.maxRaiseTo, 30); assert.equal(state.canRaise, false); assert.equal(state.canAllIn, true);
  play(g, 'allin'); assert.equal(g.currentBet, 30); assert.equal(g.minRaise, 20); assert.equal(g.playerState.A.allIn, true);
});

test('short all-in does not reopen a prior bettor, but still obliges calls or folds', () => {
  const g = game(['A', 'B', 'C', 'D']);
  g.playerState.B.stack = 110; // 120 total including small blind.
  play(g, 'raise', 100); // D
  play(g, 'call'); // A
  play(g, 'allin'); // B -> 120, only a 20-chip increment.
  play(g, 'call'); // C
  const state = view(g, 'D', 1_001);
  assert.equal(state.toCall, 20); assert.equal(state.canRaise, false); assert.equal(state.canAllIn, false);
  assert.throws(() => play(g, 'raise', 200), errorCode('raise_not_reopened'));
  assert.throws(() => play(g, 'allin'), errorCode('raise_not_reopened'));
  play(g, 'call'); assert.equal(turn(g), 'A'); assert.equal(view(g, 'A', 1_001).canRaise, false);
});

test('cumulative short all-ins reaching a full raise reopen prior players at the last full increment', () => {
  const g = game(['A', 'B', 'C', 'D']); g.playerState.B.stack = 110; g.playerState.C.stack = 160;
  play(g, 'raise', 100); play(g, 'call'); play(g, 'allin'); play(g, 'allin');
  const state = view(g, 'D', 1_001); assert.equal(state.currentBet, 180); assert.equal(state.minRaiseTo, 260); assert.equal(state.canRaise, true);
  play(g, 'raise', 260); assert.equal(g.minRaise, 80); assert.equal(view(g, 'A', 1_001).canRaise, true);
});

test('a short opening all-in is raised by a full increment, never completed to the minimum opening bet', () => {
  const g = street(game()); g.playerState.B.stack = 10;
  play(g, 'check'); play(g, 'allin');
  assert.equal(turn(g), 'C'); assert.equal(view(g, 'C', 1_001).minRaiseTo, 30);
  assert.throws(() => play(g, 'raise', 20), errorCode('raise_too_small'));
  play(g, 'call'); assert.equal(turn(g), 'A');
  assert.equal(view(g, 'A', 1_001).canRaise, false); assert.throws(() => play(g, 'raise', 30), errorCode('raise_not_reopened'));
  play(g, 'call'); assert.equal(g.stage, 'turn');
});

test('a full raise after a short opening wager reopens a checker and keeps the increment correct', () => {
  const g = street(game()); g.playerState.B.stack = 10;
  play(g, 'check'); play(g, 'allin'); play(g, 'raise', 30);
  assert.equal(g.minRaise, 20); assert.equal(view(g, 'A', 1_001).canRaise, true); assert.equal(view(g, 'A', 1_001).minRaiseTo, 50);
});

test('three all-ins create side pots, refund uncalled excess and pay each pot only to an eligible hand', () => {
  const g = street(game());
  g.hands = { A: [c(14), c(14, 1)], B: [c(13), c(13, 1)], C: [c(12), c(12, 1)] };
  g.board = [c(2), c(3, 1), c(4, 2), c(8, 3), c(9)]; g.stage = 'river';
  g.playerState.A.stack = 100; g.playerState.B.stack = 200; g.playerState.C.stack = 300;
  play(g, 'allin'); play(g, 'allin'); play(g, 'allin');
  assert.equal(g.status, 'finished'); assert.equal(chipTotal(g), 600);
  assert.deepEqual(g.payouts, [{ playerId: 'A', amount: 300 }, { playerId: 'B', amount: 200 }]);
  assert.equal(g.playerState.A.stack, 300); assert.equal(g.playerState.B.stack, 200); assert.equal(g.playerState.C.stack, 100);
  assert.deepEqual(g.refunds, [{ playerId: 'C', amount: 100 }]); assert.equal(view(g, 'A', 1_001).pot, 500);
});

test('each tied side pot awards odd chips clockwise after dealer and folded chips stay in pots', () => {
  const g = street(game()); g.stage = 'river'; g.board = [10, 11, 12, 13, 14].map(rank => c(rank));
  g.hands = { A: [c(2, 1), c(3, 1)], B: [c(4, 2), c(5, 2)], C: [c(6, 3), c(7, 3)] };
  g.players.forEach(id => Object.assign(g.playerState[id], { stack: 0, bet: 5, totalBet: 5, allIn: true }));
  g.playerState.C.folded = true; g.currentBet = 5; progress(g, 1_002);
  assert.deepEqual(g.payouts, [{ playerId: 'A', amount: 7 }, { playerId: 'B', amount: 8 }]); assert.equal(chipTotal(g), 15);
  assert.equal(view(g, 'A', 1_002).players.find(player => player.id === 'C').hand, undefined);
  assert.equal(view(g, 'A', 1_002).results.some(result => result.playerId === 'C'), false);
});

test('uncontested winner receives called pot, uncalled excess is returned and no opposing holes are revealed', () => {
  const g = game(['A', 'B']); play(g, 'allin'); play(g, 'fold');
  assert.equal(g.status, 'finished'); assert.equal(g.playerState.A.stack, 1_020); assert.equal(g.playerState.B.stack, 980); assert.equal(chipTotal(g), 2_000);
  const state = view(g, 'B', 1_001); assert.equal(state.pot, 40); assert.equal(state.results, undefined); assert.equal(state.players.every(player => !('hand' in player)), true); assert.equal(state.board.length, 0);
  assert.throws(() => play(g, 'call'), errorCode('game_finished'));
});

test('only one player with chips must meet an all-in call, then board runs out without meaningless bets', () => {
  const g = game(['A', 'B']); g.playerState.A.stack = 90; // Total 100.
  play(g, 'allin'); assert.equal(g.status, 'active'); assert.equal(turn(g), 'B');
  const state = view(g, 'B', 1_001); assert.equal(state.toCall, 80); assert.equal(state.canRaise, false); assert.equal(state.canAllIn, true);
  assert.throws(() => play(g, 'raise', 200), errorCode('no_raise_opponent'));
  play(g, 'allin'); assert.equal(g.status, 'finished'); assert.equal(g.board.length, 5); assert.equal(g.playerState.B.totalBet, 100); assert.equal(chipTotal(g), 1_100);
});

test('safe views reveal only owned holes during play and public showdown contenders at finish', () => {
  const g = game(), state = view(g, 'A', 1_001), spectator = view(g, 'other', 1_001);
  assert.equal(state.hand.length, 2); assert.equal(spectator.hand.length, 0);
  for (const field of ['deck', 'hands', 'burned', 'playerState', 'botSeed', 'results']) assert.equal(field in state, false);
  assert.equal(state.players.every(player => !('hand' in player)), true);
  state.hand[0].rank = 99; state.players[0].stack = 99; assert.notEqual(g.hands.A[0].rank, 99); assert.notEqual(g.playerState.A.stack, 99);
});

test('deadline timeout folds when facing a call and checks if no bet is owed', () => {
  const g = game(); progress(g, 31_000);
  assert.equal(g.playerState.A.folded, true); assert.equal(g.lastAction.type, 'timeout_fold'); assert.equal(g.lastAction.at, 31_000); assert.equal(g.turnEndsAt, 61_000);
  const h = game(['A', 'B']); play(h, 'call', undefined, 2_000); progress(h, 32_000);
  assert.equal(h.stage, 'flop'); assert.equal(h.lastAction.type, 'timeout_check'); assert.equal(h.lastAction.at, 32_000); assert.equal(h.turnEndsAt, 62_000);
});

test('catch-up after interruption uses original deadlines rather than extending hand from restart time', () => {
  const g = game(['A', 'B', 'C', 'D']); progress(g, 121_000);
  assert.equal(g.status, 'finished'); assert.equal(g.finishedAt, new Date(91_000).toISOString()); assert.equal(g.version, 4); assert.equal(chipTotal(g), 4_000);
  const h = street(game(['A', 'B'])); progress(h, 181_000);
  assert.equal(h.stage, 'showdown'); assert.equal(h.finishedAt, new Date(181_000).toISOString()); assert.equal(h.version, 7); assert.equal(chipTotal(h), 2_000);
});

test('bots act after a timed-out player at the exact original timestamp with no millisecond drift', () => {
  const g = street(game(['A', 'bot:tea', 'C'])); g.hands['bot:tea'] = [c(4, 2), c(6, 3)];
  progress(g, 31_000);
  assert.equal(turn(g), 'C'); assert.equal(g.turnEndsAt, 61_000); assert.equal(g.lastAction.at, 31_000); assert.equal(g.version, 3);
});

test('bot decision consumes own hand and public board only, uses legal affordable actions', () => {
  const g = game(['A', 'bot:b', 'C']); play(g, 'call');
  const state = view(g, 'bot:b', 1_001), original = chooseBotAction(state, 0.5);
  g.hands.A = [c(14), c(14, 1)]; g.hands.C = [c(14, 2), c(14, 3)]; g.deck.reverse();
  assert.deepEqual(chooseBotAction(view(g, 'bot:b', 1_001), 0.5), original);
  progress(g, 1_001); assert.equal(turn(g), 'C'); assert.equal(g.version, 3); assert.equal(chipTotal(g), 3_000);
});

test('hundreds of bounded mixed human/bot hands finish without negative or lost virtual chips', () => {
  for (let iteration = 0; iteration < 150; iteration++) {
    const count = 2 + iteration % 7, ids = Array.from({ length: count }, (_, i) => i === 0 || i % 2 ? `human-${i}` : `bot:${i}`), g = game(ids);
    let clock = 1_001;
    for (let actions = 0; actions < 500 && g.status === 'active'; actions++) {
      progress(g, clock); if (g.status !== 'active') break;
      const state = view(g, turn(g), clock);
      if (actions % 17 === 0 && state.canAllIn) play(g, 'allin', undefined, clock);
      else if (state.canCheck) play(g, 'check', undefined, clock);
      else if (actions % 13 === 0) play(g, 'fold', undefined, clock);
      else play(g, 'call', undefined, clock);
      assert.equal(chipTotal(g), count * 1_000);
      assert.equal(Object.values(g.playerState).every(p => p.stack >= 0 && p.bet >= 0 && p.totalBet >= 0), true);
      clock++;
    }
    assert.equal(g.status, 'finished', `iteration ${iteration}`); assert.equal(chipTotal(g), count * 1_000);
  }
});
