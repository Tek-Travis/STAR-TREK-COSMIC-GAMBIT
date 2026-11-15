/*
 * Cosmic Gambit Stockfish adapter.
 * Requires ChessEngine and matching Stockfish.js browser assets.
 *
 * Difficulty uses Stockfish-evaluated candidate moves.
 * No Math.random() or random legal-move substitutions.
 *
 * Target Elo values are uncalibrated design labels.
 * engineElo is null because built-in Elo limiting is not used.
 *
 * Stockfish license/source:
 * https://github.com/nmrugg/stockfish.js
 */
(function(global){
'use strict';

const scriptBase=document.currentScript
 ?document.currentScript.src
 :document.baseURI;

const PROFILES=Object.freeze({
 1:Object.freeze({
  name:'Cadet',
  targetElo:333,
  engineElo:null,
  skill:20,
  depth:12,
  timeMs:1000,
  multiPV:8,
  preferredLossCp:120,
  maximumLossCp:180
 }),

 2:Object.freeze({
  name:'Commander',
  targetElo:666,
  engineElo:null,
  skill:20,
  depth:16,
  timeMs:1500,
  multiPV:8,
  preferredLossCp:60,
  maximumLossCp:90
 }),

 3:Object.freeze({
  name:'Admiral',
  targetElo:999,
  engineElo:null,
  skill:20,
  depth:20,
  timeMs:2000,
  multiPV:8,
  preferredLossCp:20,
  maximumLossCp:35
 })
});

// Fixed pattern, not a probability.
// Some turns favor the best move; others allow evaluated inaccuracies.
const QUALITY_PATTERN=Object.freeze([0,1,0,1.25,0.5]);

const moveId=move=>
 String.fromCharCode(97+move.from.c)+(8-move.from.r)+
 String.fromCharCode(97+move.to.c)+(8-move.to.r)+
 (move.promotion||'');

function abortError(){
 const error=new Error('Stockfish request cancelled.');
 error.name='AbortError';
 return error;
}

class StockfishAI{
 constructor(options={}){
  this.engine=options.chessEngine||global.ChessEngine;

  this.workerUrl=new URL(
   options.workerUrl||
    './engines/stockfish-19-lite-single.js',
   scriptBase
  ).href;

  this.worker=null;
  this.readyPromise=null;
  this.waiter=null;

  this.generation=0;
  this.busy=false;
  this.ready=false;
  this.lastStats=null;

  this.options=new Map();
  this.analysisFrames=null;

  this.onLog=typeof options.onLog==='function'
   ?options.onLog
   :null;
 }

 _send(text){
  if(!this.worker){
   throw Error('Stockfish worker is not running.');
  }

  this.worker.postMessage(text);
 }

 _wait(test,ms){
  if(this.waiter){
   throw Error('Overlapping Stockfish protocol requests.');
  }

  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    if(this.waiter&&this.waiter.timer===timer){
     this.waiter=null;
     reject(Error('Stockfish response timed out.'));
    }
   },ms);

   this.waiter={test,resolve,reject,timer};
  });
 }

 _recordAnalysis(line){
  if(!this.analysisFrames||!line.startsWith('info ')){
   return;
  }

  // Ignore bounds rather than treating them as exact evaluations.
  if(/\b(?:lowerbound|upperbound)\b/.test(line)){
   return;
  }

  const depth=line.match(/\bdepth (\d+)/);
  const rank=line.match(/\bmultipv (\d+)/);
  const score=line.match(/\bscore (cp|mate) (-?\d+)/);
  const pv=line.match(
   /\bpv ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/
  );

  if(!depth||!score||!pv){
   return;
  }

  const candidate={
   depth:Number(depth[1]),
   rank:rank?Number(rank[1]):1,
   type:score[1],
   score:Number(score[2]),
   move:pv[1]
  };

  let frame=this.analysisFrames.get(candidate.depth);

  if(!frame){
   frame=new Map();
   this.analysisFrames.set(candidate.depth,frame);
  }

  frame.set(candidate.rank,candidate);
 }

 _line(line){
  if(this.onLog){
   try{
    this.onLog(line);
   }catch(error){
    console.warn(error);
   }
  }

  if(line.startsWith('option name ')){
   const match=line.match(/^option name (.+?) type /);

   if(match){
    this.options.set(match[1],line);
   }
  }

  if(/CRITICAL ERROR|Aborted\(|RuntimeError/.test(line)){
   this._reset(Error(line));
   return;
  }

  this._recordAnalysis(line);

  const waiter=this.waiter;

  if(waiter&&waiter.test(line)){
   clearTimeout(waiter.timer);
   this.waiter=null;
   waiter.resolve(line);
  }
 }

 _reset(reason){
  this.generation++;
  this.ready=false;
  this.busy=false;
  this.readyPromise=null;
  this.analysisFrames=null;

  if(this.worker){
   this.worker.terminate();
   this.worker=null;
  }

  if(this.waiter){
   const waiter=this.waiter;
   this.waiter=null;

   clearTimeout(waiter.timer);
   waiter.reject(reason);
  }
 }

 cancel(){
  this._reset(abortError());
 }

 newGame(){
  this.cancel();
 }

 dispose(){
  this.cancel();
 }

 _option(name,value){
  if(this.options.has(name)){
   this._send(
    'setoption name '+name+' value '+value
   );
  }
 }

 async init(){
  if(this.ready)return;
  if(this.readyPromise)return this.readyPromise;

  if(!/^https?:$/.test(location.protocol)){
   throw Error(
    'Serve the game over HTTP/HTTPS, not file://.'
   );
  }

  if(
   !this.engine||
   typeof this.engine.toFEN!=='function'||
   typeof this.engine.getLegalMoves!=='function'
  ){
   throw Error('Load chess.js before stockfish-ai.js.');
  }

  const token=this.generation;

  const task=(async()=>{
   this.options.clear();

   const worker=new Worker(this.workerUrl);
   this.worker=worker;

   worker.onmessage=event=>{
    if(this.worker!==worker)return;

    for(const line of String(event.data).split(/\r?\n/)){
     if(this.worker!==worker)break;
     this._line(line.trim());
    }
   };

   worker.onerror=event=>{
    if(this.worker===worker){
     this._reset(Error(
      'Stockfish worker failed: '+
      (event.message||'Check engine files and server.')
     ));
    }
   };

   worker.onmessageerror=()=>{
    if(this.worker===worker){
     this._reset(Error(
      'Cannot decode Stockfish worker response.'
     ));
    }
   };

   let response=this._wait(
    line=>line==='uciok',
    30000
   );

   this._send('uci');
   await response;

   if(token!==this.generation)throw abortError();

   if(
    !this.options.has('Skill Level')||
    !this.options.has('MultiPV')
   ){
    throw Error(
     'Stockfish must support Skill Level and MultiPV.'
    );
   }

   this._option('Hash',16);
   this._option('Threads',1);
   this._option('Ponder','false');
   this._option('UCI_Chess960','false');
   this._option('UCI_LimitStrength','false');
   this._option('Skill Level',20);

   this._send('ucinewgame');

   response=this._wait(
    line=>line==='readyok',
    30000
   );

   this._send('isready');
   await response;

   if(token!==this.generation)throw abortError();

   this.ready=true;
  })();

  this.readyPromise=task;

  try{
   await task;
  }catch(error){
   if(token===this.generation){
    this._reset(error);
   }

   throw error;
  }
 }

 _position(state){
  const E=this.engine;
  const fen=E.toFEN(state);

  // Preserve move history when replay verifies the current position.
  if(
   Array.isArray(state.history)&&
   state.history.length&&
   typeof E.createInitialState==='function'&&
   typeof E.makeMove==='function'
  ){
   try{
    let replay=E.createInitialState();
    const ids=[];

    for(const move of state.history){
     ids.push(moveId(move));
     replay=E.makeMove(replay,move);
    }

    if(E.toFEN(replay)===fen){
     return 'position startpos moves '+ids.join(' ');
    }
   }catch(error){
    // Imported positions may not originate at startpos.
   }
  }

  return 'position fen '+fen;
 }

 _getCandidates(expectedCount,legalById){
  if(!this.analysisFrames)return [];

  const depths=[...this.analysisFrames.keys()]
   .sort((a,b)=>b-a);

  // Use a complete set of candidates from one common depth.
  for(const depth of depths){
   const frame=this.analysisFrames.get(depth);
   const candidates=[];
   const seen=new Set();

   for(let rank=1;rank<=expectedCount;rank++){
    const candidate=frame.get(rank);

    if(
     !candidate||
     !legalById.has(candidate.move)||
     seen.has(candidate.move)
    ){
     break;
    }

    candidates.push(candidate);
    seen.add(candidate.move);
   }

   if(candidates.length===expectedCount){
    return candidates;
   }
  }

  return [];
 }

 _selectCandidate(candidates,profile,state){
  if(!candidates.length)return null;

  const best=candidates[0];

  // Preserve the leading line in mate-score positions.
  if(best.type!=='cp'){
   return {
    candidate:best,
    lossCp:null,
    desiredLossCp:0
   };
  }

  const ownMoveCount=(state.history||[]).filter(
   move=>move&&move.piece&&
    move.piece.color===state.turn
  ).length;

  const factor=QUALITY_PATTERN[
   ownMoveCount%QUALITY_PATTERN.length
  ];

  const desiredLossCp=Math.min(
   profile.maximumLossCp,
   Math.round(profile.preferredLossCp*factor)
  );

  const choices=candidates
   .filter(candidate=>candidate.type==='cp')
   .map(candidate=>({
    candidate,
    lossCp:Math.max(0,best.score-candidate.score)
   }))
   .filter(choice=>
    choice.lossCp<=profile.maximumLossCp
   );

  choices.sort((a,b)=>
   Math.abs(a.lossCp-desiredLossCp)-
    Math.abs(b.lossCp-desiredLossCp)||
   a.lossCp-b.lossCp||
   a.candidate.rank-b.candidate.rank
  );

  return {
   ...choices[0],
   desiredLossCp
  };
 }

 async findBestMove(state,difficulty=2){
  if(this.busy){
   throw Error('A Stockfish move request is already active.');
  }

  const E=this.engine;

  if(!E)throw Error('ChessEngine is missing.');

  const snapshot=JSON.parse(JSON.stringify(state));

  if(
   typeof E.getGameStatus==='function'&&
   E.getGameStatus(snapshot).isGameOver
  ){
   return null;
  }

  const legal=E.getLegalMoves(snapshot);

  if(!legal.length)return null;

  const level=[1,2,3].includes(Number(difficulty))
   ?Number(difficulty)
   :2;

  const profile=PROFILES[level];
  const token=this.generation;
  const start=performance.now();

  const legalById=new Map(
   legal.map(move=>[moveId(move),move])
  );

  this.busy=true;

  try{
   await this.init();

   if(token!==this.generation)throw abortError();

   const multiPV=Math.min(
    profile.multiPV,
    legal.length
   );

   this._option('UCI_LimitStrength','false');
   this._option('Skill Level',20);
   this._option('MultiPV',multiPV);

   let response=this._wait(
    line=>line==='readyok',
    10000
   );

   this._send('isready');
   await response;

   if(token!==this.generation)throw abortError();

   this.analysisFrames=new Map();

   this._send(this._position(snapshot));

   response=this._wait(
    line=>line.startsWith('bestmove '),
    profile.timeMs+15000
   );

   this._send(
    'go depth '+profile.depth+
    ' movetime '+profile.timeMs
   );

   const answer=await response;

   if(token!==this.generation)throw abortError();

   const id=answer.split(/\s+/)[1];

   if(!legalById.has(id)){
    throw Error(
     'Stockfish returned a move not accepted by the game: '+id
    );
   }

   const candidates=this._getCandidates(
    multiPV,
    legalById
   );

   const selection=this._selectCandidate(
    candidates,
    profile,
    snapshot
   );

   const selectedId=selection
    ?selection.candidate.move
    :id;

   const chosen=legalById.get(selectedId);

   this.lastStats={
    engine:'Stockfish',
    level,
    name:profile.name,

    targetElo:profile.targetElo,
    engineElo:null,
    calibrated:false,

    strengthMode:'evaluated-candidates',
    analysisSkill:20,

    depthLimit:profile.depth,
    timeLimitMs:profile.timeMs,
    multiPV,
    candidatesCompared:candidates.length,

    comparisonDepth:selection
     ?selection.candidate.depth
     :null,

    desiredLossCp:selection
     ?selection.desiredLossCp
     :null,

    estimatedLossCp:selection
     ?selection.lossCp
     :null,

    engineMove:id,
    move:selectedId,

    selectionSource:selection
     ?'Stockfish evaluated candidate'
     :'Stockfish bestmove',

    randomBranch:false,
    elapsedMs:Math.round(performance.now()-start)
   };

   return chosen;
  }catch(error){
   if(token===this.generation){
    this._reset(error);
   }

   throw error;
  }finally{
   if(token===this.generation){
    this.analysisFrames=null;
    this.busy=false;
   }
  }
 }

 getStats(){
  return this.lastStats?{...this.lastStats}:null;
 }
}

StockfishAI.profiles=PROFILES;
global.StockfishAI=StockfishAI;

})(window);