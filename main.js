// ==========================================================================
// Cosmic Armada Gambit - Standalone Vanilla Main Controller
// Responsive 8x8 DOM Grid, Floating Canvas FX, AI Opponent, Save/Load
// ==========================================================================

(function(global) {
  'use strict';

  // Starship Asset Manifest
  const SHIP_IMAGES = {
    p: './assets/images/ship_pawn_scout.png',
    n: './assets/images/ship_knight_destroyer.png',
    b: './assets/images/ship_bishop_frigate.png',
    r: './assets/images/ship_rook_cruiser.png',
    q: './assets/images/ship_queen_dreadnought.png',
    k: './assets/images/ship_king_flagship.png',
  };

  // SHIP SIZE CONTROLS
  // Percentage of the existing ship holder.
  // Change these values whenever you want to adjust the hierarchy.
  const SHIP_IMAGE_SIZES = {
    p: 25,   // Pawn — smallest
    b: 65,   // Bishop
    r: 45,   // Rook
    n: 65,   // Knight
    q: 120,   // Queen
    k: 120,  // King — largest
  };

  const MARKER_IMAGES = {
    p: './assets/images/marker_pawn.png',
    n: './assets/images/marker_knight.png',
    b: './assets/images/marker_bishop.png',
    r: './assets/images/marker_rook.png',
    q: './assets/images/marker_queen.png',
    k: './assets/images/marker_king.png',
  };

  const PIECE_GLYPHS = {
    p: '♙',
    n: '♘',
    b: '♗',
    r: '♖',
    q: '♕',
    k: '♔',
  };

  const PIECE_NAMES = {
    p: 'PAWN',
    n: 'KNIGHT',
    b: 'BISHOP',
    r: 'ROOK',
    q: 'QUEEN',
    k: 'KING',
  };

  const PIECE_TITLES = {
    p: 'Scout Corvette',
    n: 'Interceptor Destroyer',
    b: 'Cruiser Frigate',
    r: 'Heavy Battlecruiser',
    q: 'Armada Flagship',
    k: 'Command Citadel Flagship',
  };

  // High-fidelity procedural SVG fallbacks for starships
  function getProceduralShipSvg(type, color) {
    const isW = color === 'w';
    const primary = isW ? '#38bdf8' : '#ef4444';
    const accent = isW ? '#fbbf24' : '#f97316';
    const hull = isW ? '#0f2942' : '#3d0d16';

    switch (type) {
      case 'k': // Command Citadel Flagship
        return `<svg viewBox="0 0 100 100" class="ship-svg">
          <circle cx="50" cy="50" r="42" fill="none" stroke="${primary}" stroke-width="3" stroke-dasharray="8 4"/>
          <circle cx="50" cy="50" r="30" fill="${hull}" stroke="${accent}" stroke-width="2"/>
          <polygon points="50,15 65,40 58,75 50,68 42,75 35,40" fill="${primary}" opacity="0.9"/>
          <circle cx="50" cy="50" r="10" fill="#ffffff" filter="drop-shadow(0 0 6px ${primary})"/>
          <polygon points="50,22 58,42 42,42" fill="${accent}"/>
        </svg>`;
      case 'q': // Armada Flagship (Queen)
        return `<svg viewBox="0 0 100 100" class="ship-svg">
          <polygon points="50,12 85,55 68,82 50,70 32,82 15,55" fill="${hull}" stroke="${primary}" stroke-width="2.5"/>
          <polygon points="50,18 76,52 64,74 50,65 36,74 24,52" fill="${primary}" opacity="0.85"/>
          <circle cx="50" cy="46" r="12" fill="${accent}"/>
          <circle cx="50" cy="46" r="6" fill="#ffffff"/>
          <rect x="47" y="72" width="6" height="14" fill="#38bdf8"/>
        </svg>`;
      case 'r': // Heavy Battlecruiser (Rook)
        return `<svg viewBox="0 0 100 100" class="ship-svg">
          <rect x="26" y="24" width="48" height="54" rx="4" fill="${hull}" stroke="${primary}" stroke-width="2.5"/>
          <rect x="32" y="30" width="36" height="42" fill="${primary}" opacity="0.85"/>
          <polygon points="26,24 16,40 16,70 26,78" fill="${accent}"/>
          <polygon points="74,24 84,40 84,70 74,78" fill="${accent}"/>
          <rect x="42" y="42" width="16" height="18" fill="#ffffff"/>
        </svg>`;
      case 'b': // Cruiser Frigate (Bishop)
        return `<svg viewBox="0 0 100 100" class="ship-svg">
          <polygon points="50,10 75,55 60,86 50,75 40,86 25,55" fill="${hull}" stroke="${primary}" stroke-width="2.5"/>
          <polygon points="50,18 68,52 56,76 50,68 44,76 32,52" fill="${primary}" opacity="0.85"/>
          <ellipse cx="50" cy="44" rx="8" ry="14" fill="${accent}"/>
          <circle cx="50" cy="44" r="4" fill="#ffffff"/>
        </svg>`;
      case 'n': // Interceptor Destroyer (Knight)
        return `<svg viewBox="0 0 100 100" class="ship-svg">
          <polygon points="50,12 80,45 68,82 45,68 25,78 32,40" fill="${hull}" stroke="${primary}" stroke-width="2.5"/>
          <polygon points="50,20 72,45 60,72 45,62 34,70 38,42" fill="${primary}" opacity="0.85"/>
          <polygon points="45,26 62,42 40,52" fill="${accent}"/>
          <circle cx="50" cy="38" r="5" fill="#ffffff"/>
        </svg>`;
      case 'p': // Scout Corvette (Pawn)
      default:
        return `<svg viewBox="0 0 100 100" class="ship-svg">
          <polygon points="50,15 78,65 60,78 50,70 40,78 22,65" fill="${hull}" stroke="${primary}" stroke-width="2.5"/>
          <polygon points="50,24 70,62 58,70 50,65 42,70 30,62" fill="${primary}" opacity="0.85"/>
          <polygon points="50,30 62,54 38,54" fill="${accent}"/>
          <circle cx="50" cy="46" r="4" fill="#ffffff"/>
        </svg>`;
    }
  }

  class CosmicArmadaApp {
    constructor() {
      // DOM Elements
      this.boardContainer = document.getElementById('board-container');
      this.chessGrid = document.getElementById('chess-grid');
      this.fxCanvas = document.getElementById('fx-canvas');
      this.turnText = document.getElementById('turn-text');
      this.turnPill = document.getElementById('turn-pill');
      this.checkAlert = document.getElementById('check-alert');
      this.scoreText = document.getElementById('score-val');
      this.whiteCapText = document.getElementById('white-cap-count');
      this.blackCapText = document.getElementById('black-cap-count');
      this.movesText = document.getElementById('moves-count');
      this.squarePxText = document.getElementById('square-px');
      this.skipBtn = document.getElementById('skip-btn');
      this.undoBtn = document.getElementById('undo-btn');
      this.newGameBtn = document.getElementById('new-game-btn');
      this.saveBtn = document.getElementById('save-btn');
      this.loadBtn = document.getElementById('load-btn');
      this.volumeSlider = document.getElementById('volume-slider');
      this.muteBtn = document.getElementById('mute-btn');
      this.promoModal = document.getElementById('promo-modal');
      this.startModal = document.getElementById('start-modal');
      this.gameOverModal = document.getElementById('game-over-modal');
      this.victoryModal = document.getElementById('victory-modal');

      // State
      this.state = null;
      this.score = 0;
      this.movesCount = 0;
      this.aiDifficulty = 2;
      this.selectedSquare = null;
      this.legalDestinations = [];
      this.lastMove = null;
      this.pendingPromoMove = null;
      this.isAiThinking = false;

      // Board Dimensions
      this.boardSize = 640;
      this.cellSize = 80;
      this.gutterSize = 24;

      // Engines
      this.battleEngine = new BattleEngine(this.fxCanvas, (shake) => {
        this.applyShake(shake);
      });

      this.initEvents();
      this.initAudioUI();
      this.handleResize();
      this.initGame();
      this.startLoop();
    }

    initEvents() {
      window.addEventListener('resize', () => this.handleResize());

      // Spacebar skips animation
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && this.battleEngine.isBusy()) {
          e.preventDefault();
          this.skipAnimation();
        }
      });

      this.skipBtn.addEventListener('click', () => this.skipAnimation());
      this.undoBtn.addEventListener('click', () => this.undoMove());
      this.newGameBtn.addEventListener('click', () => this.initGame());

      if (this.saveBtn) this.saveBtn.addEventListener('click', () => this.saveFleet());
      if (this.loadBtn) this.loadBtn.addEventListener('click', () => this.loadFleet());

      // AI Selector buttons
      document.querySelectorAll('.ai-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.ai-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.aiDifficulty = parseInt(btn.dataset.level, 10);
        });
      });

      // Modal Start Button
      const startAction = document.getElementById('start-action-btn');
      if (startAction) startAction.addEventListener('click', () => {
        this.startModal.style.display = 'none';
        if (global.ArmadaAudio) global.ArmadaAudio.resume();
      });

      const retryAction = document.getElementById('retry-action-btn');
      if (retryAction) retryAction.addEventListener('click', () => {
        this.gameOverModal.style.display = 'none';
        this.initGame();
      });

      const victoryAction = document.getElementById('victory-action-btn');
      if (victoryAction) victoryAction.addEventListener('click', () => {
        this.victoryModal.style.display = 'none';
        this.initGame();
      });

      // Pawn Promotion Buttons
      document.querySelectorAll('.promo-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const promoType = btn.dataset.piece;
          this.promoModal.style.display = 'none';
          if (this.pendingPromoMove) {
            const finalMove = { ...this.pendingPromoMove, promotion: promoType };
            this.pendingPromoMove = null;
            this.executeMove(finalMove);
          }
        });
      });
    }

    initAudioUI() {
      if (!global.ArmadaAudio) return;
      const vol = global.ArmadaAudio.getVolume();
      this.volumeSlider.value = Math.round(vol * 100);

      this.volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        global.ArmadaAudio.setVolume(val);
      });

      this.muteBtn.addEventListener('click', () => {
        const muted = global.ArmadaAudio.toggleMute();
        this.muteBtn.style.opacity = muted ? '0.4' : '1';
      });
    }

    handleResize() {
      const topBarHeight = 56;
      const bottomBarHeight = 32;
      const margin = 16;

      const availWidth = Math.max(300, window.innerWidth - margin * 2);
      const availHeight = Math.max(300, window.innerHeight - topBarHeight - bottomBarHeight - margin * 2);

      const maxSquare = Math.floor(Math.min(availWidth, availHeight));
      this.boardSize = Math.max(288, Math.floor(maxSquare / 8) * 8);
      this.cellSize = this.boardSize / 8;
      this.gutterSize = Math.max(20, Math.round(this.cellSize * 0.28));

      const totalSize = this.boardSize + this.gutterSize * 2;

      // Update CSS variables
      document.documentElement.style.setProperty('--board-size', `${this.boardSize}px`);
      document.documentElement.style.setProperty('--gutter-size', `${this.gutterSize}px`);

      this.boardContainer.style.width = `${totalSize}px`;
      this.boardContainer.style.height = `${totalSize}px`;

      this.fxCanvas.width = totalSize;
      this.fxCanvas.height = totalSize;
      this.fxCanvas.style.width = `${totalSize}px`;
      this.fxCanvas.style.height = `${totalSize}px`;

      this.battleEngine.setCanvas(this.fxCanvas);

      if (this.squarePxText) {
        this.squarePxText.textContent = `Square: ~${Math.round(this.cellSize)}px`;
      }

      this.renderBoard();
    }

    initGame() {
      if (global.ArmadaAudio) global.ArmadaAudio.resume();
      this.state = global.ChessEngine.createInitialState();
      this.score = 0;
      this.movesCount = 0;
      this.selectedSquare = null;
      this.legalDestinations = [];
      this.lastMove = null;
      this.pendingPromoMove = null;
      this.isAiThinking = false;

      this.updateHUD();
      this.renderBoard();
    }

    updateHUD() {
      if (!this.state) return;
      const isWhite = this.state.turn === 'w';

      this.turnPill.className = `turn-pill ${isWhite ? '' : 'black-turn'}`;
      if (this.isAiThinking) {
        this.turnText.textContent = 'AI THINKING...';
      } else if (this.battleEngine.isBusy()) {
        this.turnText.textContent = 'ENGAGEMENT COMBAT';
      } else {
        this.turnText.textContent = isWhite ? 'YOUR TURN' : 'AI OPPONENT';
      }

      this.checkAlert.style.display = (this.state.isCheck && !this.state.isCheckmate) ? 'flex' : 'none';
      this.scoreText.textContent = `SCORE: ${this.score}`;
      this.whiteCapText.textContent = this.state.capturedByWhite.length;
      this.blackCapText.textContent = this.state.capturedByBlack.length;
      this.movesText.textContent = `Moves: ${this.movesCount}`;
      this.undoBtn.disabled = this.state.history.length < 2 || this.isAiThinking || this.battleEngine.isBusy();
      this.skipBtn.style.display = this.battleEngine.isBusy() ? 'flex' : 'none';
    }

    squareToCanvas(r, c) {
      return {
        x: this.gutterSize + c * this.cellSize + this.cellSize / 2,
        y: this.gutterSize + r * this.cellSize + this.cellSize / 2,
      };
    }

    renderBoard() {
      if (!this.state) return;
      this.chessGrid.innerHTML = '';

      const { board, isCheck } = this.state;
      const kingPos = isCheck ? global.ChessEngine.findKing(board, this.state.turn) : null;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const squareEl = document.createElement('div');
          const isDark = (r + c) % 2 === 1;
          squareEl.className = `square ${isDark ? 'dark' : 'light'}`;
          squareEl.dataset.r = r;
          squareEl.dataset.c = c;

          // Selected square highlight
          if (this.selectedSquare && this.selectedSquare.r === r && this.selectedSquare.c === c) {
            squareEl.classList.add('selected');
          }

          // Last move highlight
          if (this.lastMove && ((this.lastMove.from.r === r && this.lastMove.from.c === c) || (this.lastMove.to.r === r && this.lastMove.to.c === c))) {
            squareEl.classList.add('last-move');
          }

          // Check alert on king's square
          if (kingPos && kingPos.r === r && kingPos.c === c) {
            squareEl.classList.add('check-alert');
          }

          // Legal move destinations
          const destMove = this.legalDestinations.find(m => m.to.r === r && m.to.c === c);
          if (destMove) {
            squareEl.classList.add(destMove.captured ? 'legal-capture' : 'legal-move');
          }

          // Render Piece Token (unless hidden during active battle or glide)
          const piece = board[r][c];
          const isAttackerHidden = this.battleEngine.isBusy() && this.lastMove && this.lastMove.from.r === r && this.lastMove.from.c === c;
          const isDefenderHidden = this.battleEngine.activeBattle && this.battleEngine.activeBattle.move.to.r === r && this.battleEngine.activeBattle.move.to.c === c;

          if (piece && !isAttackerHidden && !isDefenderHidden) {
            squareEl.appendChild(this.createPieceElement(piece));
          }

          squareEl.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.handleSquareClick(r, c);
          });

          this.chessGrid.appendChild(squareEl);
        }
      }
    }

    createPieceElement(piece) {
      const token = document.createElement('div');
      token.className = `piece-token color-${piece.color}`;
      token.dataset.piece = piece.type;

      // One shared size setting for this piece type.
      const imageSize = SHIP_IMAGE_SIZES[piece.type] ?? 82;

      const applyShipSize = (element) => {
        element.style.width = `${imageSize}%`;
        element.style.height = `${imageSize}%`;
        element.style.flexShrink = '0';
      };

      // Ship holder: keeps your existing placement and drop shadow.
      const rim = document.createElement('div');
      rim.className = 'ship-rim';

      // Starship image.
      const img = document.createElement('img');
      img.className = 'ship-graphic';
      img.alt = PIECE_TITLES[piece.type];
      img.draggable = false;

      applyShipSize(img);

      // Give the procedural fallback the same piece-specific size.
      img.onerror = () => {
        rim.innerHTML = getProceduralShipSvg(
          piece.type,
          piece.color
        );

        const fallbackSvg = rim.querySelector('svg');

        if (fallbackSvg) {
          applyShipSize(fallbackSvg);
        }
      };

      img.src = SHIP_IMAGES[piece.type];

      rim.appendChild(img);
      token.appendChild(rim);

      // Separate emblem: its size and position stay unchanged.
      const badge = document.createElement('div');
      badge.className = 'emblem-badge';

      const glyphSpan = document.createElement('span');
      glyphSpan.className = 'emblem-glyph';
      glyphSpan.textContent = PIECE_GLYPHS[piece.type];
      glyphSpan.style.display = 'none';

      const markerImg = document.createElement('img');
      markerImg.className = 'emblem-icon';
      markerImg.alt = '';
      markerImg.draggable = false;

      markerImg.onerror = () => {
        markerImg.style.display = 'none';
        glyphSpan.style.display = 'inline';
      };

      markerImg.src = MARKER_IMAGES[piece.type];

      const label = document.createElement('span');
      label.className = 'emblem-text';
      label.textContent = PIECE_NAMES[piece.type];

      badge.appendChild(markerImg);
      badge.appendChild(glyphSpan);
      badge.appendChild(label);

      token.appendChild(badge);

      return token;
    }

    handleSquareClick(r, c) {
      if (!this.state || this.state.turn === 'b' || this.isAiThinking || this.battleEngine.isBusy()) {
        return;
      }

      const clickedPiece = this.state.board[r][c];

      // 1. Check if clicking legal destination
      if (this.selectedSquare) {
        const matchingMove = this.legalDestinations.find(m => m.to.r === r && m.to.c === c);
        if (matchingMove) {
          // Pawn promotion modal
          if (matchingMove.piece.type === 'p' && (matchingMove.to.r === 0 || matchingMove.to.r === 7)) {
            this.pendingPromoMove = matchingMove;
            this.promoModal.style.display = 'flex';
            if (global.ArmadaAudio) global.ArmadaAudio.playConfirmSelect();
            return;
          }

          this.executeMove(matchingMove);
          return;
        }
      }

      // 2. Select own piece
      if (clickedPiece && clickedPiece.color === this.state.turn) {
        this.selectedSquare = { r, c };
        this.legalDestinations = global.ChessEngine.getLegalMovesForSquare(this.state, r, c);
        if (global.ArmadaAudio) global.ArmadaAudio.playCrispClick();
        this.renderBoard();
      } else {
        // Deselect
        this.selectedSquare = null;
        this.legalDestinations = [];
        this.renderBoard();
      }
    }

    executeMove(move) {
      if (global.ArmadaAudio) global.ArmadaAudio.resume();

      this.selectedSquare = null;
      this.legalDestinations = [];
      this.lastMove = move;
      this.renderBoard();
      this.updateHUD();

      const fromCoords = this.squareToCanvas(move.from.r, move.from.c);
      const toCoords = this.squareToCanvas(move.to.r, move.to.c);

      const onComplete = () => {
        const nextState = global.ChessEngine.makeMove(this.state, move);
        this.state = nextState;
        this.movesCount++;

        if (move.captured && move.piece.color === 'w') {
          const vals = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 5000 };
          this.score += vals[move.captured.type] || 100;
        }

        this.renderBoard();
        this.updateHUD();

        if (nextState.isCheckmate) {
          if (move.piece.color === 'w') {
            if (global.ArmadaAudio) global.ArmadaAudio.playVictoryFanfare();
            document.getElementById('victory-score').textContent = `Sector Secured! Final Score: ${this.score}`;
            this.victoryModal.style.display = 'flex';
          } else {
            if (global.ArmadaAudio) global.ArmadaAudio.playDefeatMotif();
            document.getElementById('game-over-desc').textContent = `Command Citadel destroyed. Final Score: ${this.score}`;
            this.gameOverModal.style.display = 'flex';
          }
        } else if (nextState.isDraw) {
          document.getElementById('game-over-title').textContent = 'TACTICAL DRAW';
          document.getElementById('game-over-desc').textContent = `Stalemate reached. Final Score: ${this.score}`;
          this.gameOverModal.style.display = 'flex';
        } else if (nextState.isCheck) {
          if (global.ArmadaAudio) global.ArmadaAudio.playErrorBuzz();
        } else if (move.captured) {
          if (global.ArmadaAudio) global.ArmadaAudio.playGunshotBlast();
        } else {
          if (global.ArmadaAudio) global.ArmadaAudio.playCrispClick();
        }

        // Trigger AI turn if Black's move
        if (this.state.turn === 'b' && !this.state.isCheckmate && !this.state.isDraw) {
          this.triggerAiTurn();
        }
      };

      if (move.captured) {
        this.battleEngine.startBattle(move, fromCoords, toCoords, onComplete);
      } else {
        this.battleEngine.startGlide(move, fromCoords, toCoords, onComplete);
      }

      this.updateHUD();
    }

    triggerAiTurn() {
      this.isAiThinking = true;
      this.updateHUD();

      setTimeout(() => {
        if (!this.state || this.state.turn !== 'b') {
          this.isAiThinking = false;
          this.updateHUD();
          return;
        }

        const bestMove = global.ChessEngine.findBestMove(this.state, this.aiDifficulty);
        this.isAiThinking = false;

        if (bestMove) {
          if (bestMove.piece.type === 'p' && bestMove.to.r === 7 && !bestMove.promotion) {
            bestMove.promotion = 'q';
          }
          this.executeMove(bestMove);
        }
      }, 400);
    }

    skipAnimation() {
      this.battleEngine.skipAnimation();
      this.updateHUD();
    }

    undoMove() {
      if (this.state.history.length < 2 || this.isAiThinking || this.battleEngine.isBusy()) {
        if (global.ArmadaAudio) global.ArmadaAudio.playErrorBuzz();
        return;
      }
      if (global.ArmadaAudio) global.ArmadaAudio.playCrispClick();

      let state = global.ChessEngine.createInitialState();
      const targetLen = this.state.history.length - 2;
      for (let i = 0; i < targetLen; i++) {
        state = global.ChessEngine.makeMove(state, this.state.history[i]);
      }
      this.state = state;
      this.lastMove = targetLen > 0 ? state.history[targetLen - 1] : null;
      this.selectedSquare = null;
      this.legalDestinations = [];
      this.movesCount = Math.max(0, this.movesCount - 2);
      this.renderBoard();
      this.updateHUD();
    }

    saveFleet() {
      if (!this.state) return;
      try {
        const payload = {
          board: this.state.board,
          turn: this.state.turn,
          halfmoveClock: this.state.halfmoveClock,
          fullmoveNumber: this.state.fullmoveNumber,
          enPassantTarget: this.state.enPassantTarget,
          history: this.state.history,
          score: this.score,
          movesCount: this.movesCount,
        };
        localStorage.setItem('armada_fleet_save', JSON.stringify(payload));
        if (global.ArmadaAudio) global.ArmadaAudio.playConfirmSelect();
        alert('Cosmic Armada deployment state saved successfully!');
      } catch (e) {
        console.error('Save failed:', e);
      }
    }

    loadFleet() {
      try {
        const raw = localStorage.getItem('armada_fleet_save');
        if (!raw) {
          alert('No saved deployment found in local telemetry storage.');
          return;
        }
        const saved = JSON.parse(raw);
        this.state = {
          board: saved.board,
          turn: saved.turn,
          halfmoveClock: saved.halfmoveClock || 0,
          fullmoveNumber: saved.fullmoveNumber || 1,
          enPassantTarget: saved.enPassantTarget || null,
          history: saved.history || [],
          isCheck: false,
          isCheckmate: false,
          isStalemate: false,
          isDraw: false,
          capturedByWhite: [],
          capturedByBlack: [],
        };
        this.score = saved.score || 0;
        this.movesCount = saved.movesCount || 0;
        this.lastMove = this.state.history.length > 0 ? this.state.history[this.state.history.length - 1] : null;
        this.selectedSquare = null;
        this.legalDestinations = [];
        this.renderBoard();
        this.updateHUD();
        if (global.ArmadaAudio) global.ArmadaAudio.playConfirmSelect();
      } catch (e) {
        console.error('Load failed:', e);
        alert('Failed to parse saved deployment.');
      }
    }

    applyShake(amount) {
      if (amount <= 0) {
        this.boardContainer.style.transform = 'none';
        return;
      }
      const sx = (Math.random() - 0.5) * amount;
      const sy = (Math.random() - 0.5) * amount;
      this.boardContainer.style.transform = `translate(${sx}px, ${sy}px)`;
    }

    startLoop() {
      // Preload the same ship images used on the chessboard.
      this.canvasShipImages = {};

      Object.keys(SHIP_IMAGES).forEach((type) => {
        const image = new Image();

        image.onerror = () => {
          console.error(
            'Could not load ship image:',
            SHIP_IMAGES[type]
          );
        };

        image.src = SHIP_IMAGES[type];
        this.canvasShipImages[type] = image;
      });

      let lastTime = performance.now();
      let previousAnimation = null;

      const loop = (now) => {
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        this.battleEngine.update(dt);

        // Detect each new battle or glide, including consecutive moves.
        const currentAnimation =
          this.battleEngine.activeBattle ||
          this.battleEngine.activeGlide ||
          null;

        if (currentAnimation !== previousAnimation) {
          previousAnimation = currentAnimation;
          this.renderBoard();
          this.updateHUD();
        }

        this.battleEngine.render(
          (ctx, piece, x, y, opacity, angle) => {
            this.drawPieceCanvas(
              ctx,
              piece,
              x,
              y,
              opacity,
              angle
            );
          }
        );

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    }

    drawPieceCanvas(ctx, piece, cx, cy, opacity = 1, angle) {
      if (!piece || !this.canvasShipImages) return;

      const image = this.canvasShipImages[piece.type];

      // Use the real PNG, not a circle, triangle, or chess icon.
      if (
        !image ||
        !image.complete ||
        image.naturalWidth === 0 ||
        image.naturalHeight === 0
      ) {
        return;
      }

      // Match the board image using the same piece-specific size.
      // The existing ship holder occupies 72% of the square.
      const imageSize = SHIP_IMAGE_SIZES[piece.type] ?? 82;

      const imageBoxSize =
        this.cellSize * 0.72 * (imageSize / 100);

      // Preserve the ship image's aspect ratio.
      const scale = Math.min(
        imageBoxSize / image.naturalWidth,
        imageBoxSize / image.naturalHeight
      );

      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;

      // Match the existing board rotation convention.
      // Source PNGs are assumed to face right.
      const restingAngle = piece.color === 'w'
        ? -Math.PI / 2
        : Math.PI / 2;

      const rotation = Number.isFinite(angle)
        ? angle
        : restingAngle;

      ctx.save();

      try {
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
        ctx.shadowBlur = 0;
        ctx.imageSmoothingEnabled = true;

        // Center the transparent PNG on the battle position.
        ctx.drawImage(
          image,
          -width / 2,
          -height / 2,
          width,
          height
        );
      } finally {
        ctx.restore();
      }
    }
  }

  // Initialize on DOM load
  window.addEventListener('DOMContentLoaded', () => {
    global.ArmadaApp = new CosmicArmadaApp();
  });
})(window);