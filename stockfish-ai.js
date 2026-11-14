/* Cosmic Gambit Stockfish adapter. Original integration code.
 * Requires ChessEngine and the matching Stockfish.js browser assets.
 * Profiles are experimental targets, NOT calibrated Elo ratings.
 * Stockfish license/source: https://github.com/nmrugg/stockfish.js
 */
(function (global) {
'use strict';
const scriptBase = document.currentScript ? document.currentScript.src : document.baseURI;
const PROFILES = Object.freeze({
  1: Object.freeze({
    name: 'Cadet',
    targetElo: 600,
    engineElo: null,
    skill: 0,
    depth: 4,
    timeMs: 300,
    randomChance: 0.35
  }),

  2: Object.freeze({
    name: 'Commander',
    targetElo: 1200,
    engineElo: null,
    skill: 3,
    depth: 7,
    timeMs: 700,
    randomChance: 0.10
  }),

  3: Object.freeze({
    name: 'Admiral',
    targetElo: 1800,
    engineElo: 1800,
    skill: 20,
    depth: 64,
    timeMs: 1500,
    randomChance: 0
  })
});
const moveId = m => String.fromCharCode(97+m.from.c)+(8-m.from.r)+
  String.fromCharCode(97+m.to.c)+(8-m.to.r)+(m.promotion||'');
function abortError() { const e=new Error('Stockfish request cancelled.'); e.name='AbortError'; return e; }
class StockfishAI {
  constructor(options={}) {
    this.engine=options.chessEngine||global.ChessEngine;
    this.workerUrl=new URL(options.workerUrl||'./engines/stockfish-19-lite-single.js',scriptBase).href;
    this.worker=null; this.readyPromise=null; this.waiter=null;
    this.generation=0; this.busy=false; this.ready=false; this.lastStats=null;
    this.options=new Map(); this.onLog=typeof options.onLog==='function'?options.onLog:null;
  }
  _send(text) { if(!this.worker)throw Error('Stockfish worker is not running.'); this.worker.postMessage(text); }
  _wait(test,ms) {
    if(this.waiter)throw Error('Overlapping Stockfish protocol requests.');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{ if(this.waiter&&this.waiter.timer===timer){this.waiter=null;reject(Error('Stockfish response timed out.'));} },ms);
      this.waiter={test,resolve,reject,timer};
    });
  }
  _line(line) {
    if(this.onLog){try{this.onLog(line);}catch(e){console.warn(e);}}
    if(line.startsWith('option name ')) {
      const m=line.match(/^option name (.+?) type /); if(m)this.options.set(m[1],line);
    }
    if(/CRITICAL ERROR|Aborted\(|RuntimeError/.test(line)){this._reset(Error(line));return;}
    const w=this.waiter;
    if(w&&w.test(line)){clearTimeout(w.timer);this.waiter=null;w.resolve(line);}
  }
  _reset(reason) {
    this.generation++; this.ready=false; this.busy=false; this.readyPromise=null;
    if(this.worker){this.worker.terminate();this.worker=null;}
    if(this.waiter){const w=this.waiter;this.waiter=null;clearTimeout(w.timer);w.reject(reason);}
  }
  cancel() { this._reset(abortError()); }
  newGame() { this.cancel(); }
  dispose() { this.cancel(); }
  _option(name,value) {
    if(this.options.has(name))this._send('setoption name '+name+' value '+value);
  }
  async init() {
    if(this.ready)return;
    if(this.readyPromise)return this.readyPromise;
    if(!/^https?:$/.test(location.protocol))throw Error('Serve the game over HTTP/HTTPS, not file://.');
    if(!this.engine||typeof this.engine.toFEN!=='function'||typeof this.engine.getLegalMoves!=='function')throw Error('Load chess.js before stockfish-ai.js.');
    const token=this.generation;
    const task=(async()=>{
      this.options.clear();
      const worker=new Worker(this.workerUrl);this.worker=worker;
      worker.onmessage=e=>{if(this.worker!==worker)return;String(e.data).split(/\r?\n/).forEach(s=>this._line(s.trim()));};
      worker.onerror=e=>{if(this.worker===worker)this._reset(Error('Stockfish worker failed: '+(e.message||'check engine files and server')));};
      worker.onmessageerror=()=>{if(this.worker===worker)this._reset(Error('Cannot decode Stockfish worker response.'));};
      let response=this._wait(s=>s==='uciok',30000);this._send('uci');await response;
      if(token!==this.generation)throw abortError();
      this._option('Hash',16);this._option('Threads',1);this._option('Ponder','false');
      this._option('UCI_Chess960','false');this._option('UCI_LimitStrength','false');
      this._send('ucinewgame');response=this._wait(s=>s==='readyok',30000);this._send('isready');await response;
      if(token!==this.generation)throw abortError();
      this.ready=true;
    })();
    this.readyPromise=task;
    try{await task;}catch(e){if(token===this.generation)this._reset(e);throw e;}
  }
  _position(state) {
    const E=this.engine,fen=E.toFEN(state);
    // Only send startpos history after verifying it reproduces this position.
    if(Array.isArray(state.history)&&state.history.length&&typeof E.createInitialState==='function'&&typeof E.makeMove==='function'){
      try{
        let replay=E.createInitialState();const ids=[];
        for(const m of state.history){ids.push(moveId(m));replay=E.makeMove(replay,m);}
        if(E.toFEN(replay)===fen)return 'position startpos moves '+ids.join(' ');
      }catch(e){ /* Imported positions may not originate at startpos. */ }
    }
    return 'position fen '+fen;
  }
  async findBestMove(state,difficulty=2) {
    if(this.busy)throw Error('A Stockfish move request is already active.');
    const E=this.engine;
    if(!E)throw Error('ChessEngine is missing.');
    const snapshot=JSON.parse(JSON.stringify(state));
    if(typeof E.getGameStatus==='function'&&E.getGameStatus(snapshot).isGameOver)return null;
    const legal=E.getLegalMoves(snapshot);if(!legal.length)return null;
    const level=[1,2,3].includes(Number(difficulty))?Number(difficulty):2;
    const profile=PROFILES[level],token=this.generation,start=performance.now();
    this.busy=true;
    try{
      await this.init();if(token!==this.generation)throw abortError();
      this._option('UCI_LimitStrength','false');this._option('Skill Level',profile.skill);
      this._option('MultiPV',1);
      let response=this._wait(s=>s==='readyok',10000);this._send('isready');await response;
      if(token!==this.generation)throw abortError();
      this._send(this._position(snapshot));
      response=this._wait(s=>s.startsWith('bestmove '),Math.max(15000,profile.timeMs+10000));
      this._send('go depth '+profile.depth+' movetime '+profile.timeMs);
      const answer=await response;if(token!==this.generation)throw abortError();
      const id=answer.split(/\s+/)[1],engineMove=legal.find(m=>moveId(m)===id);
      if(!engineMove)throw Error('Stockfish returned a move not accepted by the game: '+id);
      // Beginner weakening: a tunable mixture, not a measured Elo model.
      const randomBranch=legal.length>1&&Math.random()<profile.randomChance;
      const chosen=randomBranch?legal[Math.floor(Math.random()*legal.length)]:engineMove;
      this.lastStats={engine:'Stockfish',level,name:profile.name,targetElo:profile.targetElo,
        calibrated:false,engineMove:id,move:moveId(chosen),randomBranch,
        elapsedMs:Math.round(performance.now()-start)};
      return chosen;
    }catch(e){if(token===this.generation)this._reset(e);throw e;}
    finally{if(token===this.generation)this.busy=false;}
  }
  getStats() {return this.lastStats?{...this.lastStats}:null;}
}
StockfishAI.profiles=PROFILES;
global.StockfishAI=StockfishAI;
})(window);
