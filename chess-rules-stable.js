// Cosmic Armada Gambit — Standard Chess Rules / Basic AI
// Rules reference: FIDE Laws effective 1 January 2023, checked November 2026.
// Scope: standard untimed digital chess, not a tournament-arbiter simulator.
// Dead-position recognition is conservative; see RULES_NOTES.txt.
(function(global) {
  'use strict';

  const VALUES = {p:100,n:320,b:330,r:500,q:900,k:20000};
  const TYPES = 'pnbrqk';
  const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
  const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const opposite = color => color === 'w' ? 'b' : 'w';
  const inside = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const cloneBoard = board => board.map(row => row.map(p => p ? {...p} : null));
  const square = (r,c) => String.fromCharCode(97+c) + (8-r);

  function validate(state) {
    if (!state || !['w','b'].includes(state.turn) ||
        !Array.isArray(state.board) || state.board.length !== 8) {
      throw new Error('Invalid chess state.');
    }
    const kings = {w:0,b:0};
    for (let r=0;r<8;r++) {
      const row=state.board[r];
      if (!Array.isArray(row) || row.length !== 8) throw new Error('Board must be 8 by 8.');
      for (const p of row) {
        if (!p) continue;
        if (!['w','b'].includes(p.color) || !TYPES.includes(p.type) || p.type.length !== 1) {
          throw new Error('Invalid piece.');
        }
        if (p.type === 'k') kings[p.color]++;
        if (p.type === 'p' && (r===0 || r===7)) throw new Error('Unpromoted pawn on final rank.');
      }
    }
    if (kings.w!==1 || kings.b!==1) throw new Error('Exactly one king of each color is required.');
    const w=findKing(state.board,'w'), b=findKing(state.board,'b');
    if (Math.max(Math.abs(w.r-b.r),Math.abs(w.c-b.c))<=1) throw new Error('Kings cannot be adjacent.');
    for (const name of ['halfmoveClock','fullmoveNumber']) {
      if (state[name] !== undefined && (!Number.isInteger(state[name]) || state[name] < (name==='fullmoveNumber'?1:0))) {
        throw new Error('Invalid move counter.');
      }
    }
    const ep=state.enPassantTarget;
    if (ep && (!inside(ep.r,ep.c) || !Number.isInteger(ep.r) || !Number.isInteger(ep.c) ||
        ep.r !== (state.turn==='w'?2:5) || state.board[ep.r][ep.c])) {
      throw new Error('Invalid en passant target.');
    }
    return true;
  }

  function findKing(board,color) {
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const p=board[r][c];
      if(p && p.type==='k' && p.color===color) return {r,c};
    }
    return null;
  }

  function isSquareAttacked(board,r,c,defendingColor) {
    const enemy=opposite(defendingColor);
    const dir=enemy==='w'?-1:1;
    for(const dc of [-1,1]) {
      const nr=r-dir, nc=c+dc;
      if(inside(nr,nc)) {
        const p=board[nr][nc];
        if(p && p.color===enemy && p.type==='p') return true;
      }
    }
    for(const [dr,dc] of KNIGHT) {
      const nr=r+dr,nc=c+dc;
      if(inside(nr,nc)) {
        const p=board[nr][nc];
        if(p && p.color===enemy && p.type==='n') return true;
      }
    }
    for(const [dirs,type] of [[ORTH,'r'],[DIAG,'b']]) {
      for(const [dr,dc] of dirs) {
        let nr=r+dr,nc=c+dc;
        while(inside(nr,nc)) {
          const p=board[nr][nc];
          if(p) {
            if(p.color===enemy && (p.type===type || p.type==='q')) return true;
            break;
          }
          nr+=dr; nc+=dc;
        }
      }
    }
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) {
      if(!dr&&!dc) continue;
      const nr=r+dr,nc=c+dc;
      if(inside(nr,nc)) {
        const p=board[nr][nc];
        if(p && p.color===enemy && p.type==='k') return true;
      }
    }
    return false;
  }

  function isKingInCheck(board,color) {
    const king=findKing(board,color);
    if(!king) throw new Error('Cannot evaluate a position with a missing king.');
    return isSquareAttacked(board,king.r,king.c,color);
  }

  function rights(state) {
    const result={w:{k:false,q:false},b:{k:false,q:false}};
    for(const color of ['w','b']) {
      const row=color==='w'?7:0;
      const king=state.board[row][4];
      for(const side of ['k','q']) {
        const rook=state.board[row][side==='k'?7:0];
        const present=king && king.type==='k' && king.color===color && !king.hasMoved &&
          rook && rook.type==='r' && rook.color===color && !rook.hasMoved;
        const explicit=state.castlingRights;
        result[color][side]=Boolean(present && (!explicit || (explicit[color] && explicit[color][side]===true)));
      }
    }
    return result;
  }

  function pseudoMoves(state,r,c) {
    const board=state.board,piece=board[r][c],moves=[];
    if(!piece) return moves;
    const enemy=opposite(piece.color);
    const add=(nr,nc,extra={})=>{
      const target=board[nr][nc];
      if(target && (target.color===piece.color || target.type==='k')) return;
      const base={from:{r,c},to:{r:nr,c:nc},piece:{...piece},captured:target?{...target}:null,...extra};
      if(base.captured && !base.capturedSquare) base.capturedSquare={r:nr,c:nc};
      if(piece.type==='p' && (nr===0 || nr===7)) {
        for(const promotion of ['q','r','b','n']) moves.push({...base,promotion});
      } else moves.push(base);
    };
    if(piece.type==='p') {
      const dir=piece.color==='w'?-1:1,start=piece.color==='w'?6:1,nr=r+dir;
      if(inside(nr,c) && !board[nr][c]) {
        add(nr,c);
        if(r===start && !piece.hasMoved && !board[r+2*dir][c]) add(r+2*dir,c);
      }
      for(const dc of [-1,1]) {
        const nc=c+dc;
        if(!inside(nr,nc)) continue;
        const target=board[nr][nc];
        if(target && target.color===enemy) add(nr,nc);
        const ep=state.enPassantTarget,adjacent=board[r][nc];
        if(!target && ep && ep.r===nr && ep.c===nc && r===(piece.color==='w'?3:4) &&
           adjacent && adjacent.color===enemy && adjacent.type==='p') {
          add(nr,nc,{isEnPassant:true,captured:{...adjacent},capturedSquare:{r,c:nc}});
        }
      }
    } else if(piece.type==='n') {
      for(const [dr,dc] of KNIGHT) if(inside(r+dr,c+dc)) add(r+dr,c+dc);
    } else if(piece.type==='k') {
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) {
        if((dr||dc)&&inside(r+dr,c+dc)) add(r+dr,c+dc);
      }
      const row=piece.color==='w'?7:0,cr=rights(state)[piece.color];
      if(r===row && c===4 && !isKingInCheck(board,piece.color)) {
        for(const side of ['k','q']) {
          const empty=side==='k'?[5,6]:[1,2,3];
          const cross=side==='k'?5:3,dest=side==='k'?6:2;
          if(!cr[side] || empty.some(file=>board[row][file])) continue;
          const transit=cloneBoard(board);
          transit[row][4]=null; transit[row][cross]={...piece};
          if(isSquareAttacked(transit,row,cross,piece.color)) continue;
          add(row,dest,{isCastling:side==='k'?'kingside':'queenside'});
        }
      }
    } else {
      const dirs=piece.type==='b'?DIAG:piece.type==='r'?ORTH:[...ORTH,...DIAG];
      for(const [dr,dc] of dirs) {
        let nr=r+dr,nc=c+dc;
        while(inside(nr,nc)) {
          add(nr,nc);
          if(board[nr][nc]) break;
          nr+=dr;nc+=dc;
        }
      }
    }
    return moves;
  }

  function applyBoard(board,move) {
    const next=cloneBoard(board),{from,to}=move;
    const moving={...next[from.r][from.c],hasMoved:true};
    if(move.promotion) moving.type=move.promotion;
    next[from.r][from.c]=null;
    if(move.isEnPassant) next[from.r][to.c]=null;
    next[to.r][to.c]=moving;
    if(move.isCastling) {
      const fromFile=move.isCastling==='kingside'?7:0;
      const toFile=move.isCastling==='kingside'?5:3;
      next[from.r][toFile]={...next[from.r][fromFile],hasMoved:true};
      next[from.r][fromFile]=null;
    }
    return next;
  }

  // Internal generation ignores game-result flags (also useful for perft).
  function legalMoves(state,color=state.turn) {
    const result=[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const p=state.board[r][c];
      if(!p || p.color!==color) continue;
      const view=color===state.turn?state:{...state,turn:color,enPassantTarget:null};
      for(const move of pseudoMoves(view,r,c)) {
        if(!isKingInCheck(applyBoard(state.board,move),color)) result.push(move);
      }
    }
    return result;
  }

  function getLegalMoves(state,color=state.turn) {
    validate(state);
    return legalMoves(state,color);
  }

  function getLegalMovesForSquare(state,r,c) {
    return getLegalMoves(state).filter(m=>m.from.r===r && m.from.c===c);
  }

  function nextPosition(state,move) {
    const cr=rights(state),color=move.piece.color;
    if(move.piece.type==='k') cr[color]={k:false,q:false};
    const revoke=(owner,r,c)=>{
      if(r===(owner==='w'?7:0)) {
        if(c===0) cr[owner].q=false;
        if(c===7) cr[owner].k=false;
      }
    };
    if(move.piece.type==='r') revoke(color,move.from.r,move.from.c);
    if(move.captured && move.captured.type==='r') revoke(move.captured.color,move.to.r,move.to.c);
    return {
      board:applyBoard(state.board,move),turn:opposite(state.turn),castlingRights:cr,
      enPassantTarget:move.piece.type==='p' && Math.abs(move.to.r-move.from.r)===2
        ?{r:(move.from.r+move.to.r)/2,c:move.from.c}:null,
      halfmoveClock:move.piece.type==='p'||move.captured?0:(state.halfmoveClock||0)+1,
      fullmoveNumber:(state.fullmoveNumber||1)+(state.turn==='b'?1:0),
    };
  }

  function positionKey(state) {
    let placement='';
    for(const row of state.board) for(const p of row) placement+=p?(p.color==='w'?p.type.toUpperCase():p.type):'.';
    const cr=rights(state);
    const castling=(cr.w.k?'K':'')+(cr.w.q?'Q':'')+(cr.b.k?'k':'')+(cr.b.q?'q':'');
    // An unusable/pinned en passant target must not split repetition identities.
    const ep=state.enPassantTarget && legalMoves(state).some(m=>m.isEnPassant)
      ?square(state.enPassantTarget.r,state.enPassantTarget.c):'-';
    return placement+' '+state.turn+' '+(castling||'-')+' '+ep;
  }

  function baseInitial() {
    const board=Array.from({length:8},()=>Array(8).fill(null));
    const back=['r','n','b','q','k','b','n','r'];
    for(let c=0;c<8;c++) {
      board[0][c]={type:back[c],color:'b',hasMoved:false};
      board[1][c]={type:'p',color:'b',hasMoved:false};
      board[6][c]={type:'p',color:'w',hasMoved:false};
      board[7][c]={type:back[c],color:'w',hasMoved:false};
    }
    return {board,turn:'w',castlingRights:{w:{k:true,q:true},b:{k:true,q:true}},
      enPassantTarget:null,halfmoveClock:0,fullmoveNumber:1};
  }

  function sameMove(a,b) {
    return a && b && a.from && b.from && a.to && b.to &&
      a.from.r===b.from.r && a.from.c===b.from.c && a.to.r===b.to.r && a.to.c===b.to.c &&
      (a.promotion||'')===(b.promotion||'');
  }

  function resolveMove(state,request) {
    const move=legalMoves(state).find(m=>sameMove(m,request));
    if(!move) throw new Error('Illegal move, wrong turn, or missing/invalid promotion choice.');
    return move;
  }

  function timeline(state) {
    const current=positionKey(state);
    if(Array.isArray(state.positionKeys) && state.positionKeys.length &&
       state.positionKeys[state.positionKeys.length-1]===current) {
      return {keys:[...state.positionKeys],complete:state.repetitionHistoryComplete!==false};
    }
    // Recover history from the old controller's saved standard-start games.
    if(Array.isArray(state.history)) {
      try {
        let replay=baseInitial();
        const keys=[positionKey(replay)];
        for(const requested of state.history) {
          replay=nextPosition(replay,resolveMove(replay,requested));
          keys.push(positionKey(replay));
        }
        if(positionKey(replay)===current) return {keys,complete:true};
      } catch(error) { /* Unverifiable imported history is not fabricated. */ }
    }
    return {keys:[current],complete:false};
  }

  // Proven material-only dead-position cases. Not an exhaustive solver for
  // blocked positions or every possible dead-position construction.
  function isKnownDeadPosition(board) {
    const pieces=[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const p=board[r][c];
      if(p && p.type!=='k') pieces.push({...p,r,c});
    }
    if(!pieces.length) return true;
    if(pieces.length===1 && ['b','n'].includes(pieces[0].type)) return true;
    return pieces.every(p=>p.type==='b') &&
      pieces.every(p=>(p.r+p.c)%2===(pieces[0].r+pieces[0].c)%2);
  }

  function statusOf(state,keys) {
    const check=isKingInCheck(state.board,state.turn),moves=legalMoves(state);
    const mate=check && !moves.length,stalemate=!check && !moves.length;
    const occurrences=keys.filter(k=>k===positionKey(state)).length;
    let reason=null;
    if(!mate) {
      if(stalemate) reason='stalemate';
      else if(isKnownDeadPosition(state.board)) reason='dead-position';
      else if(occurrences>=5) reason='fivefold-repetition';
      else if((state.halfmoveClock||0)>=150) reason='seventy-five-move-rule';
    }
    return {
      isCheck:check,isCheckmate:mate,isStalemate:stalemate,isDraw:Boolean(reason),
      drawReason:reason,isGameOver:mate||Boolean(reason),
      winner:mate?opposite(state.turn):null,
      result:mate?(state.turn==='w'?'0-1':'1-0'):reason?'1/2-1/2':'*',
      repetitionCount:occurrences,
      canClaimThreefold:!mate&&!reason&&occurrences>=3,
      canClaimFiftyMove:!mate&&!reason&&(state.halfmoveClock||0)>=100,
    };
  }

  function getGameStatus(state) {
    validate(state);
    if(state.termination==='claimed-draw' || state.termination==='agreed-draw') {
      return {...statusOf(state,timeline(state).keys),isDraw:true,isGameOver:true,
        drawReason:state.drawReason,result:'1/2-1/2',winner:null};
    }
    return statusOf(state,timeline(state).keys);
  }

  function createInitialState() {
    const state={...baseInitial(),history:[],capturedByWhite:[],capturedByBlack:[],repetitionHistoryComplete:true};
    state.positionKeys=[positionKey(state)];
    return {...state,...statusOf(state,state.positionKeys)};
  }

  function makeMove(state,request) {
    validate(state);
    if(getGameStatus(state).isGameOver) throw new Error('The game has already ended.');
    const move=resolveMove(state,request),previous=timeline(state),next=nextPosition(state,move);
    const white=[...(state.capturedByWhite||[])],black=[...(state.capturedByBlack||[])];
    if(move.captured) (move.piece.color==='w'?white:black).push({...move.captured});
    const keys=[...previous.keys,positionKey(next)];
    return {...next,history:[...(state.history||[]),move],capturedByWhite:white,capturedByBlack:black,
      positionKeys:keys,repetitionHistoryComplete:previous.complete,...statusOf(next,keys)};
  }

  function canClaimDraw(state,intendedMove=null) {
    validate(state);
    if(getGameStatus(state).isGameOver) return {threefold:false,fiftyMove:false,canClaim:false};
    const previous=timeline(state);
    let candidate=state,keys=previous.keys;
    if(intendedMove) {
      candidate=nextPosition(state,resolveMove(state,intendedMove));
      keys=[...keys,positionKey(candidate)];
    }
    const count=keys.filter(k=>k===positionKey(candidate)).length;
    const threefold=count>=3,fiftyMove=(candidate.halfmoveClock||0)>=100;
    return {threefold,fiftyMove,canClaim:threefold||fiftyMove};
  }

  function claimDraw(state,reason='auto',intendedMove=null) {
    const allowed=canClaimDraw(state,intendedMove);
    const selected=reason==='auto'?(allowed.threefold?'threefold-repetition':'fifty-move-rule'):reason;
    if(!(selected==='threefold-repetition'&&allowed.threefold) &&
       !(selected==='fifty-move-rule'&&allowed.fiftyMove)) throw new Error('Draw claim is not valid.');
    // Intended-move claims end the game without executing the declared move.
    return {...state,board:cloneBoard(state.board),isDraw:true,isGameOver:true,
      drawReason:selected,termination:'claimed-draw',winner:null,result:'1/2-1/2',
      canClaimThreefold:false,canClaimFiftyMove:false};
  }

  function agreeDraw(state,consent) {
    if(getGameStatus(state).isGameOver) throw new Error('The game has already ended.');
    if(!consent || consent.w!==true || consent.b!==true || (state.history||[]).length<2) {
      throw new Error('Both players must consent after each has made a move.');
    }
    return {...state,board:cloneBoard(state.board),isDraw:true,isGameOver:true,
      termination:'agreed-draw',drawReason:'agreement',winner:null,result:'1/2-1/2',
      canClaimThreefold:false,canClaimFiftyMove:false};
  }

  // Useful for rules tests / analysis. This checks structure and basic king
  // legality, not proof that every supplied position is historically reachable.
  function fromFEN(fen) {
    const fields=String(fen).trim().split(/\s+/);
    if(fields.length!==6) throw new Error('FEN requires six fields.');
    const [placement,turn,castling,ep,half,full]=fields;
    const ranks=placement.split('/');
    if(ranks.length!==8 || !/^(?:-|K?Q?k?q?)$/.test(castling) || !castling) throw new Error('Invalid FEN.');
    const board=ranks.map(rank=>{
      const row=[];
      for(const char of rank) {
        if(/^[1-8]$/.test(char)) row.push(...Array(Number(char)).fill(null));
        else {
          const type=char.toLowerCase();
          if(!TYPES.includes(type)) throw new Error('Invalid FEN piece.');
          row.push({type,color:char===char.toUpperCase()?'w':'b',hasMoved:true});
        }
      }
      if(row.length!==8) throw new Error('Invalid FEN rank.');
      return row;
    });
    const cr={w:{k:castling.includes('K'),q:castling.includes('Q')},b:{k:castling.includes('k'),q:castling.includes('q')}};
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const p=board[r][c];
      if(p && p.type==='p') p.hasMoved=r!==(p.color==='w'?6:1);
    }
    for(const color of ['w','b']) {
      const r=color==='w'?7:0;
      if(cr[color].k||cr[color].q) {
        const k=board[r][4];
        if(!k||k.type!=='k'||k.color!==color) throw new Error('Invalid castling king.');
        k.hasMoved=false;
      }
      for(const side of ['k','q']) if(cr[color][side]) {
        const rook=board[r][side==='k'?7:0];
        if(!rook||rook.type!=='r'||rook.color!==color) throw new Error('Invalid castling rook.');
        rook.hasMoved=false;
      }
    }
    if(!/^\d+$/.test(half)||!/^\d+$/.test(full)) throw new Error('Invalid FEN counters.');
    if(ep!=='-'&&!/^[a-h][36]$/.test(ep)) throw new Error('Invalid FEN en passant.');
    const state={board,turn,castlingRights:cr,enPassantTarget:ep==='-'?null:{r:8-Number(ep[1]),c:ep.charCodeAt(0)-97},
      halfmoveClock:Number(half),fullmoveNumber:Number(full),history:[],capturedByWhite:[],capturedByBlack:[],
      repetitionHistoryComplete:false};
    validate(state);
    if(isKingInCheck(board,opposite(turn))) throw new Error('The side that just moved left its king in check.');
    if(state.enPassantTarget) {
      const dir=turn==='w'?-1:1,pr=state.enPassantTarget.r-dir;
      const p=board[pr][state.enPassantTarget.c];
      if(!p||p.type!=='p'||p.color!==opposite(turn)) throw new Error('Missing en passant pawn.');
    }
    state.positionKeys=[positionKey(state)];
    return {...state,...statusOf(state,state.positionKeys)};
  }

  function toFEN(state) {
    validate(state);
    const rows=state.board.map(row=>{
      let out='',empty=0;
      for(const p of row) {
        if(!p) empty++;
        else {if(empty) out+=empty;empty=0;out+=p.color==='w'?p.type.toUpperCase():p.type;}
      }
      if(empty) out+=empty;
      return out;
    });
    const cr=rights(state);
    const castling=(cr.w.k?'K':'')+(cr.w.q?'Q':'')+(cr.b.k?'k':'')+(cr.b.q?'q':'');
    const ep=state.enPassantTarget;
    return rows.join('/')+' '+state.turn+' '+(castling||'-')+' '+(ep?square(ep.r,ep.c):'-')+
      ' '+(state.halfmoveClock||0)+' '+(state.fullmoveNumber||1);
  }

  function perft(state,depth) {
    validate(state);
    if(!Number.isInteger(depth)||depth<0) throw new Error('Invalid perft depth.');
    const walk=(s,d)=>d===0?1:legalMoves(s).reduce((sum,m)=>sum+walk(nextPosition(s,m),d-1),0);
    return walk(state,depth);
  }

  // Basic AI only. No advanced-strength claims; upgrade separately after rules.
  function evaluate(state) {
    let score=0;
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const p=state.board[r][c];if(!p) continue;
      const center=7-Math.abs(r-3.5)-Math.abs(c-3.5);
      const advance=p.color==='w'?6-r:r-1;
      let bonus=p.type==='p'?advance*4+center*2:['n','b'].includes(p.type)?center*8:0;
      score+=(p.color==='w'?1:-1)*(VALUES[p.type]+bonus);
    }
    return score;
  }

  function findBestMove(state,difficulty=2) {
    if(getGameStatus(state).isGameOver) return null;
    const moves=legalMoves(state);
    if(!moves.length) return null;
    if(difficulty<=1) return moves[Math.floor(Math.random()*moves.length)];
    const deadline=performance.now()+180,stop={};
    const ordering=m=>(m.captured?10*VALUES[m.captured.type]-VALUES[m.piece.type]:0)+(m.promotion?VALUES[m.promotion]:0);
    const search=(s,depth,alpha,beta,ply)=>{
      if(performance.now()>=deadline) throw stop;
      const legal=legalMoves(s);
      if(!legal.length) return isKingInCheck(s.board,s.turn)?-100000+ply:0;
      if(s.halfmoveClock>=150||isKnownDeadPosition(s.board)) return 0;
      if(!depth) return evaluate(s)*(s.turn==='w'?1:-1);
      let best=-Infinity;
      legal.sort((a,b)=>ordering(b)-ordering(a));
      for(const m of legal) {
        const value=-search(nextPosition(s,m),depth-1,-beta,-alpha,ply+1);
        best=Math.max(best,value);alpha=Math.max(alpha,value);
        if(alpha>=beta) break;
      }
      return best;
    };
    // Establish an evaluated fallback for every candidate before deep search.
    let results=moves.map(move=>({move,score:evaluate(nextPosition(state,move))*(state.turn==='w'?1:-1)}));
    results.sort((a,b)=>b.score-a.score);
    let best=results[0].move;
    try {
      for(let depth=1;depth<=2;depth++) {
        const next=[];
        for(const {move} of results) next.push({move,score:-search(nextPosition(state,move),depth-1,-Infinity,Infinity,1)});
        next.sort((a,b)=>b.score-a.score);results=next;
        const tied=results.filter(x=>x.score===results[0].score);
        best=tied[Math.floor(Math.random()*tied.length)].move;
      }
    } catch(error) {if(error!==stop) throw error;}
    return best;
  }

  global.ChessEngine={createInitialState,getLegalMoves,getLegalMovesForSquare,makeMove,findKing,findBestMove,
    getGameStatus,canClaimDraw,claimDraw,agreeDraw,positionKey,isKingInCheck,isSquareAttacked,
    isKnownDeadPosition,validateState:validate,fromFEN,toFEN,perft};
})(window);
