// Cosmic Armada Gambit — Rules + Custom AI (November 2026)
// Standard untimed chess. Conservative dead-position recognition; see notes.
(function(global) {
'use strict';
const VALUES={p:100,n:320,b:330,r:500,q:900,k:20000};
const TYPES='pnbrqk';
const KNIGHT=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const ORTH=[[-1,0],[1,0],[0,-1],[0,1]],DIAG=[[-1,-1],[-1,1],[1,-1],[1,1]];
const opposite=color=>color==='w'?'b':'w';
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const cloneBoard=board=>board.map(row=>row.map(p=>p?{...p}:null));
const square=(r,c)=>String.fromCharCode(97+c)+(8-r);
function validate(state){
 if(!state||!['w','b'].includes(state.turn)||!Array.isArray(state.board)||state.board.length!==8)throw Error('Invalid chess state.');
 const kings={w:0,b:0};
 for(let r=0;r<8;r++){
  const row=state.board[r];if(!Array.isArray(row)||row.length!==8)throw Error('Board must be 8 by 8.');
  for(const p of row){if(!p)continue;
   if(!['w','b'].includes(p.color)||!TYPES.includes(p.type)||p.type.length!==1)throw Error('Invalid piece.');
   if(p.type==='k')kings[p.color]++;
   if(p.type==='p'&&(r===0||r===7))throw Error('Unpromoted pawn on final rank.');
  }
 }
 if(kings.w!==1||kings.b!==1)throw Error('Exactly one king of each color is required.');
 const w=findKing(state.board,'w'),b=findKing(state.board,'b');
 if(Math.max(Math.abs(w.r-b.r),Math.abs(w.c-b.c))<=1)throw Error('Kings cannot be adjacent.');
 for(const name of ['halfmoveClock','fullmoveNumber'])if(state[name]!==undefined&&(!Number.isInteger(state[name])||state[name]<(name==='fullmoveNumber'?1:0)))throw Error('Invalid move counter.');
 const ep=state.enPassantTarget;
 if(ep&&(!inside(ep.r,ep.c)||!Number.isInteger(ep.r)||!Number.isInteger(ep.c)||ep.r!==(state.turn==='w'?2:5)||state.board[ep.r][ep.c]))throw Error('Invalid en passant target.');
 return true;
}
function findKing(board,color){for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.type==='k'&&p.color===color)return{r,c};}return null;}
function isSquareAttacked(board,r,c,defendingColor){
 const enemy=opposite(defendingColor),dir=enemy==='w'?-1:1;
 for(const dc of [-1,1]){const nr=r-dir,nc=c+dc;if(inside(nr,nc)){const p=board[nr][nc];if(p&&p.color===enemy&&p.type==='p')return true;}}
 for(const [dr,dc]of KNIGHT){const nr=r+dr,nc=c+dc;if(inside(nr,nc)){const p=board[nr][nc];if(p&&p.color===enemy&&p.type==='n')return true;}}
 for(const [dirs,type]of [[ORTH,'r'],[DIAG,'b']])for(const [dr,dc]of dirs){let nr=r+dr,nc=c+dc;while(inside(nr,nc)){const p=board[nr][nc];if(p){if(p.color===enemy&&(p.type===type||p.type==='q'))return true;break;}nr+=dr;nc+=dc;}}
 for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inside(nr,nc)){const p=board[nr][nc];if(p&&p.color===enemy&&p.type==='k')return true;}}
 return false;
}
function isKingInCheck(board,color){const king=findKing(board,color);if(!king)throw Error('Cannot evaluate a position with a missing king.');return isSquareAttacked(board,king.r,king.c,color);}
function rights(state){
 const result={w:{k:false,q:false},b:{k:false,q:false}};
 for(const color of ['w','b']){const row=color==='w'?7:0,king=state.board[row][4];
  for(const side of ['k','q']){const rook=state.board[row][side==='k'?7:0];
   const present=king&&king.type==='k'&&king.color===color&&!king.hasMoved&&rook&&rook.type==='r'&&rook.color===color&&!rook.hasMoved;
   const explicit=state.castlingRights;result[color][side]=Boolean(present&&(!explicit||(explicit[color]&&explicit[color][side]===true)));
  }
 }return result;
}
function pseudoMoves(state,r,c){
 const board=state.board,piece=board[r][c],moves=[];if(!piece)return moves;const enemy=opposite(piece.color);
 const add=(nr,nc,extra={})=>{
  const target=board[nr][nc];if(target&&(target.color===piece.color||target.type==='k'))return;
  const base={from:{r,c},to:{r:nr,c:nc},piece:{...piece},captured:target?{...target}:null,...extra};
  if(base.captured&&!base.capturedSquare)base.capturedSquare={r:nr,c:nc};
  if(piece.type==='p'&&(nr===0||nr===7)){for(const promotion of ['q','r','b','n'])moves.push({...base,promotion});}else moves.push(base);
 };
 if(piece.type==='p'){
  const dir=piece.color==='w'?-1:1,start=piece.color==='w'?6:1,nr=r+dir;
  if(inside(nr,c)&&!board[nr][c]){add(nr,c);if(r===start&&!piece.hasMoved&&!board[r+2*dir][c])add(r+2*dir,c);}
  for(const dc of [-1,1]){const nc=c+dc;if(!inside(nr,nc))continue;const target=board[nr][nc];
   if(target&&target.color===enemy)add(nr,nc);
   const ep=state.enPassantTarget,adjacent=board[r][nc];
   if(!target&&ep&&ep.r===nr&&ep.c===nc&&r===(piece.color==='w'?3:4)&&adjacent&&adjacent.color===enemy&&adjacent.type==='p')add(nr,nc,{isEnPassant:true,captured:{...adjacent},capturedSquare:{r,c:nc}});
  }
 }else if(piece.type==='n'){for(const [dr,dc]of KNIGHT)if(inside(r+dr,c+dc))add(r+dr,c+dc);
 }else if(piece.type==='k'){
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inside(r+dr,c+dc))add(r+dr,c+dc);
  const row=piece.color==='w'?7:0,cr=rights(state)[piece.color];
  if(r===row&&c===4&&!isKingInCheck(board,piece.color))for(const side of ['k','q']){
   const empty=side==='k'?[5,6]:[1,2,3],cross=side==='k'?5:3,dest=side==='k'?6:2;
   if(!cr[side]||empty.some(file=>board[row][file]))continue;
   const transit=cloneBoard(board);transit[row][4]=null;transit[row][cross]={...piece};
   if(!isSquareAttacked(transit,row,cross,piece.color))add(row,dest,{isCastling:side==='k'?'kingside':'queenside'});
  }
 }else{
  const dirs=piece.type==='b'?DIAG:piece.type==='r'?ORTH:[...ORTH,...DIAG];
  for(const [dr,dc]of dirs){let nr=r+dr,nc=c+dc;while(inside(nr,nc)){add(nr,nc);if(board[nr][nc])break;nr+=dr;nc+=dc;}}
 }
 return moves;
}
function applyBoard(board,move){
 const next=cloneBoard(board),{from,to}=move,moving={...next[from.r][from.c],hasMoved:true};
 if(move.promotion)moving.type=move.promotion;next[from.r][from.c]=null;
 if(move.isEnPassant)next[from.r][to.c]=null;next[to.r][to.c]=moving;
 if(move.isCastling){const fromFile=move.isCastling==='kingside'?7:0,toFile=move.isCastling==='kingside'?5:3;next[from.r][toFile]={...next[from.r][fromFile],hasMoved:true};next[from.r][fromFile]=null;}
 return next;
}
function legalMoves(state,color=state.turn){
 const result=[];
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=state.board[r][c];if(!p||p.color!==color)continue;
  const view=color===state.turn?state:{...state,turn:color,enPassantTarget:null};
  for(const move of pseudoMoves(view,r,c))if(!isKingInCheck(applyBoard(state.board,move),color))result.push(move);
 }return result;
}
function getLegalMoves(state,color=state.turn){validate(state);return legalMoves(state,color);}
function getLegalMovesForSquare(state,r,c){return getLegalMoves(state).filter(m=>m.from.r===r&&m.from.c===c);}
function nextPosition(state,move){
 const cr=rights(state),color=move.piece.color;if(move.piece.type==='k')cr[color]={k:false,q:false};
 const revoke=(owner,r,c)=>{if(r===(owner==='w'?7:0)){if(c===0)cr[owner].q=false;if(c===7)cr[owner].k=false;}};
 if(move.piece.type==='r')revoke(color,move.from.r,move.from.c);
 if(move.captured&&move.captured.type==='r')revoke(move.captured.color,move.to.r,move.to.c);
 return{board:applyBoard(state.board,move),turn:opposite(state.turn),castlingRights:cr,
  enPassantTarget:move.piece.type==='p'&&Math.abs(move.to.r-move.from.r)===2?{r:(move.from.r+move.to.r)/2,c:move.from.c}:null,
  halfmoveClock:move.piece.type==='p'||move.captured?0:(state.halfmoveClock||0)+1,
  fullmoveNumber:(state.fullmoveNumber||1)+(state.turn==='b'?1:0)};
}
function positionKey(state){
 let placement='';for(const row of state.board)for(const p of row)placement+=p?(p.color==='w'?p.type.toUpperCase():p.type):'.';
 const cr=rights(state),castling=(cr.w.k?'K':'')+(cr.w.q?'Q':'')+(cr.b.k?'k':'')+(cr.b.q?'q':'');
 const ep=state.enPassantTarget&&legalMoves(state).some(m=>m.isEnPassant)?square(state.enPassantTarget.r,state.enPassantTarget.c):'-';
 return placement+' '+state.turn+' '+(castling||'-')+' '+ep;
}
function baseInitial(){
 const board=Array.from({length:8},()=>Array(8).fill(null)),back=['r','n','b','q','k','b','n','r'];
 for(let c=0;c<8;c++){board[0][c]={type:back[c],color:'b',hasMoved:false};board[1][c]={type:'p',color:'b',hasMoved:false};board[6][c]={type:'p',color:'w',hasMoved:false};board[7][c]={type:back[c],color:'w',hasMoved:false};}
 return{board,turn:'w',castlingRights:{w:{k:true,q:true},b:{k:true,q:true}},enPassantTarget:null,halfmoveClock:0,fullmoveNumber:1};
}
function sameMove(a,b){return a&&b&&a.from&&b.from&&a.to&&b.to&&a.from.r===b.from.r&&a.from.c===b.from.c&&a.to.r===b.to.r&&a.to.c===b.to.c&&(a.promotion||'')===(b.promotion||'');}
function resolveMove(state,request){const move=legalMoves(state).find(m=>sameMove(m,request));if(!move)throw Error('Illegal move, wrong turn, or missing/invalid promotion choice.');return move;}
function timeline(state){
 const current=positionKey(state);
 if(Array.isArray(state.positionKeys)&&state.positionKeys.length&&state.positionKeys[state.positionKeys.length-1]===current)return{keys:[...state.positionKeys],complete:state.repetitionHistoryComplete!==false};
 if(Array.isArray(state.history)){try{let replay=baseInitial();const keys=[positionKey(replay)];for(const requested of state.history){replay=nextPosition(replay,resolveMove(replay,requested));keys.push(positionKey(replay));}if(positionKey(replay)===current)return{keys,complete:true};}catch(error){}}
 return{keys:[current],complete:false};
}
function isKnownDeadPosition(board){
 const pieces=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.type!=='k')pieces.push({...p,r,c});}
 if(!pieces.length)return true;if(pieces.length===1&&['b','n'].includes(pieces[0].type))return true;
 return pieces.every(p=>p.type==='b')&&pieces.every(p=>(p.r+p.c)%2===(pieces[0].r+pieces[0].c)%2);
}
function statusOf(state,keys){
 const check=isKingInCheck(state.board,state.turn),moves=legalMoves(state),mate=check&&!moves.length,stalemate=!check&&!moves.length;
 const occurrences=keys.filter(k=>k===positionKey(state)).length;let reason=null;
 if(!mate){if(stalemate)reason='stalemate';else if(isKnownDeadPosition(state.board))reason='dead-position';else if(occurrences>=5)reason='fivefold-repetition';else if((state.halfmoveClock||0)>=150)reason='seventy-five-move-rule';}
 return{isCheck:check,isCheckmate:mate,isStalemate:stalemate,isDraw:Boolean(reason),drawReason:reason,isGameOver:mate||Boolean(reason),winner:mate?opposite(state.turn):null,result:mate?(state.turn==='w'?'0-1':'1-0'):reason?'1/2-1/2':'*',repetitionCount:occurrences,canClaimThreefold:!mate&&!reason&&occurrences>=3,canClaimFiftyMove:!mate&&!reason&&(state.halfmoveClock||0)>=100};
}
function getGameStatus(state){validate(state);if(state.termination==='claimed-draw'||state.termination==='agreed-draw')return{...statusOf(state,timeline(state).keys),isDraw:true,isGameOver:true,drawReason:state.drawReason,result:'1/2-1/2',winner:null};return statusOf(state,timeline(state).keys);}
function createInitialState(){const state={...baseInitial(),history:[],capturedByWhite:[],capturedByBlack:[],repetitionHistoryComplete:true};state.positionKeys=[positionKey(state)];return{...state,...statusOf(state,state.positionKeys)};}
function makeMove(state,request){
 validate(state);if(getGameStatus(state).isGameOver)throw Error('The game has already ended.');
 const move=resolveMove(state,request),previous=timeline(state),next=nextPosition(state,move),white=[...(state.capturedByWhite||[])],black=[...(state.capturedByBlack||[])];
 if(move.captured)(move.piece.color==='w'?white:black).push({...move.captured});
 const keys=[...previous.keys,positionKey(next)];return{...next,history:[...(state.history||[]),move],capturedByWhite:white,capturedByBlack:black,positionKeys:keys,repetitionHistoryComplete:previous.complete,...statusOf(next,keys)};
}
function canClaimDraw(state,intendedMove=null){
 validate(state);if(getGameStatus(state).isGameOver)return{threefold:false,fiftyMove:false,canClaim:false};
 const previous=timeline(state);let candidate=state,keys=previous.keys;
 if(intendedMove){candidate=nextPosition(state,resolveMove(state,intendedMove));keys=[...keys,positionKey(candidate)];}
 const count=keys.filter(k=>k===positionKey(candidate)).length,threefold=count>=3,fiftyMove=(candidate.halfmoveClock||0)>=100;
 return{threefold,fiftyMove,canClaim:threefold||fiftyMove};
}
function claimDraw(state,reason='auto',intendedMove=null){
 const allowed=canClaimDraw(state,intendedMove),selected=reason==='auto'?(allowed.threefold?'threefold-repetition':'fifty-move-rule'):reason;
 if(!(selected==='threefold-repetition'&&allowed.threefold)&&!(selected==='fifty-move-rule'&&allowed.fiftyMove))throw Error('Draw claim is not valid.');
 return{...state,board:cloneBoard(state.board),isDraw:true,isGameOver:true,drawReason:selected,termination:'claimed-draw',winner:null,result:'1/2-1/2',canClaimThreefold:false,canClaimFiftyMove:false};
}
function agreeDraw(state,consent){
 if(getGameStatus(state).isGameOver)throw Error('The game has already ended.');
 if(!consent||consent.w!==true||consent.b!==true||(state.history||[]).length<2)throw Error('Both players must consent after each has made a move.');
 return{...state,board:cloneBoard(state.board),isDraw:true,isGameOver:true,termination:'agreed-draw',drawReason:'agreement',winner:null,result:'1/2-1/2',canClaimThreefold:false,canClaimFiftyMove:false};
}
function fromFEN(fen){
 const fields=String(fen).trim().split(/\s+/);if(fields.length!==6)throw Error('FEN requires six fields.');
 const [placement,turn,castling,ep,half,full]=fields,ranks=placement.split('/');
 if(ranks.length!==8||!/^(?:-|K?Q?k?q?)$/.test(castling)||!castling)throw Error('Invalid FEN.');
 const board=ranks.map(rank=>{const row=[];for(const char of rank){if(/^[1-8]$/.test(char))row.push(...Array(Number(char)).fill(null));else{const type=char.toLowerCase();if(!TYPES.includes(type))throw Error('Invalid FEN piece.');row.push({type,color:char===char.toUpperCase()?'w':'b',hasMoved:true});}}if(row.length!==8)throw Error('Invalid FEN rank.');return row;});
 const cr={w:{k:castling.includes('K'),q:castling.includes('Q')},b:{k:castling.includes('k'),q:castling.includes('q')}};
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.type==='p')p.hasMoved=r!==(p.color==='w'?6:1);}
 for(const color of ['w','b']){const r=color==='w'?7:0;if(cr[color].k||cr[color].q){const k=board[r][4];if(!k||k.type!=='k'||k.color!==color)throw Error('Invalid castling king.');k.hasMoved=false;}
  for(const side of ['k','q'])if(cr[color][side]){const rook=board[r][side==='k'?7:0];if(!rook||rook.type!=='r'||rook.color!==color)throw Error('Invalid castling rook.');rook.hasMoved=false;}}
 if(!/^\d+$/.test(half)||!/^\d+$/.test(full))throw Error('Invalid FEN counters.');if(ep!=='-'&&!/^[a-h][36]$/.test(ep))throw Error('Invalid FEN en passant.');
 const state={board,turn,castlingRights:cr,enPassantTarget:ep==='-'?null:{r:8-Number(ep[1]),c:ep.charCodeAt(0)-97},halfmoveClock:Number(half),fullmoveNumber:Number(full),history:[],capturedByWhite:[],capturedByBlack:[],repetitionHistoryComplete:false};
 validate(state);if(isKingInCheck(board,opposite(turn)))throw Error('The side that just moved left its king in check.');
 if(state.enPassantTarget){const dir=turn==='w'?-1:1,pr=state.enPassantTarget.r-dir,p=board[pr][state.enPassantTarget.c];if(!p||p.type!=='p'||p.color!==opposite(turn))throw Error('Missing en passant pawn.');}
 state.positionKeys=[positionKey(state)];return{...state,...statusOf(state,state.positionKeys)};
}
function toFEN(state){
 validate(state);const rows=state.board.map(row=>{let out='',empty=0;for(const p of row){if(!p)empty++;else{if(empty)out+=empty;empty=0;out+=p.color==='w'?p.type.toUpperCase():p.type;}}if(empty)out+=empty;return out;});
 const cr=rights(state),castling=(cr.w.k?'K':'')+(cr.w.q?'Q':'')+(cr.b.k?'k':'')+(cr.b.q?'q':''),ep=state.enPassantTarget;
 return rows.join('/')+' '+state.turn+' '+(castling||'-')+' '+(ep?square(ep.r,ep.c):'-')+' '+(state.halfmoveClock||0)+' '+(state.fullmoveNumber||1);
}
function perft(state,depth){validate(state);if(!Number.isInteger(depth)||depth<0)throw Error('Invalid perft depth.');const walk=(s,d)=>d===0?1:legalMoves(s).reduce((sum,m)=>sum+walk(nextPosition(s,m),d-1),0);return walk(state,depth);}

// ======================================================================
// Custom AI: timed iterative deepening, alpha-beta, quiescence and cache.
// No external engine, network access, neural weights, or opening database.
// ======================================================================
const AI_MATE=100000,AI_INF=1000000,AI_MAX_PLY=64;
let lastAiStats={};
function aiId(m){return m?square(m.from.r,m.from.c)+square(m.to.r,m.to.c)+(m.promotion||''):'';}
function aiAttackMaps(board){
 const maps={w:new Uint8Array(64),b:new Uint8Array(64)},mobility={w:0,b:0};
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=board[r][c];if(!p)continue;const map=maps[p.color];
  const mark=(nr,nc)=>{if(!inside(nr,nc))return;map[nr*8+nc]++;const dest=board[nr][nc];if(!dest||dest.color!==p.color)mobility[p.color]+=p.type==='q'?1:3;};
  if(p.type==='p'){const dir=p.color==='w'?-1:1;for(const dc of [-1,1])if(inside(r+dir,c+dc))map[(r+dir)*8+c+dc]++;}
  else if(p.type==='n'){for(const [dr,dc]of KNIGHT)mark(r+dr,c+dc);}
  else if(p.type==='k'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inside(r+dr,c+dc))map[(r+dr)*8+c+dc]++;}
  else {const dirs=p.type==='b'?DIAG:p.type==='r'?ORTH:[...DIAG,...ORTH];for(const [dr,dc]of dirs){let nr=r+dr,nc=c+dc;while(inside(nr,nc)){mark(nr,nc);if(board[nr][nc])break;nr+=dr;nc+=dc;}}}
 }
 return{maps,mobility};
}
function aiEvaluate(state){
 const board=state.board,{maps,mobility}=aiAttackMaps(board);
 const files={w:new Int8Array(8),b:new Int8Array(8)},pawns={w:[],b:[]},bishops={w:new Set(),b:new Set()};
 const phases={p:0,n:1,b:1,r:2,q:4,k:0};let phase=0;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(!p)continue;phase+=phases[p.type];if(p.type==='p'){files[p.color][c]++;pawns[p.color].push({r,c});}if(p.type==='b')bishops[p.color].add((r+c)%2);}
 const mg=Math.min(24,phase)/24;let score=mobility.w-mobility.b;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=board[r][c];if(!p)continue;
  const color=p.color,enemy=opposite(color),sign=color==='w'?1:-1;
  const row=color==='w'?r:7-r,center=7-Math.abs(r-3.5)-Math.abs(c-3.5);
  let value=VALUES[p.type];
  if(p.type==='p'){
   const advance=Math.max(0,6-row);value+=advance*5+center*3;
   if(files[color][c]>1)value-=12;
   if(!(c>0&&files[color][c-1])&&!(c<7&&files[color][c+1]))value-=10;
   const passed=!pawns[enemy].some(q=>Math.abs(q.c-c)<=1&&(color==='w'?q.r<r:q.r>r));
   if(passed)value+=(10+advance*advance*5)*(1.3-mg*.5);
   if(maps[color][r*8+c])value+=5;
  }else if(p.type==='n'){
   value+=center*11;if(r===0||r===7||c===0||c===7)value-=12;
   if(row===7&&mg>.65)value-=10;
  }else if(p.type==='b'){
   value+=center*5;if(row===7&&mg>.65)value-=8;
  }else if(p.type==='r'){
   if(!files[color][c])value+=files[enemy][c]?12:22;
   if(row===1)value+=18;
  }else if(p.type==='q'){
   value+=center*2;
   if(mg>.85&&row<6)value-=8;
  }else{
   let safety=0;
   if(row>=6&&(c<=2||c>=6))safety+=25;
   const dir=color==='w'?-1:1;
   for(const dc of [-1,0,1]){
    if(inside(r+dir,c+dc)){const shield=board[r+dir][c+dc];if(shield&&shield.color===color&&shield.type==='p')safety+=9;}
   }
   for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(inside(r+dr,c+dc))safety-=maps[enemy][(r+dr)*8+c+dc]*6;
   value+=safety*mg+center*12*(1-mg);
  }
  if(p.type!=='k'&&maps[enemy][r*8+c]&&!maps[color][r*8+c])value-=Math.min(40,VALUES[p.type]*.07);
  score+=sign*value;
 }
 if(bishops.w.size===2)score+=28;if(bishops.b.size===2)score-=28;
 return Math.round(score);
}
function aiRelative(s){return aiEvaluate(s)*(s.turn==='w'?1:-1);}
function aiTick(ctx){
 ctx.nodes++;
 if(ctx.nodes>ctx.nodeLimit||performance.now()>=ctx.deadline)throw ctx.stop;
}
function aiOrdered(moves,ctx,ply,preferred=''){
 const killers=ctx.killers[ply]||[];
 const rank=m=>{
  const id=aiId(m);if(id===preferred)return 10000000;
  let score=0;
  if(m.captured)score+=1000000+10*VALUES[m.captured.type]-VALUES[m.piece.type];
  if(m.promotion)score+=800000+VALUES[m.promotion];
  if(!m.captured&&!m.promotion){if(id===killers[0])score+=600000;else if(id===killers[1])score+=500000;score+=ctx.history.get(m.piece.color+id)||0;}
  if(m.isCastling)score+=500;return score;
 };
 return moves.map(move=>({move,rank:rank(move)})).sort((a,b)=>b.rank-a.rank).map(x=>x.move);
}
// Restore repetition state even when an exception aborts the search.
function aiWithChild(ctx,parent,move,fn){
 const child=nextPosition(parent,move),saved=ctx.counts;
 if(child.halfmoveClock===0)ctx.counts=new Map();
 const key=positionKey(child),old=ctx.counts.get(key)||0;
 ctx.counts.set(key,old+1);
 try{return fn(child,key);}finally{
  if(old)ctx.counts.set(key,old);else ctx.counts.delete(key);
  ctx.counts=saved;
 }
}
function aiTerminal(s,moves,key,ctx,ply){
 if(!moves.length)return isKingInCheck(s.board,s.turn)?-AI_MATE+ply:0;
 if((ctx.counts.get(key)||0)>=5||s.halfmoveClock>=150||isKnownDeadPosition(s.board))return 0;
 return null;
}
function aiClaimable(s,key,ctx){return (ctx.counts.get(key)||0)>=3||s.halfmoveClock>=100;}
// A score cache key includes the reversible-history multiset as well as
// halfmove count: board-only cached draw scores can be history-dependent.
function aiCacheKey(s,key,ctx){
 return key+'|'+s.halfmoveClock+'|'+JSON.stringify([...ctx.counts.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
}
function aiStoreScore(value,ply){return value>AI_MATE-AI_MAX_PLY?value+ply:value<-AI_MATE+AI_MAX_PLY?value-ply:value;}
function aiLoadScore(value,ply){return value>AI_MATE-AI_MAX_PLY?value-ply:value<-AI_MATE+AI_MAX_PLY?value+ply:value;}
function aiQuiescence(s,alpha,beta,ply,remaining,key,ctx){
 aiTick(ctx);ctx.qnodes++;
 const moves=legalMoves(s),terminal=aiTerminal(s,moves,key,ctx,ply);
 if(terminal!==null)return terminal;
 // Do not fabricate a static score while in check at an extreme safety cap.
 if(ply>=AI_MAX_PLY)throw ctx.stop;
 const checked=isKingInCheck(s.board,s.turn),claim=aiClaimable(s,key,ctx);
 let best=claim?0:-AI_INF;
 if(claim){alpha=Math.max(alpha,0);if(alpha>=beta)return 0;}
 if(!checked){
  const stand=aiRelative(s);best=Math.max(best,stand);
  if(best>=beta)return best;alpha=Math.max(alpha,best);
  if(remaining<=0)return best;
 }
 const tactical=checked?moves:moves.filter(m=>m.captured||m.promotion);
 for(const move of aiOrdered(tactical,ctx,ply)){
  const value=aiWithChild(ctx,s,move,(child,childKey)=>{
   // A player can also claim before executing an intended move.
   if(aiClaimable(child,childKey,ctx))best=Math.max(best,0);
   return -aiQuiescence(child,-beta,-alpha,ply+1,remaining-1,childKey,ctx);
  });
  best=Math.max(best,value);alpha=Math.max(alpha,best);if(alpha>=beta)break;
 }
 return best;
}
function aiSearch(s,depth,alpha,beta,ply,key,ctx){
 if(depth<=0)return aiQuiescence(s,alpha,beta,ply,ctx.qDepth,key,ctx);
 aiTick(ctx);
 const moves=legalMoves(s),terminal=aiTerminal(s,moves,key,ctx,ply);
 if(terminal!==null)return terminal;if(ply>=AI_MAX_PLY)throw ctx.stop;
 const originalAlpha=alpha,originalBeta=beta;
 const cacheKey=ctx.useTT?aiCacheKey(s,key,ctx):'',entry=ctx.useTT?ctx.table.get(cacheKey):null;
 if(entry&&entry.depth>=depth){
  ctx.ttHits++;const value=aiLoadScore(entry.score,ply);
  if(entry.flag==='EXACT')return value;
  if(entry.flag==='LOWER')alpha=Math.max(alpha,value);else beta=Math.min(beta,value);
  if(alpha>=beta)return value;
 }
 let best=aiClaimable(s,key,ctx)?0:-AI_INF,bestId='';
 alpha=Math.max(alpha,best);
 if(alpha>=beta)return best;
 const preferred=entry?entry.best:(ctx.hashMoves.get(key)||'');
 for(const move of aiOrdered(moves,ctx,ply,preferred)){
  const value=aiWithChild(ctx,s,move,(child,childKey)=>{
   if(aiClaimable(child,childKey,ctx))best=Math.max(best,0);
   return -aiSearch(child,depth-1,-beta,-alpha,ply+1,childKey,ctx);
  });
  if(value>best){best=value;bestId=aiId(move);}
  alpha=Math.max(alpha,best);
  if(alpha>=beta){
   ctx.cutoffs++;
   if(!move.captured&&!move.promotion){const id=aiId(move),old=ctx.killers[ply]||[];ctx.killers[ply]=[id,old[0]===id?old[1]:old[0]];const h=move.piece.color+id;ctx.history.set(h,Math.min(30000,(ctx.history.get(h)||0)+depth*depth));}
   break;
  }
 }
 if(ctx.useTT){
  if(ctx.table.size>=ctx.tableLimit)ctx.table.delete(ctx.table.keys().next().value);
  ctx.table.set(cacheKey,{depth,score:aiStoreScore(best,ply),best:bestId,flag:best<=originalAlpha?'UPPER':best>=originalBeta?'LOWER':'EXACT'});
 }
 if(bestId){if(ctx.hashMoves.size>=16000)ctx.hashMoves.clear();ctx.hashMoves.set(key,bestId);}
 return best;
}
function findBestMove(state,difficulty=2,options={}){
 const start=performance.now(),status=getGameStatus(state);
 if(status.isGameOver){lastAiStats={completedDepth:0,nodes:0,reason:'game-over',elapsedMs:performance.now()-start};return null;}
 const level=Math.max(1,Math.min(4,Math.floor(Number(difficulty)||2)));
 const defaults={1:{time:100,depth:2,variety:20},2:{time:450,depth:5,variety:8},3:{time:1000,depth:7,variety:3},4:{time:1800,depth:10,variety:0}}[level];
 const bounded=(value,fallback,lo,hi)=>Number.isFinite(value)?Math.max(lo,Math.min(hi,value)):fallback;
 const time=bounded(options.timeMs,defaults.time,0,20000),maxDepth=Math.floor(bounded(options.maxDepth,defaults.depth,1,16));
 const ctx={deadline:start+time,nodes:0,qnodes:0,ttHits:0,cutoffs:0,
  nodeLimit:bounded(options.nodeLimit,Infinity,0,10000000),qDepth:8,
  useTT:options.useTT!==false,table:new Map(),tableLimit:2048,hashMoves:new Map(),
  history:new Map(),killers:[],counts:new Map(),stop:{}};
 const originalKeys=timeline(state).keys;
 const relevant=originalKeys.slice(-((state.halfmoveClock||0)+1));
 for(const key of relevant)ctx.counts.set(key,(ctx.counts.get(key)||0)+1);
 const rootKey=positionKey(state),moves=legalMoves(state);
 // Evaluate EVERY root candidate before relying on a time-interruptible search.
 // The fallback includes immediate terminal results, not capture ordering alone.
 let results=moves.map(move=>({move,score:aiWithChild(ctx,state,move,(child,key)=>{
  const terminal=aiTerminal(child,legalMoves(child),key,ctx,1);
  return terminal===null?-aiRelative(child):-terminal;
 })})).sort((a,b)=>b.score-a.score);
 let chosen=results[0].move,completedDepth=0,completed=results,interrupted=false;
 try{
  for(let depth=1;depth<=maxDepth;depth++){
   const iteration=[];
   for(const {move}of results){
    if(performance.now()>=ctx.deadline||ctx.nodes>=ctx.nodeLimit)throw ctx.stop;
    const score=aiWithChild(ctx,state,move,(child,key)=>-aiSearch(child,depth-1,-AI_INF,AI_INF,1,key,ctx));
    iteration.push({move,score});
   }
   iteration.sort((a,b)=>b.score-a.score);results=iteration;completed=iteration;
   chosen=iteration[0].move;completedDepth=depth;
   if(iteration[0].score>AI_MATE-AI_MAX_PLY)break;
  }
 }catch(error){if(error!==ctx.stop)throw error;interrupted=true;}
 const variety=bounded(options.varietyCp,defaults.variety,0,100);
 if(completedDepth>0&&variety>0&&Math.abs(completed[0].score)<AI_MATE-AI_MAX_PLY){
  const candidates=completed.filter(x=>completed[0].score-x.score<=variety);
  chosen=candidates[Math.floor(Math.random()*candidates.length)].move;
 }
 const selected=completed.find(x=>aiId(x.move)===aiId(chosen));
 lastAiStats={level,completedDepth,nodes:ctx.nodes,quiescenceNodes:ctx.qnodes,ttHits:ctx.ttHits,
  cutoffs:ctx.cutoffs,tableEntries:ctx.table.size,elapsedMs:Math.round(performance.now()-start),
  targetTimeMs:time,interrupted,usedFallback:completedDepth===0,
  bestScoreCp:completed[0].score,selectedScoreCp:selected.score,scorePerspective:state.turn,
  move:aiId(chosen),claimAvailable:status.canClaimThreefold||status.canClaimFiftyMove,
  claimRecommended:(status.canClaimThreefold||status.canClaimFiftyMove)&&completed[0].score<=0,
  repetitionHistoryComplete:timeline(state).complete};
 return chosen;
}
function getAiStats(){return {...lastAiStats};}
// Existing public functions remain available. Extra APIs are optional.
global.ChessEngine={createInitialState,getLegalMoves,getLegalMovesForSquare,makeMove,findKing,findBestMove,
 getGameStatus,canClaimDraw,claimDraw,agreeDraw,positionKey,isKingInCheck,isSquareAttacked,
 isKnownDeadPosition,validateState:validate,fromFEN,toFEN,perft,getAiStats,
 evaluatePosition:state=>{validate(state);return aiEvaluate(state);}};
})(window);
