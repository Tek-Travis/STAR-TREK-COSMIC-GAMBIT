// ==========================================================================
// Cosmic Armada Gambit - Standalone Vanilla Chess Engine & AI
// Full Standard Chess Rules, En Passant, Castling, Promotion, Alpha-Beta AI
// ==========================================================================

(function(global) {
  'use strict';

  const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
  };

  const PAWN_TABLE_WHITE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  const KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ];

  const BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ];

  function createInitialBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

    // Black pieces (rows 0 and 1)
    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: backRank[c], color: 'b', hasMoved: false };
      board[1][c] = { type: 'p', color: 'b', hasMoved: false };
    }

    // White pieces (rows 6 and 7)
    for (let c = 0; c < 8; c++) {
      board[6][c] = { type: 'p', color: 'w', hasMoved: false };
      board[7][c] = { type: backRank[c], color: 'w', hasMoved: false };
    }

    return board;
  }

  function createInitialState() {
    return {
      board: createInitialBoard(),
      turn: 'w',
      halfmoveClock: 0,
      fullmoveNumber: 1,
      enPassantTarget: null,
      history: [],
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      isDraw: false,
      capturedByWhite: [],
      capturedByBlack: [],
    };
  }

  function cloneBoard(board) {
    return board.map(row => row.map(p => (p ? { ...p } : null)));
  }

  function isWithinBoard(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          return { r, c };
        }
      }
    }
    return null;
  }

  function isSquareAttacked(board, targetR, targetC, defendingColor) {
    const attackingColor = defendingColor === 'w' ? 'b' : 'w';

    // 1. Pawn attacks
    const dir = attackingColor === 'w' ? -1 : 1;
    const pRow = targetR - dir;
    if (isWithinBoard(pRow, targetC - 1)) {
      const p = board[pRow][targetC - 1];
      if (p && p.color === attackingColor && p.type === 'p') return true;
    }
    if (isWithinBoard(pRow, targetC + 1)) {
      const p = board[pRow][targetC + 1];
      if (p && p.color === attackingColor && p.type === 'p') return true;
    }

    // 2. Knight jumps
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of knightOffsets) {
      const r = targetR + dr;
      const c = targetC + dc;
      if (isWithinBoard(r, c)) {
        const p = board[r][c];
        if (p && p.color === attackingColor && p.type === 'n') return true;
      }
    }

    // 3. Orthogonal rays (Rooks, Queens)
    const orthDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthDirs) {
      let r = targetR + dr;
      let c = targetC + dc;
      while (isWithinBoard(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === attackingColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // 4. Diagonal rays (Bishops, Queens)
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDirs) {
      let r = targetR + dr;
      let c = targetC + dc;
      while (isWithinBoard(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === attackingColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // 5. King attacks
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = targetR + dr;
        const c = targetC + dc;
        if (isWithinBoard(r, c)) {
          const p = board[r][c];
          if (p && p.color === attackingColor && p.type === 'k') return true;
        }
      }
    }

    return false;
  }

  function isKingInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) return false;
    return isSquareAttacked(board, king.r, king.c, color);
  }

  function generatePseudoMoves(board, r, c, enPassantTarget) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    const color = piece.color;
    const opp = color === 'w' ? 'b' : 'w';

    if (piece.type === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const nextRow = r + dir;

      // 1 step forward
      if (isWithinBoard(nextRow, c) && !board[nextRow][c]) {
        const isPromo = color === 'w' ? nextRow === 0 : nextRow === 7;
        if (isPromo) {
          ['q', 'r', 'b', 'n'].forEach(promo => {
            moves.push({ from: { r, c }, to: { r: nextRow, c }, piece, promotion: promo });
          });
        } else {
          moves.push({ from: { r, c }, to: { r: nextRow, c }, piece });
        }

        // 2 steps forward
        const doubleRow = r + 2 * dir;
        if (r === startRow && isWithinBoard(doubleRow, c) && !board[doubleRow][c]) {
          moves.push({ from: { r, c }, to: { r: doubleRow, c }, piece });
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const capCol = c + dc;
        if (isWithinBoard(nextRow, capCol)) {
          const target = board[nextRow][capCol];
          if (target && target.color === opp) {
            const isPromo = color === 'w' ? nextRow === 0 : nextRow === 7;
            if (isPromo) {
              ['q', 'r', 'b', 'n'].forEach(promo => {
                moves.push({ from: { r, c }, to: { r: nextRow, c: capCol }, piece, captured: target, promotion: promo });
              });
            } else {
              moves.push({ from: { r, c }, to: { r: nextRow, c: capCol }, piece, captured: target });
            }
          } else if (enPassantTarget && enPassantTarget.r === nextRow && enPassantTarget.c === capCol) {
            moves.push({ from: { r, c }, to: { r: nextRow, c: capCol }, piece, captured: board[r][capCol], isEnPassant: true });
          }
        }
      }
    } else if (piece.type === 'n') {
      const jumps = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dr, dc] of jumps) {
        const nr = r + dr;
        const nc = c + dc;
        if (isWithinBoard(nr, nc)) {
          const dest = board[nr][nc];
          if (!dest || dest.color === opp) {
            moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece, captured: dest });
          }
        }
      }
    } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
      const dirs = [];
      if (piece.type === 'b' || piece.type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      if (piece.type === 'r' || piece.type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (isWithinBoard(nr, nc)) {
          const dest = board[nr][nc];
          if (!dest) {
            moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece });
          } else {
            if (dest.color === opp) {
              moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece, captured: dest });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    } else if (piece.type === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (isWithinBoard(nr, nc)) {
            const dest = board[nr][nc];
            if (!dest || dest.color === opp) {
              moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece, captured: dest });
            }
          }
        }
      }

      // Castling
      if (!piece.hasMoved && !isKingInCheck(board, color)) {
        const rank = color === 'w' ? 7 : 0;
        if (r === rank && c === 4) {
          // Kingside
          const kr = board[rank][7];
          if (kr && kr.type === 'r' && kr.color === color && !kr.hasMoved && !board[rank][5] && !board[rank][6]) {
            if (!isSquareAttacked(board, rank, 5, color) && !isSquareAttacked(board, rank, 6, color)) {
              moves.push({ from: { r, c }, to: { r: rank, c: 6 }, piece, isCastling: 'kingside' });
            }
          }
          // Queenside
          const qr = board[rank][0];
          if (qr && qr.type === 'r' && qr.color === color && !qr.hasMoved && !board[rank][1] && !board[rank][2] && !board[rank][3]) {
            if (!isSquareAttacked(board, rank, 2, color) && !isSquareAttacked(board, rank, 3, color)) {
              moves.push({ from: { r, c }, to: { r: rank, c: 2 }, piece, isCastling: 'queenside' });
            }
          }
        }
      }
    }

    return moves;
  }

  function applyMoveDraft(board, move) {
    const newBoard = cloneBoard(board);
    const { from, to, isEnPassant, isCastling, promotion } = move;

    const moving = { ...newBoard[from.r][from.c] };
    moving.hasMoved = true;
    if (promotion) moving.type = promotion;

    newBoard[to.r][to.c] = moving;
    newBoard[from.r][from.c] = null;

    if (isEnPassant) {
      newBoard[from.r][to.c] = null;
    }

    if (isCastling === 'kingside') {
      const rook = { ...newBoard[from.r][7] };
      rook.hasMoved = true;
      newBoard[from.r][5] = rook;
      newBoard[from.r][7] = null;
    } else if (isCastling === 'queenside') {
      const rook = { ...newBoard[from.r][0] };
      rook.hasMoved = true;
      newBoard[from.r][3] = rook;
      newBoard[from.r][0] = null;
    }

    return newBoard;
  }

  function getLegalMoves(state, color = state.turn) {
    const legal = [];
    const { board, enPassantTarget } = state;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === color) {
          const pseudo = generatePseudoMoves(board, r, c, enPassantTarget);
          for (const m of pseudo) {
            const testBoard = applyMoveDraft(board, m);
            if (!isKingInCheck(testBoard, color)) {
              legal.push(m);
            }
          }
        }
      }
    }

    return legal;
  }

  function getLegalMovesForSquare(state, r, c) {
    return getLegalMoves(state, state.turn).filter(m => m.from.r === r && m.from.c === c);
  }

  function makeMove(state, move) {
    const newBoard = applyMoveDraft(state.board, move);
    const nextTurn = state.turn === 'w' ? 'b' : 'w';

    let nextEnPassant = null;
    if (move.piece.type === 'p' && Math.abs(move.to.r - move.from.r) === 2) {
      nextEnPassant = { r: (move.to.r + move.from.r) / 2, c: move.to.c };
    }

    const isPawnOrCap = move.piece.type === 'p' || Boolean(move.captured);
    const nextHalfmove = isPawnOrCap ? 0 : state.halfmoveClock + 1;
    const nextFullmove = state.turn === 'b' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

    const capturedW = [...state.capturedByWhite];
    const capturedB = [...state.capturedByBlack];
    if (move.captured) {
      if (state.turn === 'w') capturedW.push(move.captured);
      else capturedB.push(move.captured);
    }

    const tempState = {
      board: newBoard,
      turn: nextTurn,
      halfmoveClock: nextHalfmove,
      fullmoveNumber: nextFullmove,
      enPassantTarget: nextEnPassant,
      history: state.history,
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      isDraw: false,
      capturedByWhite: capturedW,
      capturedByBlack: capturedB,
    };

    const isCheck = isKingInCheck(newBoard, nextTurn);
    const nextLegal = getLegalMoves(tempState, nextTurn);
    const isCheckmate = isCheck && nextLegal.length === 0;
    const isStalemate = !isCheck && nextLegal.length === 0;
    const is50Draw = nextHalfmove >= 100;

    return {
      board: newBoard,
      turn: nextTurn,
      halfmoveClock: nextHalfmove,
      fullmoveNumber: nextFullmove,
      enPassantTarget: nextEnPassant,
      history: [...state.history, move],
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw: isStalemate || is50Draw,
      capturedByWhite: capturedW,
      capturedByBlack: capturedB,
    };
  }

  // AI Evaluation & Alpha-Beta Search
  function evaluateBoard(state) {
    if (state.isCheckmate) return state.turn === 'w' ? -99999 : 99999;
    if (state.isStalemate || state.isDraw) return 0;

    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (!p) continue;
        const base = PIECE_VALUES[p.type];
        let pos = 0;
        if (p.type === 'p') {
          pos = p.color === 'w' ? PAWN_TABLE_WHITE[r][c] : PAWN_TABLE_WHITE[7 - r][c];
        } else if (p.type === 'n') {
          pos = KNIGHT_TABLE[r][c];
        } else if (p.type === 'b') {
          pos = BISHOP_TABLE[r][c];
        }
        score += (p.color === 'w' ? 1 : -1) * (base + pos);
      }
    }
    return score;
  }

  function scoreMoveForOrdering(m) {
    let s = 0;
    if (m.captured) s += 10 * PIECE_VALUES[m.captured.type] - PIECE_VALUES[m.piece.type];
    if (m.promotion) s += PIECE_VALUES[m.promotion];
    if (m.isCastling) s += 60;
    return s;
  }

  function minimax(state, depth, alpha, beta, isMax, startTime, maxTime) {
    if (depth === 0 || state.isCheckmate || state.isDraw || (performance.now() - startTime > maxTime)) {
      return evaluateBoard(state);
    }
    const moves = getLegalMoves(state, state.turn);
    if (!moves.length) return evaluateBoard(state);

    moves.sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

    if (isMax) {
      let maxEval = -Infinity;
      for (const m of moves) {
        const ev = minimax(makeMove(state, m), depth - 1, alpha, beta, false, startTime, maxTime);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        const ev = minimax(makeMove(state, m), depth - 1, alpha, beta, true, startTime, maxTime);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function findBestMove(state, difficulty = 2) {
    const legal = getLegalMoves(state, state.turn);
    if (!legal.length) return null;

    // Easy (Cadet)
    if (difficulty <= 1) {
      const caps = legal.filter(m => m.captured);
      if (caps.length && Math.random() < 0.65) {
        return caps[Math.floor(Math.random() * caps.length)];
      }
      return legal[Math.floor(Math.random() * legal.length)];
    }

    const isMax = state.turn === 'w';
    const depth = 2;
    const sorted = [...legal].sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

    let best = null;
    let bestScore = isMax ? -Infinity : Infinity;
    const startTime = performance.now();
    const maxTime = 180;

    for (const m of sorted) {
      if (performance.now() - startTime > maxTime && best !== null) break;
      const score = minimax(makeMove(state, m), depth - 1, -Infinity, Infinity, !isMax, startTime, maxTime);
      if (isMax ? score > bestScore : score < bestScore) {
        bestScore = score;
        best = m;
      }
    }

    return best || sorted[0];
  }

  // Export
  global.ChessEngine = {
    createInitialState,
    getLegalMoves,
    getLegalMovesForSquare,
    makeMove,
    findKing,
    findBestMove,
  };
})(window);
