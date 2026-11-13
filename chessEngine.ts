// Authoritative 8x8 Chess Engine with Full Standard Rules
// Validates: Castling, En Passant, Pawn Promotion, In-Check, Checkmate, Stalemate, 50-move rule

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export type Board = (Piece | null)[][]; // 8x8 array: [row 0..7][col 0..7]. row 0 is rank 8 (Black), row 7 is rank 1 (White)

export interface Move {
  from: {r: number; c: number};
  to: {r: number; c: number};
  piece: Piece;
  captured?: Piece | null;
  isEnPassant?: boolean;
  isCastling?: 'kingside' | 'queenside';
  promotion?: PieceType;
  notation?: string;
}

export interface ChessState {
  board: Board;
  turn: PieceColor;
  halfmoveClock: number; // For 50-move rule
  fullmoveNumber: number;
  enPassantTarget: {r: number; c: number} | null; // target square behind double-moved pawn
  history: Move[];
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  capturedByWhite: Piece[];
  capturedByBlack: Piece[];
}

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Standard starting board
export function createInitialBoard(): Board {
  const board: Board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));

  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  // Black pieces (top: row 0 and 1)
  for (let c = 0; c < 8; c++) {
    board[0][c] = {type: backRank[c], color: 'b', hasMoved: false};
    board[1][c] = {type: 'p', color: 'b', hasMoved: false};
  }

  // White pieces (bottom: row 6 and 7)
  for (let c = 0; c < 8; c++) {
    board[6][c] = {type: 'p', color: 'w', hasMoved: false};
    board[7][c] = {type: backRank[c], color: 'w', hasMoved: false};
  }

  return board;
}

export function createInitialState(): ChessState {
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

export function cloneBoard(board: Board): Board {
  return board.map((row) =>
    row.map((piece) => (piece ? {...piece} : null)),
  );
}

export function isWithinBoard(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function findKing(board: Board, color: PieceColor): {r: number; c: number} | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'k' && piece.color === color) {
        return {r, c};
      }
    }
  }
  return null;
}

// Check if square (targetR, targetC) is attacked by enemy of `defendingColor`
export function isSquareAttacked(
  board: Board,
  targetR: number,
  targetC: number,
  defendingColor: PieceColor,
): boolean {
  const attackingColor: PieceColor = defendingColor === 'w' ? 'b' : 'w';

  // 1. Pawn attacks
  const pawnProwDir = attackingColor === 'w' ? -1 : 1;
  const attackingPawnRow = targetR - pawnProwDir;
  if (isWithinBoard(attackingPawnRow, targetC - 1)) {
    const p = board[attackingPawnRow][targetC - 1];
    if (p && p.color === attackingColor && p.type === 'p') return true;
  }
  if (isWithinBoard(attackingPawnRow, targetC + 1)) {
    const p = board[attackingPawnRow][targetC + 1];
    if (p && p.color === attackingColor && p.type === 'p') return true;
  }

  // 2. Knight attacks
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
  const orthogonalDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of orthogonalDirs) {
    let r = targetR + dr;
    let c = targetC + dc;
    while (isWithinBoard(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === attackingColor && (p.type === 'r' || p.type === 'q')) {
          return true;
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // 4. Diagonal rays (Bishops, Queens)
  const diagonalDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diagonalDirs) {
    let r = targetR + dr;
    let c = targetC + dc;
    while (isWithinBoard(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === attackingColor && (p.type === 'b' || p.type === 'q')) {
          return true;
        }
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

export function isKingInCheck(board: Board, color: PieceColor): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isSquareAttacked(board, kingPos.r, kingPos.c, color);
}

// Pseudo-legal move generator for a specific square
function generatePseudoMoves(
  board: Board,
  r: number,
  c: number,
  enPassantTarget: {r: number; c: number} | null,
): Move[] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: Move[] = [];
  const color = piece.color;
  const oppColor: PieceColor = color === 'w' ? 'b' : 'w';

  if (piece.type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const nextRow = r + dir;

    // Single step forward
    if (isWithinBoard(nextRow, c) && !board[nextRow][c]) {
      // Check promotion
      const isPromo = color === 'w' ? nextRow === 0 : nextRow === 7;
      if (isPromo) {
        (['q', 'r', 'b', 'n'] as PieceType[]).forEach((promo) => {
          moves.push({from: {r, c}, to: {r: nextRow, c}, piece, promotion: promo});
        });
      } else {
        moves.push({from: {r, c}, to: {r: nextRow, c}, piece});
      }

      // Double step from start
      const doubleRow = r + 2 * dir;
      if (r === startRow && isWithinBoard(doubleRow, c) && !board[doubleRow][c]) {
        moves.push({from: {r, c}, to: {r: doubleRow, c}, piece});
      }
    }

    // Diagonal captures
    for (const dc of [-1, 1]) {
      const capCol = c + dc;
      if (isWithinBoard(nextRow, capCol)) {
        const target = board[nextRow][capCol];
        if (target && target.color === oppColor) {
          const isPromo = color === 'w' ? nextRow === 0 : nextRow === 7;
          if (isPromo) {
            (['q', 'r', 'b', 'n'] as PieceType[]).forEach((promo) => {
              moves.push({
                from: {r, c},
                to: {r: nextRow, c: capCol},
                piece,
                captured: target,
                promotion: promo,
              });
            });
          } else {
            moves.push({
              from: {r, c},
              to: {r: nextRow, c: capCol},
              piece,
              captured: target,
            });
          }
        } else if (
          enPassantTarget &&
          enPassantTarget.r === nextRow &&
          enPassantTarget.c === capCol
        ) {
          // En passant capture
          const capturedPawn = board[r][capCol];
          moves.push({
            from: {r, c},
            to: {r: nextRow, c: capCol},
            piece,
            captured: capturedPawn,
            isEnPassant: true,
          });
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
        if (!dest || dest.color === oppColor) {
          moves.push({from: {r, c}, to: {r: nr, c: nc}, piece, captured: dest});
        }
      }
    }
  } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
    const dirs: number[][] = [];
    if (piece.type === 'b' || piece.type === 'q') {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (piece.type === 'r' || piece.type === 'q') {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }

    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (isWithinBoard(nr, nc)) {
        const dest = board[nr][nc];
        if (!dest) {
          moves.push({from: {r, c}, to: {r: nr, c: nc}, piece});
        } else {
          if (dest.color === oppColor) {
            moves.push({from: {r, c}, to: {r: nr, c: nc}, piece, captured: dest});
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
          if (!dest || dest.color === oppColor) {
            moves.push({from: {r, c}, to: {r: nr, c: nc}, piece, captured: dest});
          }
        }
      }
    }

    // Castling
    if (!piece.hasMoved && !isKingInCheck(board, color)) {
      const rank = color === 'w' ? 7 : 0;
      if (r === rank && c === 4) {
        // Kingside castling (to c=6)
        const kingsideRook = board[rank][7];
        if (
          kingsideRook &&
          kingsideRook.type === 'r' &&
          kingsideRook.color === color &&
          !kingsideRook.hasMoved &&
          !board[rank][5] &&
          !board[rank][6]
        ) {
          // Squares 5 and 6 must not be attacked
          if (
            !isSquareAttacked(board, rank, 5, color) &&
            !isSquareAttacked(board, rank, 6, color)
          ) {
            moves.push({
              from: {r, c},
              to: {r: rank, c: 6},
              piece,
              isCastling: 'kingside',
            });
          }
        }

        // Queenside castling (to c=2)
        const queensideRook = board[rank][0];
        if (
          queensideRook &&
          queensideRook.type === 'r' &&
          queensideRook.color === color &&
          !queensideRook.hasMoved &&
          !board[rank][1] &&
          !board[rank][2] &&
          !board[rank][3]
        ) {
          // Squares 2 and 3 must not be attacked
          if (
            !isSquareAttacked(board, rank, 2, color) &&
            !isSquareAttacked(board, rank, 3, color)
          ) {
            moves.push({
              from: {r, c},
              to: {r: rank, c: 2},
              piece,
              isCastling: 'queenside',
            });
          }
        }
      }
    }
  }

  return moves;
}

// Simulates a move on board copy to verify it doesn't leave own King in check
export function applyMoveDraft(board: Board, move: Move): Board {
  const newBoard = cloneBoard(board);
  const {from, to, isEnPassant, isCastling, promotion} = move;

  const movingPiece = {...newBoard[from.r][from.c]!};
  movingPiece.hasMoved = true;

  if (promotion) {
    movingPiece.type = promotion;
  }

  newBoard[to.r][to.c] = movingPiece;
  newBoard[from.r][from.c] = null;

  if (isEnPassant) {
    // Remove the captured pawn on from.r, to.c
    newBoard[from.r][to.c] = null;
  }

  if (isCastling === 'kingside') {
    const rook = {...newBoard[from.r][7]!};
    rook.hasMoved = true;
    newBoard[from.r][5] = rook;
    newBoard[from.r][7] = null;
  } else if (isCastling === 'queenside') {
    const rook = {...newBoard[from.r][0]!};
    rook.hasMoved = true;
    newBoard[from.r][3] = rook;
    newBoard[from.r][0] = null;
  }

  return newBoard;
}

// Generate all fully legal moves for `color`
export function getLegalMoves(state: ChessState, color: PieceColor = state.turn): Move[] {
  const legal: Move[] = [];
  const {board, enPassantTarget} = state;

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

// Returns legal moves for a specific piece square
export function getLegalMovesForSquare(
  state: ChessState,
  r: number,
  c: number,
): Move[] {
  const all = getLegalMoves(state, state.turn);
  return all.filter((m) => m.from.r === r && m.from.c === c);
}

// Convert coordinates to algebraic notation (e.g. {r: 7, c: 4} -> "e1")
export function squareToAlgebraic(r: number, c: number): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  return `${files[c]}${ranks[r]}`;
}

export function generateMoveNotation(board: Board, move: Move, isCheckResult: boolean, isCheckmateResult: boolean): string {
  if (move.isCastling === 'kingside') return 'O-O' + (isCheckmateResult ? '#' : isCheckResult ? '+' : '');
  if (move.isCastling === 'queenside') return 'O-O-O' + (isCheckmateResult ? '#' : isCheckResult ? '+' : '');

  const pieceChar = move.piece.type.toUpperCase();
  const toSquare = squareToAlgebraic(move.to.r, move.to.c);
  let not = '';

  if (move.piece.type === 'p') {
    if (move.captured) {
      not = `${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][move.from.c]}x${toSquare}`;
    } else {
      not = toSquare;
    }
    if (move.promotion) {
      not += `=${move.promotion.toUpperCase()}`;
    }
  } else {
    not = pieceChar;
    if (move.captured) not += 'x';
    not += toSquare;
  }

  if (isCheckmateResult) not += '#';
  else if (isCheckResult) not += '+';

  return not;
}

// Executes an authoritative legal move
export function makeMove(state: ChessState, move: Move): ChessState {
  const newBoard = applyMoveDraft(state.board, move);
  const nextTurn: PieceColor = state.turn === 'w' ? 'b' : 'w';

  // En passant target calculation
  let nextEnPassant: {r: number; c: number} | null = null;
  if (
    move.piece.type === 'p' &&
    Math.abs(move.to.r - move.from.r) === 2
  ) {
    const middleRow = (move.to.r + move.from.r) / 2;
    nextEnPassant = {r: middleRow, c: move.to.c};
  }

  // Halfmove clock (resets on pawn move or capture)
  const isPawnOrCapture = move.piece.type === 'p' || Boolean(move.captured);
  const nextHalfmove = isPawnOrCapture ? 0 : state.halfmoveClock + 1;
  const nextFullmove = state.turn === 'b' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

  // Track captured pieces
  const capturedW = [...state.capturedByWhite];
  const capturedB = [...state.capturedByBlack];
  if (move.captured) {
    if (state.turn === 'w') {
      capturedW.push(move.captured);
    } else {
      capturedB.push(move.captured);
    }
  }

  // Pre-test status of next player
  const tempState: ChessState = {
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
  const nextLegalMoves = getLegalMoves(tempState, nextTurn);
  const isCheckmate = isCheck && nextLegalMoves.length === 0;
  const isStalemate = !isCheck && nextLegalMoves.length === 0;
  const is50MoveDraw = nextHalfmove >= 100; // 50 full moves

  const notation = generateMoveNotation(state.board, move, isCheck, isCheckmate);
  const finalizedMove: Move = {...move, notation};

  return {
    board: newBoard,
    turn: nextTurn,
    halfmoveClock: nextHalfmove,
    fullmoveNumber: nextFullmove,
    enPassantTarget: nextEnPassant,
    history: [...state.history, finalizedMove],
    isCheck,
    isCheckmate,
    isStalemate,
    isDraw: isStalemate || is50MoveDraw,
    capturedByWhite: capturedW,
    capturedByBlack: capturedB,
  };
}

// -------------------------------------------------------------
// LOCAL HEURISTIC CHESS AI (Runs entirely client-side, zero lag)
// Positional Heatmaps + Material + Safety + Fast Alpha-Beta Pruning
// -------------------------------------------------------------

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

function evaluateBoard(state: ChessState): number {
  if (state.isCheckmate) {
    return state.turn === 'w' ? -99999 : 99999;
  }
  if (state.isStalemate || state.isDraw) return 0;

  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const baseVal = PIECE_VALUES[p.type];
      let posVal = 0;

      if (p.type === 'p') {
        posVal = p.color === 'w' ? PAWN_TABLE_WHITE[r][c] : PAWN_TABLE_WHITE[7 - r][c];
      } else if (p.type === 'n') {
        posVal = KNIGHT_TABLE[r][c];
      } else if (p.type === 'b') {
        posVal = BISHOP_TABLE[r][c];
      }

      const totalVal = baseVal + posVal;
      score += p.color === 'w' ? totalVal : -totalVal;
    }
  }

  return score;
}

function scoreMoveForOrdering(m: Move): number {
  let score = 0;
  if (m.captured) {
    score += 10 * PIECE_VALUES[m.captured.type] - PIECE_VALUES[m.piece.type];
  }
  if (m.promotion) {
    score += PIECE_VALUES[m.promotion];
  }
  if (m.isCastling) {
    score += 60;
  }
  return score;
}

export function findBestMove(state: ChessState, difficulty: number): Move | null {
  const legalMoves = getLegalMoves(state, state.turn);
  if (legalMoves.length === 0) return null;

  // Easy (Cadet): capture bias with slight random variance
  if (difficulty <= 1) {
    const captures = legalMoves.filter((m) => m.captured);
    if (captures.length > 0 && Math.random() < 0.65) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  // Medium (Commander, depth 2) or Hard (Admiral, depth 2 with deep ordering)
  const isMaximizing = state.turn === 'w';
  const maxDepth = difficulty >= 3 ? 2 : 2;

  let bestMove: Move | null = null;
  let bestScore = isMaximizing ? -Infinity : Infinity;

  // Sort candidate moves so best tactical moves are evaluated first
  const sortedMoves = [...legalMoves].sort(
    (a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a),
  );

  const startTime = performance.now();
  const maxTimeMs = 180; // Guarantee never freezing the UI thread

  for (const move of sortedMoves) {
    if (performance.now() - startTime > maxTimeMs && bestMove !== null) {
      break;
    }

    const nextState = makeMove(state, move);
    const score = minimax(
      nextState,
      maxDepth - 1,
      -Infinity,
      Infinity,
      !isMaximizing,
      startTime,
      maxTimeMs,
    );

    if (isMaximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
  }

  return bestMove || sortedMoves[0];
}

function minimax(
  state: ChessState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  startTime: number,
  maxTimeMs: number,
): number {
  if (depth === 0 || state.isCheckmate || state.isDraw || performance.now() - startTime > maxTimeMs) {
    return evaluateBoard(state);
  }

  const moves = getLegalMoves(state, state.turn);
  if (moves.length === 0) {
    return evaluateBoard(state);
  }

  // Fast move ordering to maximize alpha-beta pruning
  moves.sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const nextState = makeMove(state, move);
      const ev = minimax(nextState, depth - 1, alpha, beta, false, startTime, maxTimeMs);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break; // Beta cutoff
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const nextState = makeMove(state, move);
      const ev = minimax(nextState, depth - 1, alpha, beta, true, startTime, maxTimeMs);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break; // Alpha cutoff
    }
    return minEval;
  }
}
