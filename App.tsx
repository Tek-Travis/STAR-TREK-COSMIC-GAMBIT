// tslint:disable
/* eslint-disable */
import {
  AlertTriangle,
  Play,
  RotateCw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
  FastForward,
} from 'lucide-react';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ChessState,
  createInitialState,
  findBestMove,
  findKing,
  getLegalMovesForSquare,
  makeMove,
  Move,
  Piece,
  PieceColor,
  PieceType,
} from './chessEngine';
import {
  ActiveBattle,
  createBattle,
  updateBattle,
} from './engagementEngine';
import {getConfig} from './constants';
import BackgroundMusic from './utils/BackgroundMusic';
import {
  createFixedStepper,
  drawBackground,
  gameAudio,
  GameState,
  Overlay,
  prepareCanvas,
  useAssets,
  useInput,
  useIsMobile,
} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  usePlaygroundResume,
  useRpc,
} from './utils/usePlayground';

const BACKGROUND_MUSIC_URL = 'assets/audio/bgm_cosmic_ambience.mp3';

interface CustomWindow extends Window {
  canHandleBackKey?: boolean;
}

interface GlideAnimation {
  piece: Piece;
  fromCoords: {x: number; y: number};
  toCoords: {x: number; y: number};
  current: {x: number; y: number};
  elapsed: number;
  duration: number;
  onComplete: () => void;
}

// Asset registry for cosmic chessboard
export const PIECE_ASSETS_MANIFEST: Record<string, string> = {
  space_background: 'assets/images/space_background.png',
  ship_pawn: 'assets/images/ship_pawn_scout.png',
  ship_knight: 'assets/images/ship_knight_destroyer.png',
  ship_bishop: 'assets/images/ship_bishop_frigate.png',
  ship_rook: 'assets/images/ship_rook_cruiser.png',
  ship_queen: 'assets/images/ship_queen_dreadnought.png',
  ship_king: 'assets/images/ship_king_flagship.png',
  marker_pawn: 'assets/images/marker_pawn.png',
  marker_knight: 'assets/images/marker_knight.png',
  marker_bishop: 'assets/images/marker_bishop.png',
  marker_rook: 'assets/images/marker_rook.png',
  marker_queen: 'assets/images/marker_queen.png',
  marker_king: 'assets/images/marker_king.png',
  weapon_orange_beam: 'assets/images/weapon_orange_beam.png',
  weapon_red_torpedo: 'assets/images/weapon_red_torpedo.png',
  weapon_blue_torpedo: 'assets/images/weapon_blue_torpedo.png',
};

export const PIECE_ASSET_MAP: Record<PieceType, string> = {
  p: 'ship_pawn',
  n: 'ship_knight',
  b: 'ship_bishop',
  r: 'ship_rook',
  q: 'ship_queen',
  k: 'ship_king',
};

export const MARKER_ASSET_MAP: Record<PieceType, string> = {
  p: 'marker_pawn',
  n: 'marker_knight',
  b: 'marker_bishop',
  r: 'marker_rook',
  q: 'marker_queen',
  k: 'marker_king',
};

export const PIECE_GLYPHS: Record<PieceType, string> = {
  p: '♙',
  n: '♘',
  b: '♗',
  r: '♖',
  q: '♕',
  k: '♔',
};

export const PIECE_TYPE_NAMES: Record<PieceType, string> = {
  p: 'PAWN',
  n: 'KNIGHT',
  b: 'BISHOP',
  r: 'ROOK',
  q: 'QUEEN',
  k: 'KING',
};

export const PIECE_TITLES: Record<PieceType, string> = {
  p: 'Scout Corvette (Pawn)',
  n: 'Interceptor Destroyer (Knight)',
  b: 'Cruiser Frigate (Bishop)',
  r: 'Heavy Battlecruiser (Rook)',
  q: 'Armada Flagship (Queen)',
  k: 'Command Citadel (King)',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stepperRef = useRef<ReturnType<typeof createFixedStepper>>();
  const lastCancelRef = useRef(false);
  const isMobile = useIsMobile();

  // Playground SDK Integration
  const {sdk, isReady} = usePlayground();
  const [exitChat] = useRpc<Record<string, unknown>, void>('ExitChat');

  const {assets, isReady: assetsReady} = useAssets(PIECE_ASSETS_MANIFEST);

  // Dynamic board sizing: expand the chessboard to the largest square fitting the screen
  const [viewportDims, setViewportDims] = useState<{width: number; height: number}>(() => {
    if (typeof window !== 'undefined') {
      return {width: window.innerWidth, height: window.innerHeight};
    }
    return {width: 1280, height: 800};
  });

  useEffect(() => {
    const handleResize = () => {
      setViewportDims({width: window.innerWidth, height: window.innerHeight});
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Compute largest square chessboard with comfortable margin for top/bottom UI bars
  // Target ~96px squares (approx 1 inch on ~96-110 DPI desktop screens), cleanly scaling without scrolling
  const topBarAllowance = 56;
  const bottomBarAllowance = 32;
  const paddingMargin = 16;

  const availWidth = Math.max(320, viewportDims.width - paddingMargin * 2);
  const availHeight = Math.max(320, viewportDims.height - topBarAllowance - bottomBarAllowance - paddingMargin * 2);

  // Square board size calculation: fit perfectly within available viewport bounds
  // Clamp boardSize to multiple of 8 for crisp sub-pixel grid rendering
  const maxPossibleSquare = Math.floor(Math.min(availWidth, availHeight));
  // Prefer ~768px (96px * 8) when space permits, or scale dynamically up to available space
  const boardSize = Math.max(288, Math.floor(maxPossibleSquare / 8) * 8);
  const cellSize = boardSize / 8;

  // Total canvas dimensions encompass the board + tactical coordinate gutters
  const gutter = Math.max(20, Math.round(cellSize * 0.28));
  const canvasWidth = boardSize + gutter * 2;
  const canvasHeight = boardSize + gutter * 2;
  const boardX = gutter;
  const boardY = gutter;

  if (!stepperRef.current) {
    const stepMs = (getConfig('stepMs') as number) || 1000 / 60;
    const maxSubSteps = (getConfig('maxSubSteps') as number) || 5;
    stepperRef.current = createFixedStepper(stepMs, maxSubSteps);
  }

  // Playground save/resume
  const {initialLevel, initialScore, persistenceEnabled, autoStartPending} =
    usePlaygroundResume({
      isReady,
      assetsReady,
      onAutoStart: () => {
        if (gameStateRef.current.status === 'START') {
          initGame();
        }
      },
    });

  const startLevel = initialLevel;
  const startScore = initialScore;
  const levelStartScoreRef = useRef(startScore);
  const prevLevelRef = useRef(startLevel);
  const runWonRef = useRef(false);

  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: startScore,
    level: startLevel,
  });

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  useEffect(() => {
    if (gameState.level !== prevLevelRef.current) {
      prevLevelRef.current = gameState.level;
      levelStartScoreRef.current = gameStateRef.current.score;
    }
  }, [gameState.level]);

  useEffect(() => {
    if (gameState.status === 'VICTORY') {
      runWonRef.current = true;
    }
  }, [gameState.status]);

  useEffect(() => {
    const canHandleBackKey = gameState.status !== 'START';
    (window as CustomWindow).canHandleBackKey = canHandleBackKey;
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'PLAYGROUND_CAN_HANDLE_BACK_KEY',
          value: canHandleBackKey,
        },
        '*',
      );
    }
  }, [gameState.status]);

  const inputRef = useInput(canvasRef, true, {
    width: canvasWidth,
    height: canvasHeight,
  });

  // Master volume control (0.0 to 1.0)
  const [volume, setVolumeState] = useState<number>(0.65);
  const prevVolumeRef = useRef<number>(0.65);

  const setMasterVolume = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolumeState(clamped);
    gameAudio.setVolume(clamped);
    gameAudio.setMuted(clamped === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      prevVolumeRef.current = volume;
      setMasterVolume(0);
    } else {
      setMasterVolume(prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.65);
    }
  }, [volume, setMasterVolume]);

  // AI Difficulty Level (1 = Cadet, 2 = Commander, 3 = Admiral)
  const [aiDifficulty, setAiDifficulty] = useState<number>(2);

  // Authoritative Chess State
  const [chessState, setChessState] = useState<ChessState>(createInitialState);
  const chessStateRef = useRef(chessState);
  chessStateRef.current = chessState;

  // Selected piece square & valid moves
  const [selectedSquare, setSelectedSquare] = useState<{r: number; c: number} | null>(null);
  const selectedSquareRef = useRef<{r: number; c: number} | null>(null);
  selectedSquareRef.current = selectedSquare;

  const [legalDestinations, setLegalDestinations] = useState<Move[]>([]);
  const legalDestinationsRef = useRef<Move[]>([]);
  legalDestinationsRef.current = legalDestinations;

  const [lastMoveMade, setLastMoveMade] = useState<Move | null>(null);
  const [hoverSquare, setHoverSquare] = useState<{r: number; c: number} | null>(null);

  // Pending Pawn Promotion
  const [pendingPromotionMove, setPendingPromotionMove] = useState<Move | null>(null);

  // Non-capturing flight glide animation
  const activeGlideRef = useRef<GlideAnimation | null>(null);

  // 5-10 second battle skirmish animation for capturing moves
  const activeBattleRef = useRef<ActiveBattle | null>(null);
  const [isBattleActive, setIsBattleActive] = useState<boolean>(false);

  const isAiThinkingRef = useRef<boolean>(false);
  const [aiThinkingState, setAiThinkingState] = useState<boolean>(false);

  const squareToCanvas = useCallback(
    (r: number, c: number) => ({
      x: boardX + c * cellSize + cellSize / 2,
      y: boardY + r * cellSize + cellSize / 2,
    }),
    [boardX, boardY, cellSize],
  );

  const canvasToSquare = useCallback(
    (x: number, y: number): {r: number; c: number} | null => {
      if (
        x < boardX ||
        x >= boardX + boardSize ||
        y < boardY ||
        y >= boardY + boardSize
      ) {
        return null;
      }
      const c = Math.floor((x - boardX) / cellSize);
      const r = Math.floor((y - boardY) / cellSize);
      if (r < 0 || r > 7 || c < 0 || c > 7) return null;
      return {r, c};
    },
    [boardX, boardY, boardSize, cellSize],
  );

  // Start run
  const startRun = useCallback(
    (level: number, score: number) => {
      gameAudio.resume();
      levelStartScoreRef.current = score;
      prevLevelRef.current = level;
      runWonRef.current = false;
      const initial = createInitialState();
      setChessState(initial);
      chessStateRef.current = initial;
      setSelectedSquare(null);
      selectedSquareRef.current = null;
      setLegalDestinations([]);
      legalDestinationsRef.current = [];
      setLastMoveMade(null);
      setPendingPromotionMove(null);
      activeGlideRef.current = null;
      activeBattleRef.current = null;
      setIsBattleActive(false);
      setAiThinkingState(false);
      isAiThinkingRef.current = false;

      setGameState({
        status: 'PLAYING',
        level,
        score,
        moves: 0,
      });

      if (sdk) {
        sdk.startGame();
      }
    },
    [sdk],
  );

  const initGame = useCallback(() => {
    gameAudio.resume();
    if (persistenceEnabled && !runWonRef.current) {
      startRun(gameStateRef.current.level, levelStartScoreRef.current);
    } else {
      startRun(1, 0);
    }
  }, [startRun, persistenceEnabled]);

  const resetGame = useCallback(() => {
    gameAudio.resume();
    startRun(1, 0);
  }, [startRun]);

  usePlaygroundGameLifecycle(gameState, sdk);

  // Auto-start for preview screenshot
  const hasAutoplayed = useRef(false);
  useEffect(() => {
    if (
      !hasAutoplayed.current &&
      new URLSearchParams(window.location.search).has('autoplay')
    ) {
      hasAutoplayed.current = true;
      initGame();
    }
  }, [initGame]);

  // Skip active battle / glide immediately
  const handleSkipAnimation = useCallback(() => {
    if (activeBattleRef.current) {
      const finish = activeBattleRef.current.onComplete;
      activeBattleRef.current = null;
      setIsBattleActive(false);
      finish();
    } else if (activeGlideRef.current) {
      const finish = activeGlideRef.current.onComplete;
      activeGlideRef.current = null;
      finish();
    }
  }, []);

  // Keyboard shortcut: Spacebar skips battle cinematic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (activeBattleRef.current || activeGlideRef.current)) {
        e.preventDefault();
        handleSkipAnimation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSkipAnimation]);

  // Execute a verified legal move
  const executeMove = useCallback(
    (move: Move) => {
      const currentState = chessStateRef.current;
      const fromCoords = squareToCanvas(move.from.r, move.from.c);
      const toCoords = squareToCanvas(move.to.r, move.to.c);

      setSelectedSquare(null);
      selectedSquareRef.current = null;
      setLegalDestinations([]);
      legalDestinationsRef.current = [];
      setLastMoveMade(move);

      const onMoveFinished = () => {
        const nextState = makeMove(currentState, move);
        setChessState(nextState);
        chessStateRef.current = nextState;

        let scoreDelta = 0;
        if (move.captured) {
          const values: Record<PieceType, number> = {p: 10, n: 30, b: 30, r: 50, q: 90, k: 500};
          scoreDelta = values[move.captured.type] * 10;
        }

        setGameState((prev) => ({
          ...prev,
          score: prev.score + (move.piece.color === 'w' ? scoreDelta : 0),
          moves: (prev.moves || 0) + 1,
          status: nextState.isCheckmate
            ? move.piece.color === 'w'
              ? 'VICTORY'
              : 'GAME_OVER'
            : nextState.isDraw
            ? 'GAME_OVER'
            : 'PLAYING',
        }));

        activeGlideRef.current = null;
        activeBattleRef.current = null;
        setIsBattleActive(false);

        if (nextState.isCheckmate) {
          if (move.piece.color === 'w') {
            gameAudio.playVictoryFanfare();
          } else {
            gameAudio.playDefeatMotif();
          }
        } else if (nextState.isCheck) {
          gameAudio.playErrorBuzz();
        } else if (move.captured) {
          gameAudio.playGunshotBlast();
        } else {
          gameAudio.playCrispClick();
        }
      };

      // Check if move is a capture: triggers 5-10s battle engagement
      if (move.captured) {
        const battle = createBattle(
          move.piece,
          move.captured,
          move.from,
          move.to,
          fromCoords,
          toCoords,
          onMoveFinished,
        );
        activeBattleRef.current = battle;
        setIsBattleActive(true);
      } else {
        // Non-capturing move: flight glide interpolation (~0.4s smooth glide)
        activeGlideRef.current = {
          piece: move.piece,
          fromCoords,
          toCoords,
          current: {x: fromCoords.x, y: fromCoords.y},
          elapsed: 0,
          duration: 0.38,
          onComplete: onMoveFinished,
        };
      }
    },
    [squareToCanvas],
  );

  // Undo move
  const handleUndoMove = useCallback(() => {
    const history = chessStateRef.current.history;
    if (
      history.length < 2 ||
      activeGlideRef.current ||
      activeBattleRef.current ||
      isAiThinkingRef.current
    ) {
      gameAudio.playErrorBuzz();
      return;
    }
    gameAudio.playCrispClick();
    let state = createInitialState();
    const targetLength = history.length - 2;
    for (let i = 0; i < targetLength; i++) {
      state = makeMove(state, history[i]);
    }
    setChessState(state);
    chessStateRef.current = state;
    setLastMoveMade(targetLength > 0 ? state.history[targetLength - 1] : null);
    setSelectedSquare(null);
    selectedSquareRef.current = null;
    setLegalDestinations([]);
    legalDestinationsRef.current = [];
  }, []);

  // AI Turn Execution
  useEffect(() => {
    if (
      gameState.status !== 'PLAYING' ||
      chessState.turn !== 'b' ||
      chessState.isCheckmate ||
      chessState.isDraw ||
      activeGlideRef.current !== null ||
      activeBattleRef.current !== null ||
      isAiThinkingRef.current
    ) {
      return;
    }

    isAiThinkingRef.current = true;
    setAiThinkingState(true);

    const timer = setTimeout(() => {
      if (gameStateRef.current.status !== 'PLAYING') {
        isAiThinkingRef.current = false;
        setAiThinkingState(false);
        return;
      }

      const bestMove = findBestMove(chessStateRef.current, aiDifficulty);
      isAiThinkingRef.current = false;
      setAiThinkingState(false);

      if (bestMove) {
        // If AI pawns reach back rank, auto-promote to Queen
        if (
          bestMove.piece.type === 'p' &&
          bestMove.to.r === 7 &&
          !bestMove.promotion
        ) {
          bestMove.promotion = 'q';
        }
        executeMove(bestMove);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [chessState, gameState.status, aiDifficulty, executeMove]);

  // Direct board square click/touch interaction handler
  const handleSquareInteraction = useCallback(
    (sq: {r: number; c: number}) => {
      if (
        gameStateRef.current.status !== 'PLAYING' ||
        activeGlideRef.current !== null ||
        activeBattleRef.current !== null ||
        chessStateRef.current.turn === 'b'
      ) {
        return;
      }

      const current = chessStateRef.current;
      const clickedPiece = current.board[sq.r][sq.c];
      const curSelected = selectedSquareRef.current;
      const curLegal = legalDestinationsRef.current;

      // 1. If a square was previously selected, check if clicking a legal move destination
      if (curSelected) {
        const matchingMove = curLegal.find(
          (m) => m.to.r === sq.r && m.to.c === sq.c,
        );

        if (matchingMove) {
          // Pawn promotion selection prompt for back rank
          if (
            matchingMove.piece.type === 'p' &&
            (matchingMove.to.r === 0 || matchingMove.to.r === 7)
          ) {
            setPendingPromotionMove(matchingMove);
            gameAudio.playConfirmSelect();
            return;
          }

          executeMove(matchingMove);
          return;
        }
      }

      // 2. If clicking on own White piece, select it and show legal destinations
      if (clickedPiece && clickedPiece.color === current.turn) {
        setSelectedSquare(sq);
        selectedSquareRef.current = sq;
        const legal = getLegalMovesForSquare(current, sq.r, sq.c);
        setLegalDestinations(legal);
        legalDestinationsRef.current = legal;
        gameAudio.playCrispClick();
      } else {
        // 3. Clicked empty square or opponent piece: clear selection
        setSelectedSquare(null);
        selectedSquareRef.current = null;
        setLegalDestinations([]);
        legalDestinationsRef.current = [];
      }
    },
    [executeMove],
  );

  // Canvas direct pointer down handler (guarantees 100% immediate click reception)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    gameAudio.resume();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const sq = canvasToSquare(x, y);
    if (sq) {
      handleSquareInteraction(sq);
    } else {
      setSelectedSquare(null);
      selectedSquareRef.current = null;
      setLegalDestinations([]);
      legalDestinationsRef.current = [];
    }
  };

  // Canvas pointer move handler for hover highlight
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const sq = canvasToSquare(x, y);
    setHoverSquare(sq);
  };

  const handleCanvasPointerLeave = () => {
    setHoverSquare(null);
  };

  // Stepper Update (handles piece gliding & battle animations)
  const update = (deltaTime: number) => {
    // 1. Battle Skirmish Update
    if (activeBattleRef.current) {
      updateBattle(activeBattleRef.current, deltaTime);
    }

    // 2. Flight Glide Update
    if (activeGlideRef.current) {
      const glide = activeGlideRef.current;
      glide.elapsed += deltaTime;
      const t = Math.min(1, glide.elapsed / glide.duration);
      // Smooth sinusoidal flight easing
      const ease = Math.sin((t * Math.PI) / 2);
      glide.current.x =
        glide.fromCoords.x + (glide.toCoords.x - glide.fromCoords.x) * ease;
      glide.current.y =
        glide.fromCoords.y + (glide.toCoords.y - glide.fromCoords.y) * ease;

      if (t >= 1) {
        const finish = glide.onComplete;
        activeGlideRef.current = null;
        finish();
      }
    }
  };

  // Canvas Draw
  const draw = (ctx: CanvasRenderingContext2D) => {
    prepareCanvas(ctx, canvasWidth, canvasHeight);

    // Camera shake offset from battle impacts
    const battle = activeBattleRef.current;
    let shakeX = 0;
    let shakeY = 0;
    if (battle && battle.shakeAmount > 0) {
      shakeX = (Math.random() - 0.5) * battle.shakeAmount;
      shakeY = (Math.random() - 0.5) * battle.shakeAmount;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 1. Cosmic space backdrop
    drawBackground(
      ctx,
      assets['space_background'],
      canvasWidth,
      canvasHeight,
      '#030712',
    );

    // 2. Outer tactical boundary frame
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(boardX - 3, boardY - 3, boardSize + 6, boardSize + 6);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boardX - 8, boardY - 8, boardSize + 16, boardSize + 16);

    // 3. Squares: Transparent sci-fi grid with clear alternating tint and outlines
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = boardX + c * cellSize;
        const y = boardY + r * cellSize;
        const isDark = (r + c) % 2 === 1;

        // Alternating square tint
        ctx.fillStyle = isDark
          ? 'rgba(15, 23, 42, 0.58)'
          : 'rgba(30, 58, 95, 0.35)';
        ctx.fillRect(x, y, cellSize, cellSize);

        // Crisp square grid outline
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Corner tick accents
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 6, y);
        ctx.stroke();
      }
    }

    // Coordinates: A-H, 1-8
    const coordFontPx = Math.max(10, Math.round(cellSize * 0.15));
    ctx.font = `bold ${coordFontPx}px Orbitron, Rajdhani, monospace`;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let c = 0; c < 8; c++) {
      const x = boardX + c * cellSize + cellSize / 2;
      ctx.fillText(files[c], x, boardY + boardSize + gutter / 2);
      ctx.fillText(files[c], x, boardY - gutter / 2);
    }
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    for (let r = 0; r < 8; r++) {
      const y = boardY + r * cellSize + cellSize / 2;
      ctx.fillText(ranks[r], boardX - gutter / 2, y);
      ctx.fillText(ranks[r], boardX + boardSize + gutter / 2, y);
    }

    const activeState = chessStateRef.current;

    // 4. Last Move Highlight
    if (lastMoveMade) {
      const {from, to} = lastMoveMade;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.fillRect(
        boardX + from.c * cellSize,
        boardY + from.r * cellSize,
        cellSize,
        cellSize,
      );
      ctx.fillRect(
        boardX + to.c * cellSize,
        boardY + to.r * cellSize,
        cellSize,
        cellSize,
      );
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boardX + to.c * cellSize, boardY + to.r * cellSize, cellSize, cellSize);
    }

    // 5. Hover Reticle (on desktop mouse hover)
    if (
      hoverSquare &&
      activeGlideRef.current === null &&
      activeBattleRef.current === null &&
      activeState.turn === 'w'
    ) {
      const hx = boardX + hoverSquare.c * cellSize;
      const hy = boardY + hoverSquare.r * cellSize;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(hx, hy, cellSize, cellSize);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx + 1, hy + 1, cellSize - 2, cellSize - 2);
    }

    // 6. Check Alert on King's Square
    if (activeState.isCheck) {
      const kingPos = findKing(activeState.board, activeState.turn);
      if (kingPos) {
        const kx = boardX + kingPos.c * cellSize;
        const ky = boardY + kingPos.r * cellSize;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + pulse * 0.25})`;
        ctx.fillRect(kx, ky, cellSize, cellSize);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(kx + 2, ky + 2, cellSize - 4, cellSize - 4);
      }
    }

    // 7. Selected Piece Highlight (Bright golden pulsator with corner brackets)
    if (selectedSquare) {
      const sx = boardX + selectedSquare.c * cellSize;
      const sy = boardY + selectedSquare.r * cellSize;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);

      ctx.fillStyle = `rgba(250, 204, 21, ${0.22 + pulse * 0.15})`;
      ctx.fillRect(sx, sy, cellSize, cellSize);

      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx + 2, sy + 2, cellSize - 4, cellSize - 4);

      // Golden corner brackets
      const bLen = Math.max(8, cellSize * 0.14);
      ctx.beginPath();
      // Top-left
      ctx.moveTo(sx + 2, sy + 2 + bLen);
      ctx.lineTo(sx + 2, sy + 2);
      ctx.lineTo(sx + 2 + bLen, sy + 2);
      // Top-right
      ctx.moveTo(sx + cellSize - 2 - bLen, sy + 2);
      ctx.lineTo(sx + cellSize - 2, sy + 2);
      ctx.lineTo(sx + cellSize - 2, sy + 2 + bLen);
      // Bottom-left
      ctx.moveTo(sx + 2, sy + cellSize - 2 - bLen);
      ctx.lineTo(sx + 2, sy + cellSize - 2);
      ctx.lineTo(sx + 2 + bLen, sy + cellSize - 2);
      // Bottom-right
      ctx.moveTo(sx + cellSize - 2 - bLen, sy + cellSize - 2);
      ctx.lineTo(sx + cellSize - 2, sy + cellSize - 2);
      ctx.lineTo(sx + cellSize - 2, sy + cellSize - 2 - bLen);
      ctx.stroke();
    }

    // 8. Legal Move Indicators
    const nowTime = Date.now() / 200;
    for (const move of legalDestinations) {
      const mx = boardX + move.to.c * cellSize + cellSize / 2;
      const my = boardY + move.to.r * cellSize + cellSize / 2;

      if (move.captured) {
        // Red target bracket for capture moves
        const pulseR = cellSize * 0.38 + Math.sin(nowTime) * 2;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.beginPath();
        ctx.arc(mx, my, cellSize * 0.15, 0, Math.PI * 2);
        ctx.fill();

        // Crosshairs
        const cross = cellSize * 0.45;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx - cross, my);
        ctx.lineTo(mx - cross * 0.7, my);
        ctx.moveTo(mx + cross * 0.7, my);
        ctx.lineTo(mx + cross, my);
        ctx.moveTo(mx, my - cross);
        ctx.lineTo(mx, my - cross * 0.7);
        ctx.moveTo(mx, my + cross * 0.7);
        ctx.lineTo(mx, my + cross);
        ctx.stroke();
      } else {
        // Glowing cyan destination dot with subtle animated ripple ring
        const ripple = (Date.now() % 1200) / 1200;
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.8 * (1 - ripple)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, cellSize * 0.14 + ripple * cellSize * 0.22, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(mx, my, cellSize * 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 9. Render Board Pieces
    const activeGlide = activeGlideRef.current;
    const activeBattle = activeBattleRef.current;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        // Skip attacker piece during glide/battle (it is drawn dynamically)
        if (
          activeGlide &&
          lastMoveMade &&
          lastMoveMade.from.r === r &&
          lastMoveMade.from.c === c
        ) {
          continue;
        }

        if (
          activeBattle &&
          activeBattle.fromSquare.r === r &&
          activeBattle.fromSquare.c === c
        ) {
          continue;
        }

        // Keep pieces visible until legally captured!
        // In battle, defender stays on board until its catastrophic explosion happens
        if (
          activeBattle &&
          activeBattle.toSquare.r === r &&
          activeBattle.toSquare.c === c
        ) {
          // If defender is actively engaged in battle, draw it via dynamic battle renderer
          continue;
        }

        const piece = activeState.board[r][c];
        if (piece) {
          const cx = boardX + c * cellSize + cellSize / 2;
          const cy = boardY + r * cellSize + cellSize / 2;
          drawBoardPiece(ctx, piece, cx, cy, cellSize, assets, 1);
        }
      }
    }

    // 10. Render Active Flight Gliding Piece
    if (activeGlide) {
      drawBoardPiece(
        ctx,
        activeGlide.piece,
        activeGlide.current.x,
        activeGlide.current.y,
        cellSize,
        assets,
        1,
      );
    }

    // 11. Render Active Battle Cinematic (5-10s battle with approach, fire, explosion)
    if (activeBattle) {
      drawBattleCinematic(ctx, activeBattle, cellSize, assets);
    }

    ctx.restore();
  };

  // Draw an individual chess piece with:
  // - transparent PNG starship sprite
  // - piece-type emblem positioned below ships, toward screen's bottom regardless of board orientation
  const drawBoardPiece = (
    ctx: CanvasRenderingContext2D,
    piece: Piece,
    cx: number,
    cy: number,
    cellSize: number,
    loadedAssets: Record<string, HTMLImageElement | null>,
    opacity = 1,
    customAngle?: number,
  ) => {
    ctx.save();
    ctx.translate(cx, cy);
    if (opacity < 1) {
      ctx.globalAlpha = Math.max(0, opacity);
    }

    const isWhite = piece.color === 'w';
    const primaryColor = isWhite ? '#38bdf8' : '#ef4444';
    const secondaryColor = isWhite ? '#fbbf24' : '#f43f5e';
    const glowColor = isWhite ? 'rgba(56, 189, 248, 0.7)' : 'rgba(239, 68, 68, 0.7)';
    const ringRadius = cellSize * 0.42;

    // Faction telemetry ring
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -cellSize * 0.04, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary inner edge
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -cellSize * 0.04, ringRadius - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Dark high-contrast circular backing disc to ensure clear visibility against space stars
    ctx.fillStyle = isWhite ? 'rgba(10, 20, 38, 0.85)' : 'rgba(35, 10, 15, 0.85)';
    ctx.beginPath();
    ctx.arc(0, -cellSize * 0.04, ringRadius - 3, 0, Math.PI * 2);
    ctx.fill();

    const assetKey = PIECE_ASSET_MAP[piece.type];
    const img = loadedAssets[assetKey];

    // Transparent PNG image rendering
    ctx.save();
    // Ships face each other: White points upward (-90 deg), Black points downward (+90 deg)
    const angle = customAngle !== undefined ? customAngle : isWhite ? -Math.PI / 2 : Math.PI / 2;
    ctx.translate(0, -cellSize * 0.04);
    ctx.rotate(angle);

    if (img && img.complete && img.naturalWidth > 0) {
      const aspect = img.naturalWidth / img.naturalHeight;
      const maxDim = cellSize * 0.65;
      let dw = maxDim;
      let dh = maxDim / aspect;
      if (dh > maxDim) {
        dh = maxDim;
        dw = maxDim * aspect;
      }
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      // Crisp procedural starship silhouette fallback
      drawProceduralFallback(ctx, piece.type, isWhite, primaryColor, secondaryColor, cellSize * 0.32);
    }
    ctx.restore();

    // USER REQUIREMENT:
    // "Position piece-type emblems below ships, toward the screen’s bottom regardless of board orientation,
    // as overlays separate from transparent PNGs."
    // We position the emblem badge at the bottom of the square (oriented toward screen's bottom, unrotated).
    const emblemY = cellSize * 0.36;
    const emblemWidth = cellSize * 0.72;
    const emblemHeight = cellSize * 0.22;
    const emblemCornerR = 4;

    ctx.save();
    // Shadow & backing pill
    ctx.shadowBlur = 6;
    ctx.shadowColor = glowColor;

    ctx.fillStyle = isWhite ? 'rgba(8, 47, 73, 0.95)' : 'rgba(69, 10, 10, 0.95)';
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.2;

    // Rounded rectangle path for the emblem badge
    const ex = -emblemWidth / 2;
    const ey = emblemY - emblemHeight / 2;
    ctx.beginPath();
    ctx.roundRect(ex, ey, emblemWidth, emblemHeight, emblemCornerR);
    ctx.fill();
    ctx.stroke();

    // Emblem Icon / Marker PNG or Chess Glyph
    const markerImg = loadedAssets[MARKER_ASSET_MAP[piece.type]];
    const iconDim = emblemHeight * 0.85;
    const iconX = ex + 3;
    const iconY = ey + (emblemHeight - iconDim) / 2;

    if (markerImg && markerImg.complete && markerImg.naturalWidth > 0) {
      ctx.drawImage(markerImg, iconX, iconY, iconDim, iconDim);
    } else {
      // Piece insignia chess glyph (♙ ♘ ♗ ♖ ♕ ♔)
      ctx.font = `bold ${Math.round(emblemHeight * 0.8)}px sans-serif`;
      ctx.fillStyle = isWhite ? '#38bdf8' : '#ef4444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PIECE_GLYPHS[piece.type], ex + iconDim * 0.65, emblemY);
    }

    // Piece Rank Text (PAWN, ROOK, KNIGHT, BISHOP, QUEEN, KING)
    const textX = ex + iconDim + 4;
    const fontPx = Math.max(8, Math.round(emblemHeight * 0.52));
    ctx.font = `900 ${fontPx}px Orbitron, Rajdhani, monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(PIECE_TYPE_NAMES[piece.type], textX, emblemY);

    ctx.restore();
    ctx.restore();
  };

  // Draw 5-10s battle cinematic effects
  const drawBattleCinematic = (
    ctx: CanvasRenderingContext2D,
    battle: ActiveBattle,
    cellSize: number,
    loadedAssets: Record<string, HTMLImageElement | null>,
  ) => {
    // 1. Defender (visible until vaporized)
    if (battle.defenderCurrent.opacity > 0) {
      drawBoardPiece(
        ctx,
        battle.defenderPiece,
        battle.defenderCurrent.x,
        battle.defenderCurrent.y,
        cellSize,
        loadedAssets,
        battle.defenderCurrent.opacity,
        battle.defenderCurrent.angle,
      );
    }

    // 2. Attacker
    drawBoardPiece(
      ctx,
      battle.attackerPiece,
      battle.attackerCurrent.x,
      battle.attackerCurrent.y,
      cellSize,
      loadedAssets,
      1,
      battle.attackerCurrent.angle,
    );

    // 3. Shockwaves
    for (const sw of battle.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = Math.max(0, sw.opacity);
      ctx.lineWidth = 3;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Projectiles (beams, red torpedoes, blue torpedoes)
    for (const proj of battle.projectiles) {
      const px = proj.startX + (proj.targetX - proj.startX) * proj.progress;
      const py = proj.startY + (proj.targetY - proj.startY) * proj.progress;
      const pAngle = Math.atan2(proj.targetY - proj.startY, proj.targetX - proj.startX);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(pAngle);

      if (proj.type === 'beam') {
        const beamImg = loadedAssets['weapon_orange_beam'];
        if (beamImg && beamImg.complete && beamImg.naturalWidth > 0) {
          ctx.drawImage(beamImg, -24, -6, 48, 12);
        } else {
          ctx.fillStyle = '#f97316';
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 8;
          ctx.fillRect(-20, -3, 40, 6);
        }
      } else if (proj.type === 'red_torpedo') {
        const torpImg = loadedAssets['weapon_red_torpedo'];
        if (torpImg && torpImg.complete && torpImg.naturalWidth > 0) {
          ctx.drawImage(torpImg, -14, -14, 28, 28);
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const torpImg = loadedAssets['weapon_blue_torpedo'];
        if (torpImg && torpImg.complete && torpImg.naturalWidth > 0) {
          ctx.drawImage(torpImg, -14, -14, 28, 28);
        } else {
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 5. Particles / Debris
    for (const p of battle.particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  // Crisp procedural starship silhouettes for fallback
  const drawProceduralFallback = (
    ctx: CanvasRenderingContext2D,
    type: PieceType,
    isWhite: boolean,
    color: string,
    accentColor: string,
    r: number,
  ) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;

    const dir = isWhite ? -1 : 1;

    switch (type) {
      case 'k': {
        // Command Citadel Flagship
        ctx.beginPath();
        ctx.moveTo(0, dir * r * 0.95);
        ctx.lineTo(-r * 0.7, 0);
        ctx.lineTo(-r * 0.4, -dir * r * 0.7);
        ctx.lineTo(0, -dir * r * 0.35);
        ctx.lineTo(r * 0.4, -dir * r * 0.7);
        ctx.lineTo(r * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'q': {
        // Armada Flagship (Queen)
        ctx.beginPath();
        ctx.moveTo(0, dir * r * 0.95);
        ctx.lineTo(-r * 0.85, 0);
        ctx.lineTo(-r * 0.45, -dir * r * 0.6);
        ctx.lineTo(0, -dir * r * 0.2);
        ctx.lineTo(r * 0.45, -dir * r * 0.6);
        ctx.lineTo(r * 0.85, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'r': {
        // Heavy Battlecruiser (Rook)
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -dir * r * 0.6);
        ctx.lineTo(r * 0.6, -dir * r * 0.6);
        ctx.lineTo(r * 0.6, dir * r * 0.55);
        ctx.lineTo(-r * 0.6, dir * r * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'b': {
        // Cruiser Frigate (Bishop)
        ctx.beginPath();
        ctx.moveTo(0, dir * r * 0.95);
        ctx.lineTo(-r * 0.5, -dir * r * 0.45);
        ctx.lineTo(0, -dir * r * 0.15);
        ctx.lineTo(r * 0.5, -dir * r * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'n': {
        // Interceptor Destroyer (Knight)
        ctx.beginPath();
        ctx.moveTo(0, dir * r * 0.9);
        ctx.lineTo(-r * 0.65, -dir * r * 0.3);
        ctx.lineTo(-r * 0.2, -dir * r * 0.7);
        ctx.lineTo(r * 0.4, -dir * r * 0.5);
        ctx.lineTo(r * 0.6, dir * r * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'p':
      default: {
        // Scout Corvette (Pawn)
        ctx.beginPath();
        ctx.moveTo(0, dir * r * 0.8);
        ctx.lineTo(-r * 0.5, -dir * r * 0.5);
        ctx.lineTo(0, -dir * r * 0.2);
        ctx.lineTo(r * 0.5, -dir * r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  };

  // Game Loop
  const updateRef = useRef(update);
  const drawRef = useRef(draw);
  updateRef.current = update;
  drawRef.current = draw;

  useEffect(() => {
    let raf = 0;
    const loop = (time: number) => {
      // Escape / Back key handler
      if (inputRef.current) {
        const cancelPressed = inputRef.current.actions.cancel;
        if (cancelPressed && !lastCancelRef.current) {
          const currentStatus = gameStateRef.current.status;
          if (currentStatus === 'START') {
            exitChat({}).catch(() => {});
          } else if (
            ['GAME_OVER', 'VICTORY', 'LEVEL_COMPLETE'].includes(currentStatus)
          ) {
            setGameState((prev) => ({...prev, status: 'START'}));
          }
        }
        lastCancelRef.current = cancelPressed;
      }

      stepperRef.current?.(time, (dt) => {
        updateRef.current(dt);
      });

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawRef.current(ctx);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [exitChat]);

  const isMusicPlaying = !['START', 'GAME_OVER', 'VICTORY'].includes(
    gameState.status,
  );

  return (
    <div className="fixed inset-0 overflow-hidden touch-none flex flex-col items-center justify-between bg-slate-950 text-white font-sans select-none">
      {/* Background Ambience Audio */}
      <BackgroundMusic
        url={BACKGROUND_MUSIC_URL}
        isPlaying={isMusicPlaying}
        volume={volume * 0.4}
        isMuted={volume === 0}
      />

      {/* TOP TACTICAL HUD BAR */}
      <header className="w-full bg-slate-900/95 border-b border-cyan-900/40 backdrop-blur px-3 md:px-6 py-2 z-20 shrink-0 flex flex-wrap items-center justify-between gap-2 shadow-lg">
        {/* Left: Title & Turn Status */}
        <div className="flex items-center gap-2.5">
          <div className="text-xs md:text-sm font-mono font-black text-cyan-400 tracking-wider flex items-center gap-1.5">
            <Shield size={16} className="text-cyan-400" />
            <span className="hidden sm:inline">COSMIC ARMADA GAMBIT</span>
            <span className="sm:hidden">ARMADA</span>
          </div>

          {/* Turn indicator banner */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-bold border transition-colors ${
              chessState.turn === 'w'
                ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300'
                : 'bg-red-950/80 border-red-500/60 text-red-300'
            }`}>
            <span
              className={`w-2 h-2 rounded-full ${
                chessState.turn === 'w'
                  ? 'bg-cyan-400 animate-ping'
                  : 'bg-red-500 animate-pulse'
              }`}
            />
            <span>
              {aiThinkingState
                ? 'AI THINKING...'
                : isBattleActive
                ? 'ENGAGEMENT COMBAT'
                : chessState.turn === 'w'
                ? 'YOUR TURN'
                : 'AI OPPONENT'}
            </span>
          </div>

          {/* Check alert */}
          {chessState.isCheck && !chessState.isCheckmate && (
            <div className="bg-red-900/90 text-red-200 border border-red-500 px-2 py-0.5 rounded text-xs font-bold font-mono animate-pulse flex items-center gap-1">
              <AlertTriangle size={13} className="text-red-300" /> CHECK!
            </div>
          )}
        </div>

        {/* Center: Score & Captured Material */}
        <div className="hidden md:flex items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800 font-bold text-amber-400">
            <Trophy size={13} />
            <span>SCORE: {gameState.score}</span>
          </div>
          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <span>Captured:</span>
            <span className="text-cyan-300 font-semibold">{chessState.capturedByWhite.length}</span>
            <span>vs</span>
            <span className="text-red-300 font-semibold">{chessState.capturedByBlack.length}</span>
          </div>
        </div>

        {/* Right: Volume Slider, AI Difficulty & Action Controls */}
        <div className="flex items-center gap-2">
          {/* Skip Battle / Glide button (only shown when battle or glide active) */}
          {(isBattleActive || activeGlideRef.current) && (
            <button
              onClick={handleSkipAnimation}
              title="Skip Battle Cinematic (Spacebar)"
              className="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1 animate-pulse border border-amber-400 shadow min-h-[32px]">
              <FastForward size={13} />
              <span>Skip</span>
            </button>
          )}

          {/* Master Volume Slider (0 to 100%) */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 text-xs font-mono">
            <button
              onClick={toggleMute}
              title={volume === 0 ? 'Unmute Audio' : 'Mute Audio'}
              className="text-cyan-400 hover:text-cyan-300 transition-colors p-0.5">
              {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(volume * 100)}
              onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
              className="w-14 md:w-20 accent-cyan-400 h-1.5 cursor-pointer bg-slate-800 rounded-lg"
              title={`Master Volume: ${Math.round(volume * 100)}%`}
            />
            <span className="hidden sm:inline text-[10px] text-slate-400 w-7 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* AI Difficulty Selector */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-950/80 p-0.5 rounded border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400 px-1.5">AI:</span>
            {[
              {lvl: 1, label: 'Cadet'},
              {lvl: 2, label: 'Cmdr'},
              {lvl: 3, label: 'Adm'},
            ].map(({lvl, label}) => (
              <button
                key={lvl}
                onClick={() => setAiDifficulty(lvl)}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  aiDifficulty === lvl
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Undo Button */}
          <button
            onClick={handleUndoMove}
            disabled={chessState.history.length < 2 || aiThinkingState || isBattleActive}
            title="Undo Last Move"
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 px-2 py-1 rounded border border-slate-700 text-xs font-mono flex items-center gap-1 transition-colors min-h-[32px]">
            <RotateCw size={13} />
            <span className="hidden sm:inline">Undo</span>
          </button>

          {/* Restart / New Game */}
          <button
            onClick={initGame}
            title="Start New Chessboard Match"
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-2.5 py-1 rounded font-mono font-bold text-xs flex items-center gap-1 shadow transition-colors min-h-[32px]">
            <RotateCw size={13} />
            <span className="hidden sm:inline">New Game</span>
          </button>
        </div>
      </header>

      {/* FULLSCREEN-EXPANDED CHESSBOARD CONTAINER: Fits maximum square without clipping */}
      <main className="flex-1 w-full min-h-0 relative flex items-center justify-center p-1 md:p-2 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerLeave={handleCanvasPointerLeave}
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
          className="drop-shadow-2xl shadow-cyan-950/70 rounded-lg cursor-pointer touch-none"
        />

        {/* Initializing indicator */}
        {!assetsReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 text-white font-mono pointer-events-none">
            <div className="text-sm tracking-widest text-cyan-400 animate-pulse flex items-center gap-2">
              <Zap className="animate-spin text-cyan-400" size={18} /> INITIALIZING ARMADA ASSETS...
            </div>
          </div>
        )}
      </main>

      {/* MINIMAL FOOTER STATUS BAR */}
      <footer className="w-full bg-slate-900/80 border-t border-slate-800 px-4 py-1 shrink-0 flex items-center justify-between text-[11px] font-mono text-slate-400 z-20">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400">White: Human</span>
          <span>•</span>
          <span className="text-red-400">Black: AI</span>
          <span>•</span>
          <span>Moves: {gameState.moves || 0}</span>
          <span className="hidden sm:inline">• Square: ~{Math.round(cellSize)}px</span>
        </div>
        <div className="text-slate-400 flex items-center gap-2">
          {isBattleActive && (
            <span className="text-amber-400 font-bold animate-pulse">Space to Skip Battle</span>
          )}
          <span className="hidden sm:inline text-slate-500">
            Standard Chess Rules • Auto-scaling Square
          </span>
        </div>
      </footer>

      {/* PAWN PROMOTION POPUP */}
      {pendingPromotionMove && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-cyan-500 rounded-xl p-5 shadow-2xl flex flex-col items-center">
            <h2 className="text-lg font-mono font-bold text-cyan-400 mb-1 flex items-center gap-2">
              <Sparkles size={18} /> PROMOTE SCOUT CORVETTE
            </h2>
            <p className="text-xs text-slate-300 text-center mb-4">
              Select upgraded starship class:
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full">
              {[
                {type: 'q' as PieceType, label: 'Queen', desc: 'Armada Flagship', glyph: '♕'},
                {type: 'r' as PieceType, label: 'Rook', desc: 'Heavy Battlecruiser', glyph: '♖'},
                {type: 'b' as PieceType, label: 'Bishop', desc: 'Cruiser Frigate', glyph: '♗'},
                {type: 'n' as PieceType, label: 'Knight', desc: 'Interceptor Destroyer', glyph: '♘'},
              ].map((promo) => (
                <button
                  key={promo.type}
                  onClick={() => {
                    const finalizedMove: Move = {
                      ...pendingPromotionMove,
                      promotion: promo.type,
                    };
                    setPendingPromotionMove(null);
                    executeMove(finalizedMove);
                  }}
                  className="bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 hover:border-cyan-400 p-2.5 rounded-lg flex items-center gap-3 transition-colors min-h-[48px]">
                  <span className="text-2xl text-cyan-400">{promo.glyph}</span>
                  <div className="flex flex-col items-start">
                    <span className="font-mono font-bold text-xs text-cyan-300">{promo.label}</span>
                    <span className="text-[10px] text-slate-400">{promo.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* START SCREEN OVERLAY */}
      {gameState.status === 'START' && !autoStartPending && assetsReady && (
        <Overlay
          title="COSMIC ARMADA GAMBIT"
          description="Command your starship fleet against the tactical AI on a standard 8x8 cosmic chessboard."
          actionLabel="ENGAGE FLEET"
          onAction={initGame}
          icon={<Play size={20} fill="currentColor" />}
          tone="neutral"
        />
      )}

      {/* GAME OVER (Defeat / Draw) */}
      {gameState.status === 'GAME_OVER' && (
        <Overlay
          title={chessState.isDraw ? 'TACTICAL DRAW' : 'FLAGSHIP DESTROYED'}
          description={
            chessState.isDraw
              ? `Stalemate reached. Final Score: ${gameState.score}`
              : `Your Command Citadel has fallen to checkmate. Final Score: ${gameState.score}`
          }
          actionLabel="TRY AGAIN"
          onAction={initGame}
          icon={<RotateCw size={20} />}
          tone="danger"
        />
      )}

      {/* VICTORY (Checkmate against enemy King) */}
      {gameState.status === 'VICTORY' && (
        <Overlay
          title="VICTORY - ENEMY CHECKMATE"
          description={`The enemy Command Citadel has fallen. Sector secured! Final Score: ${gameState.score}`}
          actionLabel="PLAY AGAIN"
          onAction={resetGame}
          icon={<RotateCw size={20} />}
          tone="victory"
        />
      )}
    </div>
  );
}
