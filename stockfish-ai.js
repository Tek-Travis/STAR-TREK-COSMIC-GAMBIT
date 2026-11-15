/*
 * Cosmic Gambit Stockfish adapter.
 * Requires ChessEngine and matching Stockfish.js browser assets.
 *
 * Difficulty uses Stockfish's native Skill Level.
 * Every played move comes directly from Stockfish's bestmove response.
 *
 * No custom candidate selection.
 * No random legal-move substitutions.
 * No claimed or calibrated Elo ratings.
 *
 * Stockfish's native low-skill mode includes probabilistic weakening.
 *
 * Stockfish license/source:
 * https://github.com/nmrugg/stockfish.js
 */
(function(global){
'use strict';

const scriptBase=document.currentScript
 ?document.currentScript.src
 :document.baseURI;

/*
 * Change difficulty settings here.
 *
 * skill:
 *   Native Stockfish strength control: 0 through 20.
 *   Higher values are stronger.
 *
 * depth:
 *   Search-depth ceiling.
 *
 * timeMs:
 *   Approximate maximum search time, not a mandatory delay.
 *
 * These profiles are experimental, not Elo-calibrated.
 */
const PROFILES=Object.freeze({
1: Object.freeze({
  name: 'Cadet',
  difficulty: 'Easy',
  skill: 0,
  depth: 1,
  timeMs: 100
}),

2: Object.freeze({
  name: 'Captain',
  difficulty: 'Medium',
  skill: 1,
  depth: 3,
  timeMs: 200
}),

3: Object.freeze({
  name: 'Admiral',
  difficulty: 'Hard',
  skill: 2,
  depth: 4,
  timeMs: 300
})

});

const ENGINE_CONFIG=Object.freeze({
 initialLevel:1,
 defaultLevel:2,
 hashMb:16,
 threads:1,
 multiPV:1,
 startupTimeoutMs:30000,
 readyTimeoutMs:10000,
 searchTimeoutPaddingMs:15000
});

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
  this.engineName=null;

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

 _wait(test,timeoutMs){
  if(this.waiter){
   throw Error('Overlapping Stockfish protocol requests.');
  }

  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    if(this.waiter&&this.waiter.timer===timer){
     this.waiter=null;

     reject(Error(
      'Stockfish response timed out.'
     ));
    }
   },timeoutMs);

   this.waiter={
    test,
    resolve,
    reject,
    timer
   };
  });
 }

 _line(line){
  if(this.onLog){
   try{
    this.onLog(line);
   }catch(error){
    console.warn(error);
   }
  }

  if(line.startsWith('id name ')){
   this.engineName=line.slice('id name '.length);
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
  if(!this.options.has(name)){
   return false;
  }

  this._send(
   'setoption name '+name+' value '+value
  );

  return true;
 }

 _validateProfile(profile){
  if(
   !Number.isInteger(profile.skill)||
   !Number.isInteger(profile.depth)||
   profile.depth<1||
   !Number.isInteger(profile.timeMs)||
   profile.timeMs<1
  ){
   throw Error(
    'Invalid difficulty profile: '+profile.name
   );
  }

  const specification=this.options.get('Skill Level');

  if(!specification){
   throw Error(
    'This Stockfish build does not expose Skill Level.'
   );
  }

  const minimum=specification.match(/\bmin (-?\d+)/);
  const maximum=specification.match(/\bmax (-?\d+)/);

  if(!minimum||!maximum){
   throw Error(
    'Cannot verify this engine build’s Skill Level range.'
   );
  }

  const minSkill=Number(minimum[1]);
  const maxSkill=Number(maximum[1]);

  if(
   profile.skill<minSkill||
   profile.skill>maxSkill
  ){
   throw Error(
    profile.name+' skill '+profile.skill+
    ' is outside this engine’s supported range: '+
    minSkill+' through '+maxSkill+'.'
   );
  }
 }

 _applyProfile(profile){
  this._validateProfile(profile);

  // Use native skill mode, not native Elo-limiting mode.
  this._option('UCI_LimitStrength','false');

  // Read the selected profile. No hidden skill override.
  this._option('Skill Level',profile.skill);

  // Request one displayed line. Stockfish manages its own
  // internal candidate analysis for low-skill play.
  this._option('MultiPV',ENGINE_CONFIG.multiPV);
 }

 async init(){
  if(this.ready){
   return;
  }

  if(this.readyPromise){
   return this.readyPromise;
  }

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
   throw Error(
    'Load chess.js before stockfish-ai.js.'
   );
  }

  const token=this.generation;

  const task=(async()=>{
   this.options.clear();
   this.engineName=null;

   const worker=new Worker(this.workerUrl);
   this.worker=worker;

   worker.onmessage=event=>{
    if(this.worker!==worker){
     return;
    }

    for(const line of String(event.data).split(/\r?\n/)){
     if(this.worker!==worker){
      break;
     }

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
    ENGINE_CONFIG.startupTimeoutMs
   );

   this._send('uci');
   await response;

   if(token!==this.generation){
    throw abortError();
   }

   if(!this.options.has('Skill Level')){
    throw Error(
     'This Stockfish build does not support native skill control.'
    );
   }

   for(const profile of Object.values(PROFILES)){
    this._validateProfile(profile);
   }

   this._option('Threads',ENGINE_CONFIG.threads);
   this._option('Hash',ENGINE_CONFIG.hashMb);
   this._option('Ponder','false');
   this._option('UCI_Chess960','false');

   this._applyProfile(
    PROFILES[ENGINE_CONFIG.initialLevel]
   );

   this._send('ucinewgame');

   response=this._wait(
    line=>line==='readyok',
    ENGINE_CONFIG.startupTimeoutMs
   );

   this._send('isready');
   await response;

   if(token!==this.generation){
    throw abortError();
   }

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

  // Preserve repetition history when replay verifies the position.
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

 async findBestMove(
  state,
  difficulty=ENGINE_CONFIG.defaultLevel
 ){
  if(this.busy){
   throw Error(
    'A Stockfish move request is already active.'
   );
  }

  const E=this.engine;

  if(!E){
   throw Error('ChessEngine is missing.');
  }

  const snapshot=JSON.parse(JSON.stringify(state));

  if(
   typeof E.getGameStatus==='function'&&
   E.getGameStatus(snapshot).isGameOver
  ){
   return null;
  }

  const legal=E.getLegalMoves(snapshot);

  if(!legal.length){
   return null;
  }

  const requestedLevel=Number(difficulty);

  const level=Object.prototype.hasOwnProperty.call(
   PROFILES,
   requestedLevel
  )
   ?requestedLevel
   :ENGINE_CONFIG.defaultLevel;

  const profile=PROFILES[level];
  const token=this.generation;
  const started=performance.now();

  const legalById=new Map(
   legal.map(move=>[moveId(move),move])
  );

  this.busy=true;

  try{
   await this.init();

   if(token!==this.generation){
    throw abortError();
   }

   this._applyProfile(profile);

   let response=this._wait(
    line=>line==='readyok',
    ENGINE_CONFIG.readyTimeoutMs
   );

   this._send('isready');
   await response;

   if(token!==this.generation){
    throw abortError();
   }

   this._send(this._position(snapshot));

   response=this._wait(
    line=>line.startsWith('bestmove '),
    profile.timeMs+ENGINE_CONFIG.searchTimeoutPaddingMs
   );

   const searchStarted=performance.now();

   this._send(
    'go depth '+profile.depth+
    ' movetime '+profile.timeMs
   );

   const answer=await response;

   if(token!==this.generation){
    throw abortError();
   }

   const id=answer.split(/\s+/)[1];
   const chosen=legalById.get(id);

   if(!chosen){
    throw Error(
     'Stockfish returned a move not accepted by the game: '+id
    );
   }

   // Play exactly the move returned by Stockfish.
   this.lastStats={
    engine:'Stockfish',
    engineName:this.engineName,

    level,
    name:profile.name,
    difficulty:profile.difficulty,

    strengthMode:'native-skill',
    skill:profile.skill,
    analysisSkill:profile.skill,

    eloLimitEnabled:false,
    engineElo:null,
    calibrated:false,

    depthLimit:profile.depth,
    timeLimitMs:profile.timeMs,
    requestedMultiPV:ENGINE_CONFIG.multiPV,

    engineMove:id,
    move:id,
    selectionSource:'Stockfish bestmove',

    randomBranch:false,
    nativeSkillWeakening:profile.skill<20,

    searchElapsedMs:Math.round(
     performance.now()-searchStarted
    ),

    elapsedMs:Math.round(
     performance.now()-started
    )
   };

   return chosen;
  }catch(error){
   if(token===this.generation){
    this._reset(error);
   }

   throw error;
  }finally{
   if(token===this.generation){
    this.busy=false;
   }
  }
 }

 getStats(){
  return this.lastStats
   ?{...this.lastStats}
   :null;
 }
}

StockfishAI.profiles=PROFILES;
global.StockfishAI=StockfishAI;

})(window);