/* Cosmic Gambit — PeerJS 1v1 add-on. Load after main.js. */
(function(g){
'use strict';
const PREFIX='cosmic-gambit-v1-', VERSION=1;
const P=g.CosmicArmadaApp&&g.CosmicArmadaApp.prototype;
if(!P){console.error('Load multiplayer.js after main.js');return;}
const original={};
for(const n of ['handleSquareClick','executeMove','triggerAiTurn','updateHUD','initGame','undoMove','loadFleet','saveFleet','setFleet','presentResult']) original[n]=P[n];
const active=a=>a.multiplayer&&a.multiplayer.active;
P.triggerAiTurn=function(){if(!active(this))return original.triggerAiTurn.apply(this,arguments);};
P.handleSquareClick=function(r,c){
 const m=this.multiplayer;if(!m||!m.active)return original.handleSquareClick.call(this,r,c);
 if(!m.playable()||this.controlsLocked()||this.ended())return;
 if(this.selectedSquare){const move=this.legalDestinations.find(x=>x.to.r===r&&x.to.c===c);
  if(move){if(move.piece.type==='p'&&(r===0||r===7)){this.pendingPromoMove=move;this.promoModal.style.display='flex';this.updateHUD();return;}this.executeMove(move);return;}}
 const piece=this.state.board[r][c];this.selectedSquare=piece&&piece.color===m.side?{r,c}:null;
 this.legalDestinations=this.selectedSquare?this.E.getLegalMovesForSquare(this.state,r,c):[];
 if(this.selectedSquare)this.audio('playCrispClick');this.renderBoard();
};
P.executeMove=function(move){const m=this.multiplayer;if(!m||!m.active)return original.executeMove.call(this,move);m.request(move);};
for(const n of ['initGame','undoMove','loadFleet','saveFleet'])P[n]=function(){if(active(this))return;return original[n].apply(this,arguments);};
P.setFleet=function(side,value){const m=this.multiplayer;if(m&&m.active&&!m.settingFleet){if(side!==m.side||m.locked)return;original.setFleet.call(this,side,value);m.send({t:'fleet',id:this.fleetIds[side]});return;}return original.setFleet.call(this,side,value);};
P.presentResult=function(){
 const m=this.multiplayer;if(!m||!m.active||!this.state.isCheckmate)return original.presentResult.call(this);
 const win=this.state.winner===m.side;
 this.audio(win?'playVictoryFanfare':'playDefeatMotif');
 if(win){document.getElementById('victory-score').textContent='You won by checkmate.';this.victoryModal.style.display='flex';}
 else{document.getElementById('game-over-title').textContent='CHECKMATE';document.getElementById('game-over-desc').textContent='Your friend won this match.';this.gameOverModal.style.display='flex';}
};
P.updateHUD=function(){
 original.updateHUD.call(this);const m=this.multiplayer;if(!m||!m.active)return;
 this.turnText.textContent=m.dead?'DISCONNECTED':!m.started?'CONNECTING...':m.locked?'SYNC / ANIMATION':this.ended()?'GAME COMPLETE':this.state.turn===m.side?'YOUR TURN':'FRIEND\'S TURN';
 this.turnText.title='1v1 — You are '+(m.side==='w'?'White':'Black');
 for(const el of [this.undoBtn,this.saveBtn,this.loadBtn,this.newGameBtn,...document.querySelectorAll('.ai-btn')])el.disabled=true;
 this.playerFleetSelector.disabled=m.side!=='w'||m.locked||m.dead;
 this.enemyFleetSelector.disabled=m.side!=='b'||m.locked||m.dead;
 for(const id of ['retry-action-btn','victory-action-btn']){const e=document.getElementById(id);if(e){e.disabled=true;e.title='Use Leave in the top bar to return to single-player.';}}
 m.checkFinished();
};
class Multiplayer{
 constructor(app){
 this.a=app;this.active=false;this.started=false;this.dead=false;this.locked=false;this.side=null;this.conn=null;this.peer=null;this.rev=0;this.code='';this.timer=null;this.finished=-1;this.localReady=false;this.remoteReady=false;this.pending=false;this.attempts=0;
 app.multiplayer=this;this.ui();this.register();
 }
 ui(){
 const style=document.createElement('style');style.textContent=`
 #hud-header{flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none}
 #hud-header::-webkit-scrollbar{display:none}
 #hud-header>.hud-group{flex-wrap:nowrap!important;flex-shrink:0}
 #cg-mp{display:inline-flex;align-items:center;gap:3px;flex:none;white-space:nowrap;font-size:clamp(8px,.8vw,10px)}
 #cg-mp-code{font-family:monospace;letter-spacing:.3px;user-select:text;-webkit-user-select:text}
 #cg-mp-input{box-sizing:border-box;width:49px;min-width:49px;height:18px;min-height:0;padding:0 3px;border:1px solid var(--ui-border);border-radius:3px;background:#25282d;color:white;font:11px monospace;touch-action:manipulation;user-select:text;-webkit-user-select:text}
 #cg-mp-button{height:20px;min-height:20px;white-space:nowrap}
 `;document.head.appendChild(style);
 const box=document.createElement('span');box.id='cg-mp';
 box.innerHTML='<span>Code:</span><span id="cg-mp-code">.....</span><input id="cg-mp-input" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="12345" aria-label="Join friend using five-digit code" title="Join Friend’s Game"><button id="cg-mp-button" type="button" class="hud-btn" disabled>Connect</button>';
 this.a.turnPill.insertAdjacentElement('afterend',box);this.box=box;this.label=box.querySelector('#cg-mp-code');this.input=box.querySelector('input');this.button=box.querySelector('button');
 this.input.addEventListener('input',()=>{this.input.value=this.input.value.replace(/\D/g,'').slice(0,5);});
 this.input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.button.click();}});
 this.button.onclick=()=>{if(this.active){if(confirm('Leave this match and return to single-player?'))this.leave();}else this.join();};
 this.status('Registering your invitation code...');
 }
 status(text){this.box.title=text;this.button.title=text;this.label.title=text;this.input.setAttribute('aria-description',text);console.info('[Multiplayer]',text);}
 register(){
 if(typeof g.Peer!=='function'){this.label.textContent='OFF';this.status('PeerJS did not load. Check the CDN script and reload.');return;}
 if(!/^https?:$/.test(location.protocol)){this.label.textContent='OFF';this.status('Open the game over HTTP/HTTPS, not file://.');return;}
 const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);this.code=String(10000+bytes[0]%90000);
 const peer=new g.Peer(PREFIX+this.code,g.COSMIC_PEER_OPTIONS||{});this.peer=peer;
 peer.on('open',()=>{if(this.peer!==peer)return;this.attempts=0;this.label.textContent=this.code;this.button.disabled=false;this.status('Ready. Share this code with one friend.');});
 peer.on('connection',c=>{if(this.active||!c.peer.startsWith(PREFIX)){c.on('open',()=>{c.send({t:'busy'});setTimeout(()=>c.close(),150);});return;}this.attach(c,'w');});
 peer.on('disconnected',()=>{if(this.peer!==peer)return;this.status('Signaling disconnected. Existing match may continue; new invitations unavailable.');if(!this.active)this.button.disabled=true;});
 peer.on('error',e=>{if(this.peer!==peer)return;
  if(e.type==='unavailable-id'&&!this.active&&this.attempts++<12){peer.destroy();this.register();return;}
  this.status(e.type==='peer-unavailable'?'Friend not found. Check their code and that their game is open.':'Connection error: '+e.type+'. '+e.message);
  if(this.active&&!this.started)this.fail('Could not connect. Use Leave to return to single-player.');
  if(!this.active)this.button.disabled=!peer.open;
 });
 }
 join(){const code=this.input.value;if(!/^\d{5}$/.test(code)){this.status('Enter your friend’s five-digit code.');this.input.focus();return;}if(code===this.code){this.status('That is your own code. Enter your friend’s code.');return;}if(!this.peer||!this.peer.open)return;this.attach(this.peer.connect(PREFIX+code,{reliable:true,serialization:'json'}),'b');}
 attach(c,side){
 this.conn=c;this.side=side;this.active=true;this.started=false;this.dead=false;this.locked=true;this.button.textContent='Leave';this.input.disabled=true;
 this.a.cancelPendingWork();this.a.pendingPromoMove=null;this.a.promoModal.style.display='none';this.a.selectedSquare=null;this.a.legalDestinations=[];this.a.renderBoard();this.a.updateHUD();
 this.status('Connecting to friend...');this.arm('Connection timed out.');
 c.on('open',()=>{if(this.conn!==c)return;if(side==='b')this.send({t:'hello',v:VERSION,fleet:this.a.fleetIds.b});});
 c.on('data',d=>{if(this.conn!==c||this.dead)return;try{this.receive(d);}catch(e){console.error(e);this.fail('Synchronization stopped: '+e.message);}});
 c.on('close',()=>{if(this.conn===c)this.fail('Friend disconnected. Match paused. Use Leave for single-player.');});
 c.on('error',e=>{if(this.conn===c)this.fail('Connection failed: '+e.message);});
 }
 arm(message){clearTimeout(this.timer);this.timer=setTimeout(()=>this.fail(message+' Use Leave and connect again.'),45000);}
 send(d){if(this.conn&&this.conn.open){this.conn.send(d);return true;}return false;}
 resetGame(){
 const a=this.a;original.initGame.call(a);a.startModal.style.display='none';a.pendingPromoMove=null;a.promoModal.style.display='none';
 this.started=true;this.rev=0;this.finished=-1;this.localReady=false;this.remoteReady=false;this.pending=false;this.locked=true;
 }
 fleets(ids){for(const s of ['w','b']){if(typeof ids[s]!=='string'||!Object.prototype.hasOwnProperty.call(this.a.F.fleets,ids[s]))throw Error('Unknown fleet');this.settingFleet=true;try{original.setFleet.call(this.a,s,ids[s]);}finally{this.settingFleet=false;}}this.a.renderBoard();}
 playable(){return this.started&&!this.dead&&!this.locked&&!this.pending&&this.a.state.turn===this.side;}
 request(move){if(!this.playable()||this.a.battleEngine.isBusy()||this.a.ended())return;
 const legal=this.a.E.getLegalMoves(this.a.state).find(x=>same(x,move));if(!legal)return;
 const req={from:legal.from,to:legal.to,promotion:legal.promotion||''};this.pending=true;
 if(this.side==='w')this.accept(req);else{this.send({t:'move',rev:this.rev,move:req});this.arm('Move response timed out.');this.a.updateHUD();}
 }
 accept(req){
 if(!this.started||this.dead||this.locked||this.a.battleEngine.isBusy()||this.a.ended())throw Error('Move received while match is not ready');
 const a=this.a,legal=a.E.getLegalMoves(a.state).find(x=>same(x,req));if(!legal)throw Error('Illegal move');
 const next=a.E.makeMove(a.state,legal);const msg={t:'commit',rev:this.rev+1,move:{from:legal.from,to:legal.to,promotion:legal.promotion||''},fen:a.E.toFEN(next),key:a.E.positionKey(next)};
 this.send(msg);this.commit(msg);
 }
 commit(d){
 if(d.rev!==this.rev+1||this.locked||this.a.battleEngine.isBusy())throw Error('Out-of-order move');
 const a=this.a,legal=a.E.getLegalMoves(a.state).find(x=>same(x,d.move));if(!legal)throw Error('Invalid accepted move');
 const next=a.E.makeMove(a.state,legal);if(a.E.toFEN(next)!==d.fen||a.E.positionKey(next)!==d.key)throw Error('Position mismatch');
 this.rev=d.rev;this.expected=d.fen;this.localReady=false;this.remoteReady=false;this.locked=true;this.pending=false;
 this.arm('Waiting for both players to finish the move.');original.executeMove.call(a,legal);
 }
 checkFinished(){
 if(!this.started||this.dead||!this.locked||this.localReady||this.a.battleEngine.isBusy()||this.a.state.history.length!==this.rev)return;
 if(this.expected&&this.a.E.toFEN(this.a.state)!==this.expected){this.fail('Position mismatch. Match paused.');return;}
 this.localReady=true;this.finished=this.rev;
 if(this.side==='b')this.send({t:'ready',rev:this.rev,fen:this.a.E.toFEN(this.a.state)});else this.release();
 }
 release(){if(this.side!=='w'||!this.localReady||!this.remoteReady||this.dead)return;this.send({t:'go',rev:this.rev});this.unlock();}
 unlock(){clearTimeout(this.timer);this.locked=false;this.pending=false;this.status('Connected. You are '+(this.side==='w'?'White':'Black')+'.');this.a.updateHUD();}
 receive(d){
 if(!d||typeof d!=='object'||typeof d.t!=='string')throw Error('Invalid message');
 const a=this.a;
 switch(d.t){
 case 'busy':this.fail('That player already has an opponent.');break;
 case 'hello':
  if(this.side!=='w'||this.started||d.v!==VERSION)throw Error('Incompatible invitation');
  if(typeof d.fleet!=='string'||!Object.prototype.hasOwnProperty.call(a.F.fleets,d.fleet))throw Error('Invalid fleet');
  this.resetGame();this.fleets({w:a.fleetIds.w,b:d.fleet});this.expected=a.E.toFEN(a.state);
  this.send({t:'start',v:VERSION,fleets:{...a.fleetIds},fen:this.expected});this.arm('Waiting for friend to start.');a.updateHUD();break;
 case 'start':
  if(this.side!=='b'||this.started||d.v!==VERSION)throw Error('Unexpected match start');
  this.resetGame();this.fleets(d.fleets);this.expected=d.fen;if(a.E.toFEN(a.state)!==d.fen)throw Error('Initial position mismatch');a.updateHUD();break;
 case 'move':
  if(this.side!=='w'||!this.started||a.state.turn!=='b'||d.rev!==this.rev)throw Error('Wrong turn or move number');this.accept(d.move);break;
 case 'commit':if(this.side!=='b'||!this.started)throw Error('Unexpected commit');this.commit(d);break;
 case 'ready':
  if(this.side!=='w'||!this.started||d.rev!==this.rev||d.fen!==this.expected)throw Error('Invalid readiness acknowledgement');this.remoteReady=true;this.release();break;
 case 'go':if(this.side!=='b'||!this.started||d.rev!==this.rev||!this.localReady)throw Error('Invalid turn release');this.unlock();break;
 case 'fleet':
  if(!this.started||typeof d.id!=='string'||!Object.prototype.hasOwnProperty.call(a.F.fleets,d.id))throw Error('Invalid fleet update');
  this.settingFleet=true;try{original.setFleet.call(a,this.side==='w'?'b':'w',d.id);}finally{this.settingFleet=false;}a.renderBoard();a.updateHUD();break;
 default:throw Error('Unknown multiplayer message');
 }
 }
 fail(message){clearTimeout(this.timer);this.dead=true;this.locked=true;this.pending=false;this.status(message);this.a.updateHUD();}
 leave(){
 clearTimeout(this.timer);const c=this.conn;this.conn=null;this.active=false;this.started=false;this.dead=false;this.locked=false;this.pending=false;if(c)c.close();
 this.button.textContent='Connect';this.button.disabled=!this.peer||!this.peer.open;this.input.disabled=false;
 for(const id of ['retry-action-btn','victory-action-btn']){const e=document.getElementById(id);if(e){e.disabled=false;e.title='';}}
 this.a.newGameBtn.disabled=false;original.initGame.call(this.a);this.status('Single-player. Share your code to play again.');
 }
}
function same(a,b){return !!(a&&b&&a.from&&b.from&&a.to&&b.to&&a.from.r===b.from.r&&a.from.c===b.from.c&&a.to.r===b.to.r&&a.to.c===b.to.c&&(a.promotion||'')===(b.promotion||''));}
function boot(){if(g.ArmadaApp&&!g.ArmadaApp.multiplayer)new Multiplayer(g.ArmadaApp);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
