/* Generated from D:/chess/packages/rules (board, movegen, game). */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/rules/src/index.ts
var index_exports = {};
__export(index_exports, {
  FILES: () => FILES,
  INITIAL_FEN: () => INITIAL_FEN,
  MOVE_LIMIT_PLIES: () => MOVE_LIMIT_PLIES,
  RANKS: () => RANKS,
  fileOf: () => fileOf,
  isInCheck: () => isInCheck,
  legalMoves: () => legalMoves,
  makeMove: () => makeMove,
  moveToUci: () => moveToUci,
  newGame: () => newGame,
  onBoard: () => onBoard,
  opposite: () => opposite,
  parseFen: () => parseFen,
  parseUciMove: () => parseUciMove,
  perft: () => perft,
  play: () => play,
  positionKey: () => positionKey,
  pseudoMoves: () => pseudoMoves,
  rankOf: () => rankOf,
  sq: () => sq,
  squareToUci: () => squareToUci,
  toFen: () => toFen,
  uciToSquare: () => uciToSquare
});
module.exports = __toCommonJS(index_exports);

// packages/rules/src/board.ts
var FILES = 9;
var RANKS = 10;
var INITIAL_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
var sq = (x, y) => y * FILES + x;
var fileOf = (s) => s % FILES;
var rankOf = (s) => Math.floor(s / FILES);
var onBoard = (x, y) => x >= 0 && x < FILES && y >= 0 && y < RANKS;
var opposite = (c) => c === "r" ? "b" : "r";
var PIECE_TYPES = /* @__PURE__ */ new Set(["k", "a", "b", "n", "r", "c", "p"]);
function parseFen(fen) {
  const [placement, side = "w", , , half = "0", full = "1"] = fen.trim().split(/\s+/);
  const rows = (placement ?? "").split("/");
  if (rows.length !== RANKS) throw new Error(`Invalid FEN: expected ${RANKS} ranks`);
  const board = new Array(FILES * RANKS).fill(null);
  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        x += Number(ch);
        continue;
      }
      const type = ch.toLowerCase();
      if (!PIECE_TYPES.has(type)) throw new Error(`Invalid FEN piece: ${ch}`);
      if (x >= FILES) throw new Error("Invalid FEN: rank too long");
      board[sq(x, y)] = { color: ch === ch.toUpperCase() ? "r" : "b", type };
      x++;
    }
    if (x !== FILES) throw new Error(`Invalid FEN: rank ${y} has ${x} files`);
  });
  if (side !== "w" && side !== "b" && side !== "r") throw new Error("Invalid FEN side to move");
  return {
    board,
    turn: side === "b" ? "b" : "r",
    halfmoveClock: Number(half) || 0,
    fullmoveNumber: Number(full) || 1
  };
}
function positionKey(pos) {
  const rows = [];
  for (let y = 0; y < RANKS; y++) {
    let row = "";
    let empty = 0;
    for (let x = 0; x < FILES; x++) {
      const p = pos.board[sq(x, y)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p.color === "r" ? p.type.toUpperCase() : p.type;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${pos.turn === "r" ? "w" : "b"}`;
}
function toFen(pos) {
  return `${positionKey(pos)} - - ${pos.halfmoveClock} ${pos.fullmoveNumber}`;
}
function moveToUci(m) {
  return squareToUci(m.from) + squareToUci(m.to);
}
function squareToUci(s) {
  return String.fromCharCode(97 + fileOf(s)) + (RANKS - 1 - rankOf(s));
}
function uciToSquare(text) {
  const m = /^([a-i])(\d)$/.exec(text);
  if (!m) return null;
  return sq(m[1].charCodeAt(0) - 97, RANKS - 1 - Number(m[2]));
}
function parseUciMove(text) {
  if (typeof text !== "string" || text.length !== 4) return null;
  const from = uciToSquare(text.slice(0, 2));
  const to = uciToSquare(text.slice(2, 4));
  if (from === null || to === null || from === to) return null;
  return { from, to };
}

// packages/rules/src/movegen.ts
var ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
var DIAGONAL = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
];
var HORSE = [
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1]
];
var inPalace = (x, y, color) => x >= 3 && x <= 5 && (color === "b" ? y >= 0 && y <= 2 : y >= 7 && y <= 9);
var onOwnSide = (y, color) => color === "r" ? y >= 5 : y <= 4;
var forward = (color) => color === "r" ? -1 : 1;
function pseudoMovesOnBoard(board, color) {
  const moves = [];
  const add = (from, x, y) => {
    if (!onBoard(x, y)) return;
    const to = sq(x, y);
    const target = board[to];
    if (!target || target.color !== color) moves.push({ from, to });
  };
  for (let from = 0; from < board.length; from++) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;
    const x = fileOf(from);
    const y = rankOf(from);
    switch (piece.type) {
      case "k":
        for (const [dx, dy] of ORTHOGONAL) {
          if (inPalace(x + dx, y + dy, color)) add(from, x + dx, y + dy);
        }
        break;
      case "a":
        for (const [dx, dy] of DIAGONAL) {
          if (inPalace(x + dx, y + dy, color)) add(from, x + dx, y + dy);
        }
        break;
      case "b":
        for (const [dx, dy] of DIAGONAL) {
          const tx = x + 2 * dx;
          const ty = y + 2 * dy;
          if (!onBoard(tx, ty) || !onOwnSide(ty, color)) continue;
          if (board[sq(x + dx, y + dy)]) continue;
          add(from, tx, ty);
        }
        break;
      case "n":
        for (const [dx, dy] of HORSE) {
          const tx = x + dx;
          const ty = y + dy;
          if (!onBoard(tx, ty)) continue;
          const legX = Math.abs(dx) === 2 ? x + Math.sign(dx) : x;
          const legY = Math.abs(dy) === 2 ? y + Math.sign(dy) : y;
          if (board[sq(legX, legY)]) continue;
          add(from, tx, ty);
        }
        break;
      case "r":
        for (const [dx, dy] of ORTHOGONAL) {
          let tx = x + dx;
          let ty = y + dy;
          while (onBoard(tx, ty)) {
            const target = board[sq(tx, ty)];
            if (!target) {
              moves.push({ from, to: sq(tx, ty) });
            } else {
              if (target.color !== color) moves.push({ from, to: sq(tx, ty) });
              break;
            }
            tx += dx;
            ty += dy;
          }
        }
        break;
      case "c":
        for (const [dx, dy] of ORTHOGONAL) {
          let tx = x + dx;
          let ty = y + dy;
          let jumped = false;
          while (onBoard(tx, ty)) {
            const target = board[sq(tx, ty)];
            if (!jumped) {
              if (!target) moves.push({ from, to: sq(tx, ty) });
              else jumped = true;
            } else if (target) {
              if (target.color !== color) moves.push({ from, to: sq(tx, ty) });
              break;
            }
            tx += dx;
            ty += dy;
          }
        }
        break;
      case "p": {
        add(from, x, y + forward(color));
        if (!onOwnSide(y, color)) {
          add(from, x - 1, y);
          add(from, x + 1, y);
        }
        break;
      }
    }
  }
  return moves;
}
function pseudoMoves(pos, color) {
  return pseudoMovesOnBoard(pos.board, color);
}
function findGeneral(board, color) {
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    if (p && p.type === "k" && p.color === color) return s;
  }
  return -1;
}
function isInCheck(board, color) {
  const king = findGeneral(board, color);
  if (king < 0) return true;
  const enemy = opposite(color);
  const kx = fileOf(king);
  const ky = rankOf(king);
  for (const [dx, dy] of ORTHOGONAL) {
    let tx = kx + dx;
    let ty = ky + dy;
    let screens = 0;
    while (onBoard(tx, ty)) {
      const p = board[sq(tx, ty)];
      if (p) {
        if (screens === 0) {
          if (p.color === enemy && (p.type === "r" || p.type === "k" && dx === 0)) return true;
        } else {
          if (p.color === enemy && p.type === "c") return true;
          break;
        }
        screens++;
      }
      tx += dx;
      ty += dy;
    }
  }
  for (const [dx, dy] of HORSE) {
    const hx = kx - dx;
    const hy = ky - dy;
    if (!onBoard(hx, hy)) continue;
    const p = board[sq(hx, hy)];
    if (!p || p.color !== enemy || p.type !== "n") continue;
    const legX = Math.abs(dx) === 2 ? hx + Math.sign(dx) : hx;
    const legY = Math.abs(dy) === 2 ? hy + Math.sign(dy) : hy;
    if (!board[sq(legX, legY)]) return true;
  }
  const behind = ky - forward(enemy);
  if (onBoard(kx, behind)) {
    const p = board[sq(kx, behind)];
    if (p && p.color === enemy && p.type === "p") return true;
  }
  for (const side of [-1, 1]) {
    if (!onBoard(kx + side, ky)) continue;
    const p = board[sq(kx + side, ky)];
    if (p && p.color === enemy && p.type === "p" && !onOwnSide(ky, enemy)) return true;
  }
  return false;
}
function makeMove(pos, move) {
  const board = pos.board.slice();
  const captured = board[move.to];
  board[move.to] = board[move.from] ?? null;
  board[move.from] = null;
  return {
    board,
    turn: opposite(pos.turn),
    halfmoveClock: captured ? 0 : pos.halfmoveClock + 1,
    fullmoveNumber: pos.turn === "b" ? pos.fullmoveNumber + 1 : pos.fullmoveNumber
  };
}
function legalMovesOnBoard(board, color) {
  const legal = [];
  for (const m of pseudoMovesOnBoard(board, color)) {
    const captured = board[m.to] ?? null;
    board[m.to] = board[m.from] ?? null;
    board[m.from] = null;
    if (!isInCheck(board, color)) legal.push(m);
    board[m.from] = board[m.to] ?? null;
    board[m.to] = captured;
  }
  return legal;
}
function legalMoves(pos) {
  return legalMovesOnBoard(pos.board.slice(), pos.turn);
}
function perft(pos, depth) {
  const board = pos.board.slice();
  const walk = (color, d) => {
    const moves = legalMovesOnBoard(board, color);
    if (d === 1) return moves.length;
    let nodes = 0;
    for (const m of moves) {
      const captured = board[m.to] ?? null;
      board[m.to] = board[m.from] ?? null;
      board[m.from] = null;
      nodes += walk(opposite(color), d - 1);
      board[m.from] = board[m.to] ?? null;
      board[m.to] = captured;
    }
    return nodes;
  };
  return depth <= 0 ? 1 : walk(pos.turn, depth);
}

// packages/rules/src/game.ts
var MOVE_LIMIT_PLIES = 120;
var ATTACKERS = /* @__PURE__ */ new Set(["r", "n", "c", "p"]);
function newGame(fen = INITIAL_FEN) {
  const position = parseFen(fen);
  return { startFen: fen, position, history: [], result: evaluate(fen, position, []) };
}
function play(state, uci) {
  if (state.result) return { ok: false, error: "GAME_OVER" };
  const move = parseUciMove(uci);
  if (!move) return { ok: false, error: "BAD_FORMAT" };
  if (!legalMoves(state.position).some((m) => m.from === move.from && m.to === move.to)) {
    return { ok: false, error: "ILLEGAL_MOVE" };
  }
  const position = makeMove(state.position, move);
  const history = [
    ...state.history,
    { key: positionKey(position), gaveCheck: isInCheck(position.board, position.turn), uci }
  ];
  return {
    ok: true,
    state: { startFen: state.startFen, position, history, result: evaluate(state.startFen, position, history) }
  };
}
function evaluate(startFen, position, history) {
  if (legalMoves(position).length === 0) {
    return {
      winner: opposite(position.turn),
      reason: isInCheck(position.board, position.turn) ? "checkmate" : "stalemate"
    };
  }
  const repetition = checkRepetition(startFen, history);
  if (repetition) return repetition;
  if (position.halfmoveClock >= MOVE_LIMIT_PLIES) return { winner: null, reason: "move_limit" };
  if (!position.board.some((p) => p && ATTACKERS.has(p.type))) {
    return { winner: null, reason: "insufficient_material" };
  }
  return null;
}
function checkRepetition(startFen, history) {
  const last = history.at(-1);
  if (!last) return null;
  const start = parseFen(startFen);
  const keys = [positionKey(start), ...history.map((h) => h.key)];
  const occurrences = keys.flatMap((k, i) => k === last.key ? [i] : []);
  if (occurrences.length < 3) return null;
  const cycleStart = occurrences[occurrences.length - 3];
  const allChecks = { r: true, b: true };
  for (let i = cycleStart; i < history.length; i++) {
    const mover = i % 2 === 0 ? start.turn : opposite(start.turn);
    if (!history[i].gaveCheck) allChecks[mover] = false;
  }
  if (allChecks.r !== allChecks.b) {
    return { winner: allChecks.r ? "b" : "r", reason: "perpetual_check" };
  }
  return { winner: null, reason: "repetition" };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FILES,
  INITIAL_FEN,
  MOVE_LIMIT_PLIES,
  RANKS,
  fileOf,
  isInCheck,
  legalMoves,
  makeMove,
  moveToUci,
  newGame,
  onBoard,
  opposite,
  parseFen,
  parseUciMove,
  perft,
  play,
  positionKey,
  pseudoMoves,
  rankOf,
  sq,
  squareToUci,
  toFen,
  uciToSquare
});
