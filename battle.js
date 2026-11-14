// Cosmic Armada Gambit — continuous, paired dogfight choreography.
// Same public BattleEngine interface, weapons, profiles and legal outcomes.
(function(global){
'use strict';
const PROFILES={
 p:{duration:7.2,shots:6,speed:1.15,torpedo:'photon'},
 n:{duration:8,shots:8,speed:1.35,torpedo:'quantum'},
 b:{duration:8.2,shots:8,speed:1.05,torpedo:'photon'},
 r:{duration:8.6,shots:9,speed:.85,torpedo:'photon'},
 q:{duration:9,shots:10,speed:1,torpedo:'quantum'},
 k:{duration:8.4,shots:8,speed:.9,torpedo:'quantum'}
};
const SIZES={p:25,n:65,b:65,r:45,q:120,k:120};
const WEAPONS={
 phaser:{color:'#ff652f',core:'#ffe1bf',duration:.2,sound:'playPhaser'},
 photon:{color:'#ff3030',core:'#ffd0c0',duration:.43,sound:'playPhotonTorpedo'},
 quantum:{color:'#d9f4ff',core:'#ffffff',duration:.43,sound:'playQuantumTorpedo'}
};
const PATTERNS=['circle','passes','pursuit','figureEight','broadside'];
const STEP=1/120,TRAIL_INTERVAL=1/60,TRAIL_LIFE=.42;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const random=(a,b)=>a+Math.random()*(b-a);
const choose=list=>list[Math.floor(Math.random()*list.length)];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function smooth(v){const t=clamp(v,0,1);return t*t*t*(10+t*(-15+6*t));}
// Quintic Hermite: position, velocity AND acceleration match at both ends.
function polynomial(p0,v0,a0,p1,v1,a1,duration){
 const T=duration,c0=p0,c1=v0*T,c2=a0*T*T/2;
 const d=p1-c0-c1-c2,v=v1*T-c1-2*c2,a=a1*T*T-2*c2;
 return [c0,c1,c2,10*d-4*v+a/2,-15*d+7*v-a,6*d-3*v+a/2];
}
function evaluate(c,u,T){
 const p=c[0]+u*(c[1]+u*(c[2]+u*(c[3]+u*(c[4]+u*c[5]))));
 const v=(c[1]+u*(2*c[2]+u*(3*c[3]+u*(4*c[4]+u*5*c[5]))))/T;
 const a=(2*c[2]+u*(6*c[3]+u*(12*c[4]+u*20*c[5])))/(T*T);
 return {p,v,a};
}
function curve(start,end,T){
 return {T,x:polynomial(start.x,start.vx||0,start.ax||0,end.x,end.vx||0,end.ax||0,T),
  y:polynomial(start.y,start.vy||0,start.ay||0,end.y,end.vy||0,end.ay||0,T)};
}
function sampleCurve(c,time){
 const u=clamp(time/c.T,0,1),x=evaluate(c.x,u,c.T),y=evaluate(c.y,u,c.T);
 return {x:x.p,y:y.p,vx:x.v,vy:y.v,ax:x.a,ay:y.a};
}
class BattleEngine{
 constructor(canvas,onShake){
  this.canvas=null;this.ctx=null;this.viewWidth=0;this.viewHeight=0;
  this.onShake=onShake||(()=>{});this.activeBattle=null;this.activeGlide=null;this.factionResolver=null;
  if(canvas)this.setCanvas(canvas);
 }
 setCanvas(canvas,width,height){
  this.canvas=canvas;this.ctx=canvas?canvas.getContext('2d'):null;
  this.viewWidth=width||(canvas&&(canvas.clientWidth||canvas.width))||0;
  this.viewHeight=height||(canvas&&(canvas.clientHeight||canvas.height))||0;
  if(this.ctx&&this.viewWidth&&this.viewHeight)this.ctx.setTransform(canvas.width/this.viewWidth,0,0,canvas.height/this.viewHeight,0,0);
 }
 setFactionResolver(resolver){this.factionResolver=typeof resolver==='function'?resolver:null;}
 getVisuals(piece){
  const fleet=this.factionResolver?this.factionResolver(piece):null,weapons={};
  for(const type of Object.keys(WEAPONS)){
   const custom=fleet&&fleet.weapons&&fleet.weapons[type];
   weapons[type]={...WEAPONS[type],color:custom&&custom.color||WEAPONS[type].color,core:custom&&custom.core||WEAPONS[type].core};
  }
  const size=fleet&&fleet.sizes&&fleet.sizes[piece&&piece.type];
  return {weapons,trail:fleet&&fleet.trail||(piece&&piece.color==='w'?'#38bdf8':'#ef4444'),
   size:Number.isFinite(size)?size:SIZES[piece&&piece.type]||25};
 }
 playSound(name){
  const audio=global.ArmadaAudio;if(!audio||typeof audio[name]!=='function')return;
  try{const result=audio[name]();if(result&&typeof result.catch==='function')result.catch(error=>console.warn(`Audio ${name} unavailable:`,error));}
  catch(error){console.warn(`Audio ${name} unavailable:`,error);}
 }
 getProfile(piece){return PROFILES[piece&&piece.type]||PROFILES.p;}
 getCellSize(){const grid=document.getElementById('chess-grid');return grid&&grid.clientWidth?grid.clientWidth/8:this.viewWidth?this.viewWidth/9:80;}
 getPiece(b,a){return a==='attacker'?b.move.piece:b.move.captured;}
 getActor(b,a){return a==='attacker'?b.attackerPos:b.defenderPos;}
 getTarget(b,a){return this.getActor(b,a==='attacker'?'defender':'attacker');}
 getTorpedo(b,a){return this.getProfile(this.getPiece(b,a)).torpedo;}
 addSalvo(b,time,actor,type,options={}){b.salvos.push({time,actor,type,miss:Boolean(options.miss),finisher:Boolean(options.finisher),fired:false});}
 patternPosition(b,actor,time){
  const defender=actor==='defender',sign=defender?-1:1;
  const a=b.phase+b.direction*time*b.profile.speed*1.65,r=b.radius;
  let x,y;
  switch(b.pattern){
   case 'passes':
    x=sign*r*.96*Math.sin(a)+r*.04*Math.sin(3*a);
    y=sign*r*.56*Math.cos(a)+r*.10*Math.sin(2*a);break;
   case 'pursuit':{
    const phase=a+(defender?1.85:0);
    x=r*.94*Math.cos(phase);y=r*.78*Math.sin(phase);break;
   }
   case 'figureEight':
    // Parallel figure-eights: no shared crossing point and no corrective shove.
    x=r*.70*Math.sin(a);y=r*.22*Math.sin(2*a)+sign*r*.55;break;
   case 'broadside':
    x=r*.65*Math.sin(a)+sign*r*.25*Math.cos(a);
    y=r*.12*Math.sin(2*a)+sign*r*(.58+.06*Math.cos(a));break;
   default:{
    const pulse=.94+.04*Math.sin(time*b.profile.speed*1.4);
    x=sign*r*pulse*Math.cos(a);y=sign*r*pulse*.82*Math.sin(a);
   }
  }
  const c=Math.cos(b.bearing),s=Math.sin(b.bearing);
  return {x:b.center.x+x*c-y*s,y:b.center.y+x*s+y*c};
 }
 patternSample(b,actor,time){
  const h=.001,p=this.patternPosition(b,actor,time),lo=this.patternPosition(b,actor,time-h),hi=this.patternPosition(b,actor,time+h);
  return {...p,vx:(hi.x-lo.x)/(2*h),vy:(hi.y-lo.y)/(2*h),ax:(hi.x-2*p.x+lo.x)/(h*h),ay:(hi.y-2*p.y+lo.y)/(h*h)};
 }
 flightSample(b,actor,time){
  return time<b.entryDuration?sampleCurve(b.entries[actor],time):this.patternSample(b,actor,time-b.entryDuration);
 }
 flightPosition(b,actor,time){const p=this.flightSample(b,actor,time);return {x:p.x,y:p.y};}
 motionSample(b,actor,time){
  if(time<=b.explosionTime)return this.flightSample(b,actor,time);
  if(actor==='defender')return this.flightSample(b,actor,b.explosionTime);
  return sampleCurve(b.exitCurve,time-b.explosionTime);
 }
 preparePaths(b){
  const initialPhase=b.phase,pad=b.cell*.45;
  let best=null;
  // Select an approach/exit phase using the actual starting squares and canvas.
  // Scoring chooses a path; it never clamps an actor mid-flight.
  for(let i=0;i<32;i++){
   b.phase=initialPhase+i*Math.PI*2/32;
   const entries={attacker:curve(b.fromCoords,this.patternSample(b,'attacker',0),b.entryDuration),
    defender:curve(b.defenderCoords,this.patternSample(b,'defender',0),b.entryDuration)};
   const exitStart=this.patternSample(b,'attacker',b.explosionTime-b.entryDuration);
   const exitCurve=curve(exitStart,b.toCoords,b.duration-b.explosionTime);
   let score=0;
   const boundary=p=>{
    const dx=Math.max(0,pad-p.x,p.x-(b.width-pad)),dy=Math.max(0,pad-p.y,p.y-(b.height-pad));
    return (dx*dx+dy*dy)*80;
   };
   for(let j=0;j<=16;j++){
    const t=j/16*b.entryDuration,a=sampleCurve(entries.attacker,t),d=sampleCurve(entries.defender,t);
    const separation=Math.hypot(a.x-d.x,a.y-d.y),need=b.minimumSpacing;
    score+=Math.pow(Math.max(0,need-separation),2)*120+boundary(a)+boundary(d);
    score+=(a.vx*a.vx+a.vy*a.vy+d.vx*d.vx+d.vy*d.vy)*.0007;
    score+=boundary(sampleCurve(exitCurve,j/16*exitCurve.T));
   }
   if(!best||score<best.score)best={score,phase:b.phase,entries,exitCurve};
  }
  b.phase=best.phase;b.entries=best.entries;b.exitCurve=best.exitCurve;
 }
 startBattle(move,fromCoords,toCoords,onComplete,options={}){
  if(!move||!move.piece||!move.captured)throw Error('A battle requires a legal capture.');
  const profile=this.getProfile(move.piece),cell=this.getCellSize(),width=this.viewWidth||cell*9,height=this.viewHeight||cell*9;
  const visuals={attacker:this.getVisuals(move.piece),defender:this.getVisuals(move.captured)};
  const minimumSpacing=cell*(.72*(visuals.attacker.size+visuals.defender.size)/200+.12);
  const radius=Math.min(Math.max(cell*1.05,minimumSpacing/.98),width*.21,height*.21);
  const margin=Math.min(radius*1.08+cell*.5,width/2,height/2);
  const bearing=Math.atan2(toCoords.y-fromCoords.y,toCoords.x-fromCoords.x),defenderCoords=options.defenderCoords||toCoords;
  let pool=PATTERNS;
  if(move.piece.type==='n')pool=['pursuit','passes','figureEight','circle'];
  else if(move.piece.type==='r')pool=['broadside','broadside','circle','passes'];
  const rest=p=>p&&p.color==='b'?Math.PI/2:-Math.PI/2;
  const attackerHeading=Number.isFinite(options.attackerHeading)?options.attackerHeading:rest(move.piece);
  const defenderHeading=Number.isFinite(options.defenderHeading)?options.defenderHeading:rest(move.captured);
  const b={move,profile,cell,width,height,radius,minimumSpacing,bearing,visuals,
   center:{x:clamp(toCoords.x,margin,width-margin),y:clamp(toCoords.y,margin,height-margin)},
   fromCoords:{...fromCoords},toCoords:{...toCoords},defenderCoords:{...defenderCoords},
   pattern:choose(pool),direction:Math.random()<.5?-1:1,phase:random(0,Math.PI*2),
   elapsed:0,duration:profile.duration,entryDuration:1,explosionTime:profile.duration-1.35,
   attackerPos:{...fromCoords,angle:attackerHeading,yawRate:0,opacity:1},
   defenderPos:{...defenderCoords,angle:defenderHeading,yawRate:0,opacity:1},
   restingHeading:attackerHeading,salvos:[],projectiles:[],particles:[],shockwaves:[],
   trails:{attacker:[],defender:[]},nextTrailAt:0,shakeAmount:0,isDestroyed:false,returnYaw:null,onComplete};
  this.preparePaths(b);
  const fireStart=1.25,fireEnd=b.explosionTime-1;
  for(let i=0;i<profile.shots;i++){
   const time=lerp(fireStart,fireEnd,(i+.3)/profile.shots);
   this.addSalvo(b,time,'attacker',i%2===0?'phaser':this.getTorpedo(b,'attacker'),{miss:Math.random()<.2});
   if(i%2===0&&time+.22<fireEnd)this.addSalvo(b,time+.22,'defender',i%4===0?'phaser':this.getTorpedo(b,'defender'),{miss:Math.random()<.35});
  }
  if(Math.random()<.75){
   const time=lerp(fireStart,fireEnd,random(.25,.65)),actor=Math.random()<.7?'attacker':'defender',type=this.getTorpedo(b,actor);
   for(let i=0;i<3;i++)this.addSalvo(b,time+i*.1,actor,type,{miss:i===0&&Math.random()<.5});
  }
  this.addSalvo(b,b.explosionTime-.65,'attacker','phaser');
  this.addSalvo(b,b.explosionTime-.43,'attacker',this.getTorpedo(b,'attacker'),{finisher:true});
  b.salvos.sort((a,c)=>a.time-c.time);this.activeGlide=null;this.activeBattle=b;
 }
 startGlide(move,fromCoords,toCoords,onComplete){
  this.activeBattle=null;this.activeGlide={move,fromCoords:{...fromCoords},toCoords:{...toCoords},current:{...fromCoords},elapsed:0,duration:.45,onComplete};
 }
 finishAnimation(animation,isBattle){
  const finish=animation.onComplete;if(isBattle)this.activeBattle=null;else this.activeGlide=null;
  this.onShake(0,0);this.clearCanvas();if(finish)finish();
 }
 cancelAnimation(){this.activeBattle=null;this.activeGlide=null;this.onShake(0,0);this.clearCanvas();}
 skipAnimation(){
  if(this.activeBattle){this.finishAnimation(this.activeBattle,true);return true;}
  if(this.activeGlide){this.finishAnimation(this.activeGlide,false);return true;}return false;
 }
 isBusy(){return Boolean(this.activeBattle||this.activeGlide);}
 update(dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  const initial=this.activeBattle||this.activeGlide;
  let remaining=Math.min(dt,.25);
  while(remaining>1e-9&&initial&&(this.activeBattle||this.activeGlide)===initial){
   let step=Math.min(STEP,remaining);
   if(this.activeBattle){
    const b=this.activeBattle;
    const boundary=b.isDestroyed?b.duration:b.explosionTime;
    if(boundary>b.elapsed+1e-10)step=Math.min(step,boundary-b.elapsed);
    const next=b.salvos.find(s=>!s.fired&&s.time>b.elapsed+1e-10);
    if(next&&!b.isDestroyed)step=Math.min(step,next.time-b.elapsed);
   }
   if(this.activeBattle)this.updateBattle(step);else this.updateGlide(step);
   remaining-=step;
  }
 }
 updateGlide(dt){
  const g=this.activeGlide;g.elapsed=Math.min(g.duration,g.elapsed+dt);const t=smooth(g.elapsed/g.duration);
  g.current.x=lerp(g.fromCoords.x,g.toCoords.x,t);g.current.y=lerp(g.fromCoords.y,g.toCoords.y,t);
  if(g.elapsed>=g.duration-1e-9)this.finishAnimation(g,false);
 }
 turn(pos,sample,dt){
  if(Math.hypot(sample.vx,sample.vy)<.01){pos.yawRate=0;return;}
  const target=Math.atan2(sample.vy,sample.vx),error=wrap(target-pos.angle);
  const delta=clamp(error*(1-Math.exp(-11*dt)),-5.5*dt,5.5*dt);
  pos.angle+=delta;pos.yawRate=dt>0?delta/dt:0;
 }
 muzzle(b,actor,position){
  const p=position||this.getActor(b,actor),angle=this.getActor(b,actor).angle;
  const reach=b.cell*.72*b.visuals[actor].size/100*.32;
  return {x:p.x+Math.cos(angle)*reach,y:p.y+Math.sin(angle)*reach};
 }
 fire(b,salvo){
  const actor=salvo.actor,targetActor=actor==='attacker'?'defender':'attacker';
  const type=salvo.type==='phaser'?'phaser':this.getTorpedo(b,actor),weapon={...b.visuals[actor].weapons[type]};
  const born=Number.isFinite(salvo.time)?salvo.time:b.elapsed;
  const source=this.muzzle(b,actor,this.motionSample(b,actor,born));
  const target=this.motionSample(b,targetActor,born+weapon.duration);
  const missAngle=random(0,Math.PI*2),missDistance=salvo.miss?b.cell*.55:0;
  const offsetX=Math.cos(missAngle)*missDistance,offsetY=Math.sin(missAngle)*missDistance;
  const end={x:target.x+offsetX,y:target.y+offsetY},dx=end.x-source.x,dy=end.y-source.y;
  const distance=Math.hypot(dx,dy)||1,bend=random(-1,1)*b.cell*.24;
  b.projectiles.push({type,weapon,actor,miss:Boolean(salvo.miss),finisher:Boolean(salvo.finisher),
   born,age:0,duration:weapon.duration,x:source.x,y:source.y,sourceX:source.x,sourceY:source.y,
   targetX:end.x,targetY:end.y,offsetX,offsetY,
   controlX:(source.x+end.x)/2-dy/distance*bend,controlY:(source.y+end.y)/2+dx/distance*bend,
   angle:Math.atan2(dy,dx)});
  this.playSound(weapon.sound);
 }
 updateBattle(dt){
  const b=this.activeBattle;b.elapsed=Math.min(b.duration,b.elapsed+dt);const t=b.elapsed;
  b.shakeAmount*=Math.exp(-13*dt);if(b.shakeAmount<.015)b.shakeAmount=0;
  if(!b.isDestroyed){
   for(const actor of ['attacker','defender']){
    const pos=this.getActor(b,actor),sample=this.flightSample(b,actor,Math.min(t,b.explosionTime));
    pos.x=sample.x;pos.y=sample.y;this.turn(pos,sample,dt);
   }
   for(const salvo of b.salvos)if(!salvo.fired&&t>=salvo.time){salvo.fired=true;this.fire(b,salvo);}
  }
  for(let i=b.projectiles.length-1;i>=0;i--){
   const shot=b.projectiles[i];shot.age=Math.max(0,t-shot.born);
   const u=clamp(shot.age/shot.duration,0,1);
   if(shot.type==='phaser'){
    const target=this.getTarget(b,shot.actor);shot.targetX=target.x+shot.offsetX;shot.targetY=target.y+shot.offsetY;
    // Targeting NEVER changes the ship's heading.
   }else{
    const v=1-u;
    shot.x=v*v*shot.sourceX+2*v*u*shot.controlX+u*u*shot.targetX;
    shot.y=v*v*shot.sourceY+2*v*u*shot.controlY+u*u*shot.targetY;
    const dx=2*v*(shot.controlX-shot.sourceX)+2*u*(shot.targetX-shot.controlX);
    const dy=2*v*(shot.controlY-shot.sourceY)+2*u*(shot.targetY-shot.controlY);
    shot.angle=Math.atan2(dy,dx);
   }
   if(shot.age>=shot.duration-1e-9){
    if(!shot.miss&&!shot.finisher){
     const target=this.getTarget(b,shot.actor);this.addBurst(b,target.x,target.y,shot.weapon.color,7,false);
     b.shakeAmount=Math.max(b.shakeAmount,2);this.playSound('playShieldBlock');
    }
    b.projectiles.splice(i,1);
   }
  }
  if(!b.isDestroyed&&t>=b.explosionTime){
   b.isDestroyed=true;b.projectiles.length=0;
   const p=b.attackerPos,T=b.duration-b.explosionTime,goal=p.angle+wrap(b.restingHeading-p.angle);
   b.returnYaw=polynomial(p.angle,p.yawRate||0,0,goal,0,0,T);
   this.playSound('playChiptuneExplosion');
   this.addBurst(b,b.defenderPos.x,b.defenderPos.y,'#ff8930',65,true);b.shakeAmount=9;
  }
  if(b.isDestroyed){
   const sample=sampleCurve(b.exitCurve,t-b.explosionTime),u=clamp((t-b.explosionTime)/b.exitCurve.T,0,1);
   b.attackerPos.x=sample.x;b.attackerPos.y=sample.y;
   b.attackerPos.angle=evaluate(b.returnYaw,u,b.exitCurve.T).p;
   b.defenderPos.opacity=1-smooth((t-b.explosionTime)/.35);
  }
  for(const trail of Object.values(b.trails))for(let i=trail.length-1;i>=0;i--){trail[i].life-=dt;if(trail[i].life<=0)trail.splice(i,1);}
  while(b.nextTrailAt<=t+1e-9){
   const sampleTime=b.nextTrailAt;
   for(const actor of ['attacker','defender']){
    if(actor==='defender'&&sampleTime>b.explosionTime)continue;
    const p=this.motionSample(b,actor,sampleTime),life=TRAIL_LIFE-(t-sampleTime);
    if(life>0)b.trails[actor].push({x:p.x,y:p.y,life,color:b.visuals[actor].trail});
   }
   b.nextTrailAt+=TRAIL_INTERVAL;
  }
  const drag=Math.exp(-2*dt),travel=(1-drag)/2;
  for(let i=b.particles.length-1;i>=0;i--){const p=b.particles[i];p.life-=dt;p.x+=p.vx*travel;p.y+=p.vy*travel;p.vx*=drag;p.vy*=drag;if(p.life<=0)b.particles.splice(i,1);}
  for(let i=b.shockwaves.length-1;i>=0;i--){const w=b.shockwaves[i];w.radius+=w.speed*dt;w.opacity-=dt*1.7;if(w.opacity<=0)b.shockwaves.splice(i,1);}
  this.onShake(b.shakeAmount*.65,t);
  if(t>=b.duration-1e-9)this.finishAnimation(b,true);
 }
 addBurst(b,x,y,color,count,large){
  const palette=large?['#ffffff','#ffd580','#ff8930','#ff4030']:[color];
  for(let i=0;i<count;i++){
   const a=random(0,Math.PI*2),speed=b.cell*(large?random(.5,2.1):random(.2,.7)),life=large?random(.45,1.1):random(.15,.35);
   b.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life,maxLife:life,
    size:Math.max(1,b.cell*(large?random(.015,.05):.02)),color:palette[i%palette.length]});
  }
  b.shockwaves.push({x,y,radius:3,speed:b.cell*(large?1.4:.45),opacity:1,color});
 }
 clearCanvas(){
  if(!this.ctx||!this.canvas)return;
  this.ctx.save();this.ctx.setTransform(1,0,0,1,0,0);this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.ctx.restore();
 }
 render(drawPieceFn){
  if(!this.ctx||!this.canvas)return;this.clearCanvas();const ctx=this.ctx;
  if(this.activeGlide){const g=this.activeGlide;drawPieceFn(ctx,g.move.piece,g.current.x,g.current.y,1);return;}
  const b=this.activeBattle;if(!b)return;
  for(const [actor,trail]of Object.entries(b.trails)){
   for(let i=1;i<trail.length;i++){
    const p=trail[i-1],q=trail[i];ctx.save();ctx.globalAlpha=clamp(q.life/TRAIL_LIFE,0,1)*.25;
    ctx.strokeStyle=q.color;ctx.lineWidth=Math.max(1,b.cell*.022);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();
   }
   if(trail.length&&!(actor==='defender'&&b.isDestroyed)){
    const last=trail[trail.length-1],p=this.getActor(b,actor);ctx.save();ctx.globalAlpha=.22;
    ctx.strokeStyle=last.color;ctx.lineWidth=Math.max(1,b.cell*.022);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
   }
  }
  if(b.defenderPos.opacity>0)drawPieceFn(ctx,b.move.captured,b.defenderPos.x,b.defenderPos.y,b.defenderPos.opacity,b.defenderPos.angle);
  drawPieceFn(ctx,b.move.piece,b.attackerPos.x,b.attackerPos.y,1,b.attackerPos.angle);
  for(const shot of b.projectiles){
   const w=shot.weapon,u=clamp(shot.age/shot.duration,0,1);ctx.save();ctx.shadowColor=w.color;ctx.shadowBlur=9;
   if(shot.type==='phaser'){
    const source=this.muzzle(b,shot.actor);ctx.globalAlpha=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.35);ctx.lineCap='round';
    ctx.strokeStyle=w.color;ctx.lineWidth=Math.max(2,b.cell*.04);ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(shot.targetX,shot.targetY);ctx.stroke();
    ctx.strokeStyle=w.core;ctx.lineWidth=Math.max(1,b.cell*.012);ctx.stroke();
   }else{
    const radius=Math.max(2,b.cell*(shot.type==='quantum'?.045:.04));
    ctx.translate(shot.x,shot.y);ctx.rotate(shot.angle);ctx.globalAlpha=.42;ctx.strokeStyle=w.color;ctx.lineWidth=radius;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-radius*4,0);ctx.lineTo(0,0);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=w.color;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=w.core;ctx.beginPath();ctx.arc(0,0,radius*.45,0,Math.PI*2);ctx.fill();
   }
   ctx.restore();
  }
  for(const w of b.shockwaves){ctx.save();ctx.strokeStyle=w.color;ctx.globalAlpha=Math.max(0,w.opacity);ctx.lineWidth=2;ctx.beginPath();ctx.arc(w.x,w.y,w.radius,0,Math.PI*2);ctx.stroke();ctx.restore();}
  for(const p of b.particles){ctx.save();ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();}
 }
}
global.BattleEngine=BattleEngine;
})(window);
