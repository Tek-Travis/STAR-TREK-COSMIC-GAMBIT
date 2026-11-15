// Cosmic Gambit controller — Stockfish integration and battle ON/OFF button.
// Obsolete marker-image loading removed.
(function(global){
'use strict';

const PIECE_GLYPHS={
 p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'
};

const PIECE_NAMES={
 p:'PAWN',n:'KNIGHT',b:'BISHOP',
 r:'ROOK',q:'QUEEN',k:'KING'
};

const PIECE_TITLES={
 p:'Scout Corvette',
 n:'Interceptor Destroyer',
 b:'Cruiser Frigate',
 r:'Heavy Battlecruiser',
 q:'Armada Flagship',
 k:'Command Citadel Flagship'
};

const SCORE_VALUES={
 p:100,n:300,b:300,r:500,q:900,k:5000
};

const PREF_KEYS={
 w:'armada_player_fleet',
 b:'armada_enemy_fleet'
};

const SAVE_KEY='armada_fleet_save';
const MAX_PIXEL_RATIO=2;

function getProceduralShipSvg(type,fleet){
 const primary=fleet.primary;
 const accent=fleet.accent;
 const hull=fleet.hull;

 const shapes={
  k:`<circle cx="50" cy="50" r="42" fill="none" stroke="${primary}" stroke-width="3" stroke-dasharray="8 4"/><circle cx="50" cy="50" r="30" fill="${hull}" stroke="${accent}" stroke-width="2"/><polygon points="50,15 65,40 58,75 50,68 42,75 35,40" fill="${primary}"/><circle cx="50" cy="50" r="10" fill="white"/>`,
  q:`<polygon points="50,12 85,55 68,82 50,70 32,82 15,55" fill="${hull}" stroke="${primary}" stroke-width="2.5"/><polygon points="50,18 76,52 64,74 50,65 36,74 24,52" fill="${primary}"/><circle cx="50" cy="46" r="12" fill="${accent}"/><circle cx="50" cy="46" r="6" fill="white"/>`,
  r:`<rect x="26" y="24" width="48" height="54" rx="4" fill="${hull}" stroke="${primary}" stroke-width="2.5"/><rect x="32" y="30" width="36" height="42" fill="${primary}"/><polygon points="26,24 16,40 16,70 26,78" fill="${accent}"/><polygon points="74,24 84,40 84,70 74,78" fill="${accent}"/><rect x="42" y="42" width="16" height="18" fill="white"/>`,
  b:`<polygon points="50,10 75,55 60,86 50,75 40,86 25,55" fill="${hull}" stroke="${primary}" stroke-width="2.5"/><polygon points="50,18 68,52 56,76 50,68 44,76 32,52" fill="${primary}"/><ellipse cx="50" cy="44" rx="8" ry="14" fill="${accent}"/>`,
  n:`<polygon points="50,12 80,45 68,82 45,68 25,78 32,40" fill="${hull}" stroke="${primary}" stroke-width="2.5"/><polygon points="50,20 72,45 60,72 45,62 34,70 38,42" fill="${primary}"/><polygon points="45,26 62,42 40,52" fill="${accent}"/>`,
  p:`<polygon points="50,15 78,65 60,78 50,70 40,78 22,65" fill="${hull}" stroke="${primary}" stroke-width="2.5"/><polygon points="50,24 70,62 58,70 50,65 42,70 30,62" fill="${primary}"/><polygon points="50,30 62,54 38,54" fill="${accent}"/>`
 };

 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="ship-svg">${shapes[type]||shapes.p}</svg>`;
}

function validateBasicState(state){
 if(
  !state||
  !Array.isArray(state.board)||
  state.board.length!==8||
  !state.board.every(row=>Array.isArray(row)&&row.length===8)
 ){
  throw Error('Chess state must contain an 8 by 8 board.');
 }

 if(!['w','b'].includes(state.turn)){
  throw Error('Chess state has an invalid turn.');
 }

 for(const row of state.board){
  for(const piece of row){
   if(
    piece&&(
     !['w','b'].includes(piece.color)||
     !Object.prototype.hasOwnProperty.call(PIECE_NAMES,piece.type)
    )
   ){
    throw Error('Chess state contains an invalid piece.');
   }
  }
 }

 if(!Array.isArray(state.history)){
  state.history=[];
 }

 if(!Array.isArray(state.capturedByWhite)){
  state.capturedByWhite=state.history
   .filter(m=>m&&m.captured&&m.piece&&m.piece.color==='w')
   .map(m=>m.captured);
 }

 if(!Array.isArray(state.capturedByBlack)){
  state.capturedByBlack=state.history
   .filter(m=>m&&m.captured&&m.piece&&m.piece.color==='b')
   .map(m=>m.captured);
 }

 return state;
}

function positionIdentity(state){
 return state.turn+':'+state.board
  .map(row=>row.map(p=>p?p.color+p.type:'--').join(''))
  .join('/');
}

function sameMove(a,b){
 return Boolean(
  a&&b&&a.from&&b.from&&a.to&&b.to&&
  a.from.r===b.from.r&&
  a.from.c===b.from.c&&
  a.to.r===b.to.r&&
  a.to.c===b.to.c&&
  (a.promotion||'')===(b.promotion||'')
 );
}

class CosmicArmadaApp{
 constructor(){
  this.F=global.ArmadaFactions;
  this.E=global.ChessEngine;

  if(
   !this.F||
   ![
    'getFleet',
    'getFleetById',
    'getShip',
    'normalizeFleetId',
    'listFleets'
   ].every(k=>typeof this.F[k]==='function')
  ){
   throw Error('Missing or mismatched factions.js.');
  }

  if(!this.E){
   throw Error('ChessEngine is missing. Check chess.js.');
  }

  for(const name of [
   'createInitialState',
   'makeMove',
   'getLegalMoves',
   'getLegalMovesForSquare',
   'findBestMove',
   'findKing',
   'toFEN'
  ]){
   if(typeof this.E[name]!=='function'){
    throw Error(`ChessEngine.${name} is missing.`);
   }
  }

  if(typeof global.BattleEngine!=='function'){
   throw Error('BattleEngine is missing. Check battle.js.');
  }

  if(typeof global.StockfishAI!=='function'){
   throw Error(
    'Stockfish adapter is missing. Load stockfish-ai.js before main.js.'
   );
  }

  const ids={
   boardContainer:'board-container',
   chessGrid:'chess-grid',
   fxCanvas:'fx-canvas',
   turnText:'turn-text',
   turnPill:'turn-pill',
   checkAlert:'check-alert',
   scoreText:'score-val',
   whiteCapText:'white-cap-count',
   blackCapText:'black-cap-count',
   movesText:'moves-count',
   squarePxText:'square-px',
   skipBtn:'skip-btn',
   undoBtn:'undo-btn',
   newGameBtn:'new-game-btn',
   saveBtn:'save-btn',
   loadBtn:'load-btn',
   volumeSlider:'volume-slider',
   muteBtn:'mute-btn',
   promoModal:'promo-modal',
   startModal:'start-modal',
   gameOverModal:'game-over-modal',
   victoryModal:'victory-modal',
   playerFleetSelector:'player-fleet-select',
   enemyFleetSelector:'enemy-fleet-select',
   playerFleetLabel:'player-fleet-label',
   enemyFleetLabel:'enemy-fleet-label'
  };

  for(const [key,id]of Object.entries(ids)){
   this[key]=document.getElementById(id);

   if(!this[key]){
    throw Error(`Required HTML element #${id} is missing.`);
   }
  }

  this.state=null;
  this.score=0;
  this.movesCount=0;
  this.aiDifficulty=2;

  // Battle animations default to ON.
  this.battleAnimationsEnabled=true;
  this.battleToggleBtn=document.getElementById('battle-toggle-btn');

  this.stockfishAI=new global.StockfishAI({
   chessEngine:this.E
  });

  this.aiBackend='not-started';
  this.lastAiError=null;

  this.selectedSquare=null;
  this.legalDestinations=[];
  this.lastMove=null;
  this.pendingPromoMove=null;
  this.isAiThinking=false;

  this.boardSize=640;
  this.cellSize=80;
  this.gutterSize=24;
  this.session=0;
  this.aiTimer=null;
  this.needsResize=false;

  this.resetFrameClock=true;
  this.renderedAnimation=null;
  this.pixelRatio=1;

  this.canvasShipImages=new Map();
  this.fleetIds={...this.F.defaultIds};

  for(const side of ['w','b']){
   try{
    this.fleetIds[side]=this.F.normalizeFleetId(
     localStorage.getItem(PREF_KEYS[side]),
     this.F.defaultIds[side]
    );
   }catch(error){}
  }

  this.battleEngine=new global.BattleEngine(
   this.fxCanvas,
   (amount,time)=>this.applyShake(amount,time)
  );

  if(
   typeof this.battleEngine.setFactionResolver!=='function'||
   typeof this.battleEngine.motionSample!=='function'
  ){
   throw Error('Missing matching battle.js interface.');
  }

  this.battleEngine.setFactionResolver(
   piece=>this.F.getFleet(piece,this.fleetIds)
  );

  this.initFleetUI();
  this.initEvents();
  this.initAudioUI();
  this.initGame();
  this.handleResize();
  this.startLoop();
 }

 audio(name,...args){
  const audio=global.ArmadaAudio;

  if(!audio||typeof audio[name]!=='function'){
   return;
  }

  try{
   const result=audio[name](...args);

   if(result&&typeof result.catch==='function'){
    result.catch(error=>{
     console.warn(`Audio ${name} unavailable:`,error);
    });
   }

   return result;
  }catch(error){
   console.warn(`Audio ${name} unavailable:`,error);
  }
 }

 controlsLocked(){
  return (
   this.isAiThinking||
   this.battleEngine.isBusy()||
   Boolean(this.pendingPromoMove)
  );
 }

 updateBattleToggle(){
  if(!this.battleToggleBtn){
   return;
  }

  const enabled=this.battleAnimationsEnabled;

  this.battleToggleBtn.textContent=enabled
   ?'Battles: ON'
   :'Battles: OFF';

  this.battleToggleBtn.setAttribute(
   'aria-pressed',
   String(enabled)
  );

  this.battleToggleBtn.style.opacity=enabled?'1':'0.55';

  this.battleToggleBtn.title=enabled
   ?'Battle animations are on. Click to turn off.'
   :'Battle animations are off. Click to turn on.';
 }

 initFleetUI(){
  for(const [side,select]of [
   ['w',this.playerFleetSelector],
   ['b',this.enemyFleetSelector]
  ]){
   select.innerHTML='';

   for(const fleet of this.F.listFleets()){
    const option=document.createElement('option');
    option.value=fleet.id;

    option.textContent=/^[1-9]\d*$/.test(fleet.id)
     ?`${fleet.name} — Fleet ${fleet.id}`
     :fleet.name;

    select.appendChild(option);
   }

   select.value=this.fleetIds[side];

   select.addEventListener('change',()=>{
    if(this.controlsLocked()){
     select.value=this.fleetIds[side];
     return;
    }

    this.setFleet(side,select.value);
    this.renderBoard();
    this.updateHUD();
    this.handleResize();
   });
  }
 }

 setFleet(side,value){
  if(!['w','b'].includes(side)){
   return;
  }

  this.fleetIds[side]=this.F.normalizeFleetId(
   value,
   this.F.defaultIds[side]
  );

  (
   side==='w'
    ?this.playerFleetSelector
    :this.enemyFleetSelector
  ).value=this.fleetIds[side];

  try{
   localStorage.setItem(
    PREF_KEYS[side],
    this.fleetIds[side]
   );
  }catch(error){}

  this.preloadShips();
 }

 initEvents(){
  // Keep this control usable during an active battle.
  if(this.battleToggleBtn){
   this.battleToggleBtn.addEventListener('click',()=>{
    this.battleAnimationsEnabled=!this.battleAnimationsEnabled;
    this.updateBattleToggle();

    if(
     !this.battleAnimationsEnabled&&
     this.battleEngine.activeBattle
    ){
     this.skipAnimation();
    }
   });
  }else{
   console.warn(
    'Battle toggle button is missing. Add #battle-toggle-btn to index.html.'
   );
  }

  this.updateBattleToggle();

  window.addEventListener('resize',()=>{
   this.handleResize();
  });

  document.addEventListener('visibilitychange',()=>{
   this.resetFrameClock=true;
  });

  window.addEventListener('keydown',e=>{
   const tag=e.target&&e.target.tagName;

   if(
    e.code==='Space'&&
    !['SELECT','INPUT','BUTTON','TEXTAREA'].includes(tag)&&
    this.battleEngine.isBusy()
   ){
    e.preventDefault();
    this.skipAnimation();
   }
  });

  this.skipBtn.addEventListener('click',()=>{
   this.skipAnimation();
  });

  this.undoBtn.addEventListener('click',()=>{
   this.undoMove();
  });

  this.newGameBtn.addEventListener('click',()=>{
   this.initGame();
  });

  this.saveBtn.addEventListener('click',()=>{
   this.saveFleet();
  });

  this.loadBtn.addEventListener('click',()=>{
   this.loadFleet();
  });

  document.querySelectorAll('.ai-btn').forEach(btn=>{
   btn.addEventListener('click',()=>{
    if(this.controlsLocked()){
     return;
    }

    const level=Number(btn.dataset.level);

    if(![1,2,3].includes(level)){
     return;
    }

    this.aiDifficulty=level;
    this.updateHUD();
   });
  });

  const bind=(id,fn)=>{
   const el=document.getElementById(id);

   if(el){
    el.addEventListener('click',fn);
   }
  };

  bind('start-action-btn',()=>{
   this.startModal.style.display='none';
   this.audio('resume');
   this.resetFrameClock=true;
   this.handleResize();
  });

  bind('retry-action-btn',()=>{
   this.initGame();
  });

  bind('victory-action-btn',()=>{
   this.initGame();
  });

  document.querySelectorAll('.promo-option').forEach(btn=>{
   btn.addEventListener('click',()=>{
    const type=btn.dataset.piece;

    if(
     !this.pendingPromoMove||
     !['q','r','b','n'].includes(type)
    ){
     return;
    }

    const move={
     ...this.pendingPromoMove,
     promotion:type
    };

    this.pendingPromoMove=null;
    this.promoModal.style.display='none';
    this.executeMove(move);
   });
  });
 }

 initAudioUI(){
  if(!global.ArmadaAudio){
   this.volumeSlider.disabled=true;
   this.muteBtn.disabled=true;
   return;
  }

  const volume=this.audio('getVolume');

  if(Number.isFinite(volume)){
   this.volumeSlider.value=Math.round(volume*100);
  }

  this.volumeSlider.addEventListener('input',e=>{
   this.audio(
    'setVolume',
    parseFloat(e.target.value)/100
   );
  });

  this.muteBtn.addEventListener('click',()=>{
   this.muteBtn.style.opacity=this.audio('toggleMute')
    ?'0.4'
    :'1';
  });
 }

 handleResize(){
  if(this.battleEngine.isBusy()){
   this.needsResize=true;
   return;
  }

  this.needsResize=false;

  const arena=document.getElementById('arena');
  const header=document.getElementById('hud-header');
  const footer=document.getElementById('hud-footer');

  const width=arena.clientWidth||window.innerWidth;

  const height=arena.clientHeight||(
   window.innerHeight-
   header.getBoundingClientRect().height-
   footer.getBoundingClientRect().height
  );

  const available=Math.max(
   96,
   Math.min(width,height)-16
  );

  let board=Math.floor(available/8)*8;

  while(
   board>64&&
   board+2*Math.max(
    20,
    Math.round(board/8*.28)
   )>available
  ){
   board-=8;
  }

  this.boardSize=board;
  this.cellSize=board/8;

  this.gutterSize=Math.max(
   20,
   Math.round(this.cellSize*.28)
  );

  const total=board+this.gutterSize*2;

  document.documentElement.style.setProperty(
   '--board-size',
   `${board}px`
  );

  document.documentElement.style.setProperty(
   '--gutter-size',
   `${this.gutterSize}px`
  );

  this.boardContainer.style.width=`${total}px`;
  this.boardContainer.style.height=`${total}px`;

  this.pixelRatio=Math.max(
   1,
   Math.min(
    MAX_PIXEL_RATIO,
    window.devicePixelRatio||1
   )
  );

  this.fxCanvas.width=Math.round(total*this.pixelRatio);
  this.fxCanvas.height=Math.round(total*this.pixelRatio);

  this.fxCanvas.style.width=`${total}px`;
  this.fxCanvas.style.height=`${total}px`;

  this.battleEngine.setCanvas(
   this.fxCanvas,
   total,
   total
  );

  this.squarePxText.textContent=
   `Square: ~${Math.round(this.cellSize)}px`;

  this.renderBoard();

  const holder=this.chessGrid.querySelector('.ship-rim');
  const rect=holder&&holder.getBoundingClientRect();

  this.shipHolderSize=rect&&rect.width>0
   ?Math.min(rect.width,rect.height)
   :this.cellSize*.72;
 }

 cancelPendingWork(){
  this.session++;

  if(this.aiTimer!==null){
   clearTimeout(this.aiTimer);
  }

  this.aiTimer=null;

  if(this.stockfishAI){
   this.stockfishAI.cancel();
  }

  this.isAiThinking=false;
  this.battleEngine.cancelAnimation();
  this.resetFrameClock=true;
 }

 initGame(){
  this.cancelPendingWork();
  this.audio('resume');

  this.state=validateBasicState(
   this.E.createInitialState()
  );

  this.score=0;
  this.movesCount=0;
  this.aiBackend='not-started';
  this.lastAiError=null;

  this.selectedSquare=null;
  this.legalDestinations=[];
  this.lastMove=null;
  this.pendingPromoMove=null;

  this.promoModal.style.display='none';
  this.gameOverModal.style.display='none';
  this.victoryModal.style.display='none';

  document.getElementById('game-over-title').textContent=
   'FLAGSHIP DESTROYED';

  // Preserve the user's battle toggle selection across new games.
  this.preloadShips();
  this.updateHUD();
  this.renderBoard();
  this.handleResize();
 }

 ended(){
  return Boolean(
   this.state&&(
    this.state.isGameOver||
    this.state.isCheckmate||
    this.state.isDraw
   )
  );
 }

 updateHUD(){
  this.updateBattleToggle();

  if(!this.state){
   return;
  }

  const white=this.state.turn==='w';
  const busy=this.battleEngine.isBusy();
  const locked=this.controlsLocked();

  this.turnPill.className=
   `turn-pill ${white?'':'black-turn'}`;

  this.turnText.textContent=this.ended()
   ?'GAME COMPLETE'
   :this.isAiThinking
    ?'AI THINKING...'
    :busy
     ?'ENGAGEMENT COMBAT'
     :white
      ?'YOUR TURN'
      :'AI OPPONENT';

  this.turnText.title=this.aiBackend==='custom-fallback'
   ?'Using custom AI fallback; inspect console for Stockfish error.'
   :this.aiBackend==='stockfish'
    ?'Stockfish browser engine'
    :'';

  this.checkAlert.style.display=
   this.state.isCheck&&!this.state.isCheckmate
    ?'flex'
    :'none';

  this.scoreText.textContent=`SCORE: ${this.score}`;
  this.whiteCapText.textContent=this.state.capturedByWhite.length;
  this.blackCapText.textContent=this.state.capturedByBlack.length;
  this.movesText.textContent=`Moves: ${this.movesCount}`;

  this.undoBtn.disabled=
   this.state.history.length<2||locked;

  this.skipBtn.style.display=busy?'flex':'none';
  this.saveBtn.disabled=locked;
  this.loadBtn.disabled=locked;

  this.playerFleetSelector.disabled=locked;
  this.enemyFleetSelector.disabled=locked;

  this.playerFleetSelector.value=this.fleetIds.w;
  this.enemyFleetSelector.value=this.fleetIds.b;

  this.playerFleetLabel.textContent=
   `White: ${this.F.getFleetById(this.fleetIds.w).name}`;

  this.enemyFleetLabel.textContent=
   `Black: ${this.F.getFleetById(this.fleetIds.b).name}`;

  document.querySelectorAll('.ai-btn').forEach(btn=>{
   btn.disabled=locked;

   btn.classList.toggle(
    'active',
    Number(btn.dataset.level)===this.aiDifficulty
   );
  });
 }

 squareToCanvas(r,c){
  const square=this.chessGrid.querySelector(
   `.square[data-r="${r}"][data-c="${c}"]`
  );

  if(square){
   const canvas=this.fxCanvas.getBoundingClientRect();
   const rim=square.querySelector('.ship-rim');

   if(rim){
    const rect=rim.getBoundingClientRect();

    return{
     x:rect.left-canvas.left+rect.width/2,
     y:rect.top-canvas.top+rect.height/2
    };
   }

   const rect=square.getBoundingClientRect();

   return{
    x:rect.left-canvas.left+
      square.clientLeft+square.clientWidth/2,
    y:rect.top-canvas.top+
      square.clientTop+square.clientHeight*.41
   };
  }

  return{
   x:this.gutterSize+(c+.5)*this.cellSize,
   y:this.gutterSize+(r+.41)*this.cellSize
  };
 }

 capturedSquare(move){
  return move.capturedSquare||(
   move.isEnPassant
    ?{r:move.from.r,c:move.to.c}
    :move.to
  );
 }

 renderBoard(){
  if(!this.state){
   return;
  }

  this.chessGrid.innerHTML='';

  const {board,isCheck}=this.state;

  const kingPos=isCheck
   ?this.E.findKing(board,this.state.turn)
   :null;

  const animation=
   this.battleEngine.activeBattle||
   this.battleEngine.activeGlide;

  const animatedMove=animation&&animation.move;

  this.renderedAnimation=animation||null;

  const captured=this.battleEngine.activeBattle&&
   this.capturedSquare(
    this.battleEngine.activeBattle.move
   );

  for(let r=0;r<8;r++){
   for(let c=0;c<8;c++){
    const el=document.createElement('div');

    el.className=`square ${(r+c)%2?'dark':'light'}`;
    el.dataset.r=r;
    el.dataset.c=c;

    if(
     this.selectedSquare&&
     this.selectedSquare.r===r&&
     this.selectedSquare.c===c
    ){
     el.classList.add('selected');
    }

    if(
     this.lastMove&&(
      (
       this.lastMove.from.r===r&&
       this.lastMove.from.c===c
      )||
      (
       this.lastMove.to.r===r&&
       this.lastMove.to.c===c
      )
     )
    ){
     el.classList.add('last-move');
    }

    if(
     kingPos&&
     kingPos.r===r&&
     kingPos.c===c
    ){
     el.classList.add('check-alert');
    }

    const dest=this.legalDestinations.find(
     m=>m.to.r===r&&m.to.c===c
    );

    if(dest){
     el.classList.add(
      dest.captured?'legal-capture':'legal-move'
     );
    }

    const hiddenAttacker=
     animatedMove&&
     animatedMove.from.r===r&&
     animatedMove.from.c===c;

    const hiddenDefender=
     captured&&
     captured.r===r&&
     captured.c===c;

    if(
     board[r][c]&&
     !hiddenAttacker&&
     !hiddenDefender
    ){
     el.appendChild(
      this.createPieceElement(board[r][c])
     );
    }

    el.addEventListener('pointerdown',e=>{
     e.stopPropagation();
     this.handleSquareClick(r,c);
    });

    this.chessGrid.appendChild(el);
   }
  }
 }

 createPieceElement(piece){
  const a=this.F.getShip(piece,this.fleetIds);
  const record=this.getShipAsset(piece);

  const token=document.createElement('div');
  token.className=`piece-token color-${piece.color}`;
  token.dataset.piece=piece.type;
  token.dataset.fleet=a.fleet.id;

  const rim=document.createElement('div');
  rim.className='ship-rim';

  const size=el=>{
   el.style.width=`${a.size}%`;
   el.style.height=`${a.size}%`;
   el.style.flexShrink='0';
  };

  const img=document.createElement('img');
  img.className='ship-graphic';
  img.alt=`${a.fleet.name} ${PIECE_TITLES[piece.type]}`;
  img.draggable=false;

  size(img);

  let attempt=Math.min(
   record.attempt,
   record.sources.length-1
  );

  const applySource=()=>{
   const source=record.sources[attempt];

   img.style.transform=
    `rotate(${a.rotation-source.forward}rad)`;

   img.src=source.src;
  };

  img.onerror=()=>{
   attempt++;

   if(attempt<record.sources.length){
    applySource();
    return;
   }

   rim.innerHTML=getProceduralShipSvg(
    piece.type,
    a.fleet
   );

   const svg=rim.querySelector('svg');

   if(svg){
    size(svg);
    svg.style.transform=
     `rotate(${a.rotation+Math.PI/2}rad)`;
   }
  };

  rim.appendChild(img);
  token.appendChild(rim);
  applySource();

  // Text-only identification badge; no deleted image assets requested.
  const badge=document.createElement('div');
  badge.className='emblem-badge';

  const glyph=document.createElement('span');
  glyph.className='emblem-glyph';
  glyph.textContent=PIECE_GLYPHS[piece.type];
  glyph.style.display='inline';

  const label=document.createElement('span');
  label.className='emblem-text';
  label.textContent=PIECE_NAMES[piece.type];

  badge.appendChild(glyph);
  badge.appendChild(label);

  token.appendChild(badge);

  return token;
 }

 getShipAsset(piece){
  const a=this.F.getShip(piece,this.fleetIds);

  const key=JSON.stringify([
   a.fleet.id,
   piece.type,
   a.src,
   a.fallbackSrc
  ]);

  if(this.canvasShipImages.has(key)){
   return this.canvasShipImages.get(key);
  }

  const sources=[
   {
    src:a.src,
    forward:a.artForwardAngle
   }
  ];

  if(a.src!==a.fallbackSrc){
   sources.push({
    src:a.fallbackSrc,
    forward:0
   });
  }

  sources.push({
   src:'data:image/svg+xml;charset=utf-8,'+
    encodeURIComponent(
     getProceduralShipSvg(piece.type,a.fleet)
    ),
   forward:-Math.PI/2
  });

  const image=new Image();

  const record={
   image,
   sources,
   attempt:0,
   ready:false,
   source:sources[0]
  };

  this.canvasShipImages.set(key,record);

  image.onload=()=>{
   record.ready=Boolean(
    image.naturalWidth&&image.naturalHeight
   );
  };

  image.onerror=()=>{
   record.ready=false;
   record.attempt++;

   if(record.attempt<sources.length){
    record.source=sources[record.attempt];
    image.src=record.source.src;
   }else{
    record.source=null;
   }
  };

  image.src=record.source.src;

  return record;
 }

 preloadShips(){
  for(const color of ['w','b']){
   for(const type of this.F.types){
    this.getShipAsset({type,color});
   }
  }
 }

 handleSquareClick(r,c){
  if(
   !this.state||
   this.ended()||
   this.state.turn==='b'||
   this.controlsLocked()
  ){
   return;
  }

  if(this.selectedSquare){
   const move=this.legalDestinations.find(
    m=>m.to.r===r&&m.to.c===c
   );

   if(move){
    if(
     move.piece.type==='p'&&
     (move.to.r===0||move.to.r===7)
    ){
     this.pendingPromoMove=move;
     this.promoModal.style.display='flex';
     this.audio('playConfirmSelect');
     this.updateHUD();
     return;
    }

    this.executeMove(move);
    return;
   }
  }

  const piece=this.state.board[r][c];

  if(piece&&piece.color===this.state.turn){
   this.selectedSquare={r,c};

   this.legalDestinations=
    this.E.getLegalMovesForSquare(this.state,r,c);

   this.audio('playCrispClick');
  }else{
   this.selectedSquare=null;
   this.legalDestinations=[];
  }

  this.renderBoard();
 }

 presentResult(){
  if(this.state.isCheckmate){
   if(
    this.state.winner==='w'||
    this.state.turn==='b'
   ){
    this.audio('playVictoryFanfare');

    document.getElementById('victory-score').textContent=
     `Sector Secured! Final Score: ${this.score}`;

    this.victoryModal.style.display='flex';
   }else{
    this.audio('playDefeatMotif');

    document.getElementById('game-over-title').textContent=
     'FLAGSHIP DESTROYED';

    document.getElementById('game-over-desc').textContent=
     `Command Citadel destroyed. Final Score: ${this.score}`;

    this.gameOverModal.style.display='flex';
   }
  }else if(this.state.isDraw){
   const reasons={
    'stalemate':'Stalemate',
    'dead-position':'Dead position',
    'fivefold-repetition':'Fivefold repetition',
    'seventy-five-move-rule':'75-move rule',
    'threefold-repetition':'Threefold repetition',
    'fifty-move-rule':'50-move rule',
    'agreement':'Draw by agreement'
   };

   document.getElementById('game-over-title').textContent=
    'TACTICAL DRAW';

   document.getElementById('game-over-desc').textContent=
    `${reasons[this.state.drawReason]||'Draw'}. Final Score: ${this.score}`;

   this.gameOverModal.style.display='flex';
  }
 }

 executeMove(move){
  if(
   !this.state||
   this.ended()||
   this.battleEngine.isBusy()
  ){
   return;
  }

  this.audio('resume');

  this.selectedSquare=null;
  this.legalDestinations=[];
  this.lastMove=move;

  const from=this.squareToCanvas(
   move.from.r,
   move.from.c
  );

  const to=this.squareToCanvas(
   move.to.r,
   move.to.c
  );

  const session=this.session;

  const complete=()=>{
   if(session!==this.session){
    return;
   }

   this.state=validateBasicState(
    this.E.makeMove(this.state,move)
   );

   this.movesCount++;

   if(move.captured&&move.piece.color==='w'){
    this.score+=SCORE_VALUES[move.captured.type]||100;
   }

   this.renderBoard();
   this.updateHUD();
   this.presentResult();

   if(this.needsResize){
    this.handleResize();
   }

   if(!this.ended()){
    if(this.state.isCheck){
     this.audio('playErrorBuzz');
    }else{
     this.audio(
      move.captured
       ?'playGunshotBlast'
       :'playCrispClick'
     );
    }
   }

   if(this.state.turn==='b'&&!this.ended()){
    this.triggerAiTurn();
   }
  };

  // Battles OFF: apply captures through the same completion path.
  if(move.captured&&!this.battleAnimationsEnabled){
   complete();
   return;
  }

  if(move.captured){
   const captured=this.capturedSquare(move);

   this.battleEngine.startBattle(
    move,
    from,
    to,
    complete,
    {
     defenderCoords:this.squareToCanvas(
      captured.r,
      captured.c
     ),
     attackerHeading:this.F.getShip(
      move.piece,
      this.fleetIds
     ).rotation,
     defenderHeading:this.F.getShip(
      move.captured,
      this.fleetIds
     ).rotation
    }
   );
  }else{
   this.battleEngine.startGlide(
    move,
    from,
    to,
    complete
   );
  }

  this.resetFrameClock=true;
  this.renderBoard();
  this.updateHUD();
 }

 triggerAiTurn(){
  if(
   !this.state||
   this.isAiThinking||
   this.battleEngine.isBusy()||
   this.ended()||
   this.state.turn!=='b'
  ){
   return;
  }

  this.isAiThinking=true;
  this.updateHUD();

  const session=this.session;
  const level=this.aiDifficulty;

  this.aiTimer=setTimeout(async()=>{
   this.aiTimer=null;

   if(session!==this.session){
    return;
   }

   if(
    !this.state||
    this.state.turn!=='b'||
    this.ended()
   ){
    this.isAiThinking=false;
    this.updateHUD();
    return;
   }

   try{
    let best;

    try{
     best=await this.stockfishAI.findBestMove(
      this.state,
      level
     );

     if(session!==this.session){
      return;
     }

     this.aiBackend='stockfish';
     this.lastAiError=null;

     console.info(
      'Stockfish move:',
      this.stockfishAI.getStats()
     );
    }catch(error){
     if(session!==this.session){
      return;
     }

     this.aiBackend='custom-fallback';

     this.lastAiError=String(
      error&&error.message||error
     );

     console.warn(
      'Stockfish unavailable; using the existing custom AI:',
      error
     );

     best=this.E.findBestMove(
      this.state,
      level
     );
    }

    if(session!==this.session){
     return;
    }

    if(
     !this.state||
     this.state.turn!=='b'||
     this.ended()
    ){
     this.isAiThinking=false;
     this.updateHUD();
     return;
    }

    if(best){
     const legal=this.E.getLegalMoves(this.state)
      .find(m=>sameMove(m,best));

     if(!legal){
      throw Error('AI returned an illegal move.');
     }

     this.isAiThinking=false;
     this.executeMove(legal);
    }else{
     if(typeof this.E.getGameStatus==='function'){
      Object.assign(
       this.state,
       this.E.getGameStatus(this.state)
      );
     }

     this.isAiThinking=false;
     this.updateHUD();
     this.presentResult();

     if(!this.ended()){
      throw Error(
       'AI returned no move in an active position.'
      );
     }
    }
   }catch(error){
    if(session!==this.session){
     return;
    }

    this.isAiThinking=false;
    this.updateHUD();

    console.error('AI move failed:',error);
   }
  },400);
 }

 skipAnimation(){
  this.battleEngine.skipAnimation();
  this.updateHUD();
 }

 undoMove(){
  if(
   !this.state||
   this.state.history.length<2||
   this.controlsLocked()
  ){
   this.audio('playErrorBuzz');
   return;
  }

  this.audio('playCrispClick');

  let state=this.E.createInitialState();

  const history=this.state.history;
  const count=history.length-2;

  for(let i=0;i<count;i++){
   state=this.E.makeMove(state,history[i]);
  }

  this.cancelPendingWork();

  this.state=validateBasicState(state);
  this.lastMove=count?state.history[count-1]:null;
  this.selectedSquare=null;
  this.legalDestinations=[];
  this.movesCount=count;

  this.score=state.history.reduce(
   (total,m)=>total+(
    m.captured&&m.piece.color==='w'
     ?(SCORE_VALUES[m.captured.type]||100)
     :0
   ),
   0
  );

  this.gameOverModal.style.display='none';
  this.victoryModal.style.display='none';

  this.renderBoard();
  this.updateHUD();

  if(this.state.turn==='b'&&!this.ended()){
   this.triggerAiTurn();
  }
 }

 saveFleet(){
  if(!this.state||this.controlsLocked()){
   return;
  }

  try{
   localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
     version:4,
     state:this.state,
     score:this.score,
     movesCount:this.movesCount,
     playerFleetId:this.fleetIds.w,
     enemyFleetId:this.fleetIds.b,
     fleetIds:{...this.fleetIds},
     aiDifficulty:this.aiDifficulty
    })
   );

   this.audio('playConfirmSelect');
   alert('Deployment and both fleet selections saved.');
  }catch(error){
   console.error('Save failed:',error);
   alert('Could not save deployment in this browser.');
  }
 }

 loadFleet(){
  if(this.controlsLocked()){
   return;
  }

  try{
   const raw=localStorage.getItem(SAVE_KEY);

   if(!raw){
    alert('No saved deployment found.');
    return;
   }

   const saved=JSON.parse(raw);

   if(!saved||typeof saved!=='object'){
    throw Error('Invalid save data.');
   }

   let candidate=saved.state;

   if(!candidate){
    const legacy=validateBasicState({...saved});
    candidate=legacy;

    if(legacy.history.length){
     try{
      let replay=this.E.createInitialState();

      for(const move of legacy.history){
       replay=this.E.makeMove(replay,move);
      }

      if(
       positionIdentity(replay)===
       positionIdentity(legacy)
      ){
       candidate=replay;
      }
     }catch(error){
      console.warn(
       'Legacy history could not be replayed; checking saved state.',
       error
      );
     }
    }
   }

   validateBasicState(candidate);

   if(
    typeof this.E.validateState==='function'&&
    this.E.validateState(candidate)===false
   ){
    throw Error('Chess engine rejected the saved state.');
   }

   if(typeof this.E.getGameStatus==='function'){
    Object.assign(
     candidate,
     this.E.getGameStatus(candidate)
    );
   }

   const ids=
    saved.fleetIds&&typeof saved.fleetIds==='object'
     ?saved.fleetIds
     :{};

   const playerId=ids.w!==undefined
    ?ids.w
    :saved.playerFleetId!==undefined
     ?saved.playerFleetId
     :this.fleetIds.w;

   const enemyId=ids.b!==undefined
    ?ids.b
    :saved.enemyFleetId!==undefined
     ?saved.enemyFleetId
     :this.fleetIds.b;

   this.cancelPendingWork();

   this.state=candidate;

   this.score=Number.isFinite(saved.score)
    ?saved.score
    :0;

   this.movesCount=Number.isFinite(saved.movesCount)
    ?saved.movesCount
    :candidate.history.length;

   this.aiBackend='not-started';
   this.lastAiError=null;

   this.setFleet('w',playerId);
   this.setFleet('b',enemyId);

   this.aiDifficulty=[1,2,3].includes(saved.aiDifficulty)
    ?saved.aiDifficulty
    :this.aiDifficulty;

   this.lastMove=candidate.history.length
    ?candidate.history[candidate.history.length-1]
    :null;

   this.selectedSquare=null;
   this.legalDestinations=[];
   this.pendingPromoMove=null;

   this.promoModal.style.display='none';
   this.startModal.style.display='none';
   this.gameOverModal.style.display='none';
   this.victoryModal.style.display='none';

   this.renderBoard();
   this.updateHUD();
   this.handleResize();
   this.presentResult();
   this.audio('playConfirmSelect');

   if(this.state.turn==='b'&&!this.ended()){
    this.triggerAiTurn();
   }
  }catch(error){
   console.error('Load failed:',error);
   alert('Could not load this deployment.');
  }
 }

 applyShake(amount,time){
  if(amount<=0){
   this.boardContainer.style.transform='none';
   return;
  }

  const t=Number.isFinite(time)
   ?time
   :performance.now()/1000;

  const x=(
   Math.sin(t*41)+.35*Math.sin(t*73)
  )*.36*amount;

  const y=(
   Math.sin(t*47+.7)+.3*Math.sin(t*67)
  )*.36*amount;

  this.boardContainer.style.transform=
   `translate(${x}px, ${y}px)`;
 }

 startLoop(){
  let lastTime=null;

  const loop=now=>{
   const dt=
    lastTime===null||
    this.resetFrameClock||
    document.hidden
     ?0
     :Math.max(
      0,
      Math.min(.25,(now-lastTime)/1000)
     );

   lastTime=now;
   this.resetFrameClock=false;

   const ratio=Math.max(
    1,
    Math.min(
     MAX_PIXEL_RATIO,
     window.devicePixelRatio||1
    )
   );

   if(Math.abs(ratio-this.pixelRatio)>.001){
    if(this.battleEngine.isBusy()){
     this.needsResize=true;
    }else{
     this.handleResize();
    }
   }

   this.battleEngine.update(dt);

   const animation=
    this.battleEngine.activeBattle||
    this.battleEngine.activeGlide||
    null;

   if(animation!==this.renderedAnimation){
    this.renderBoard();
    this.updateHUD();
   }

   this.battleEngine.render(
    (ctx,piece,x,y,opacity,angle)=>{
     this.drawPieceCanvas(
      ctx,piece,x,y,opacity,angle
     );
    }
   );

   requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
 }

 drawPieceCanvas(
  ctx,piece,cx,cy,opacity=1,angle
 ){
  if(!piece){
   return;
  }

  const a=this.F.getShip(piece,this.fleetIds);
  const record=this.getShipAsset(piece);
  const image=record.image;

  const box=(
   this.shipHolderSize||this.cellSize*.72
  )*(a.size/100);

  const heading=Number.isFinite(angle)
   ?angle
   :a.rotation;

  ctx.save();

  try{
   ctx.translate(cx,cy);

   ctx.globalAlpha*=Math.max(
    0,
    Math.min(1,opacity)
   );

   ctx.shadowBlur=0;
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='high';

   if(
    record.ready&&
    record.source&&
    image.complete&&
    image.naturalWidth&&
    image.naturalHeight
   ){
    ctx.rotate(heading-record.source.forward);

    const scale=Math.min(
     box/image.naturalWidth,
     box/image.naturalHeight
    );

    const width=image.naturalWidth*scale;
    const height=image.naturalHeight*scale;

    ctx.drawImage(
     image,
     -width/2,
     -height/2,
     width,
     height
    );
   }else{
    ctx.rotate(heading);
    ctx.fillStyle=a.fleet.primary;

    ctx.beginPath();
    ctx.moveTo(box*.45,0);
    ctx.lineTo(-box*.35,-box*.3);
    ctx.lineTo(-box*.2,0);
    ctx.lineTo(-box*.35,box*.3);
    ctx.closePath();
    ctx.fill();
   }
  }finally{
   ctx.restore();
  }
 }
}

function boot(){
 if(global.ArmadaApp){
  return;
 }

 try{
  global.ArmadaApp=new CosmicArmadaApp();
 }catch(error){
  console.error(
   'Cosmic Armada startup failed:',
   error
  );

  const modal=document.getElementById('start-modal');
  const title=modal&&modal.querySelector('.modal-title');
  const desc=modal&&modal.querySelector('.modal-desc');
  const button=document.getElementById('start-action-btn');

  if(modal){
   modal.style.display='flex';
  }

  if(title){
   title.textContent='STARTUP ERROR';
  }

  if(desc){
   desc.textContent=error.message;
  }

  if(button){
   button.disabled=true;
   button.textContent='CHECK LOCAL FILES';
  }
 }
}

global.CosmicArmadaApp=CosmicArmadaApp;

if(document.readyState==='loading'){
 document.addEventListener(
  'DOMContentLoaded',
  boot,
  {once:true}
 );
}else{
 boot();
}

})(window);