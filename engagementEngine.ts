// Engagement Skirmish Engine for Cosmic Armada Gambit
// Handles dynamic 5-10s battle capture cinematics, weapon volleys, shield flares, and explosions with instant skip

import {Piece, PieceType} from './chessEngine';
import {gameAudio} from './utils/helper';

export interface WeaponSalvo {
  type: 'beam' | 'red_torpedo' | 'blue_torpedo';
  fireTime: number; // in seconds relative to battle start
  fired?: boolean;
}

export interface EngagementProfile {
  name: string;
  standoffRatio: number; // distance fraction from target (0.28 to 0.45)
  duration: number; // total battle duration in seconds (typically 5.0 - 7.0s)
  beamCount: number;
  torpedoCount: number;
  explosionRadius: number;
  shieldStrength: number;
}

export const CLASS_ENGAGEMENT_PROFILES: Record<PieceType, EngagementProfile> = {
  p: {
    name: 'Scout Corvette',
    standoffRatio: 0.35,
    duration: 5.0,
    beamCount: 3,
    torpedoCount: 2,
    explosionRadius: 36,
    shieldStrength: 2,
  },
  n: {
    name: 'Interceptor Destroyer',
    standoffRatio: 0.30,
    duration: 5.2,
    beamCount: 4,
    torpedoCount: 3,
    explosionRadius: 42,
    shieldStrength: 3,
  },
  b: {
    name: 'Cruiser Frigate',
    standoffRatio: 0.45,
    duration: 5.4,
    beamCount: 5,
    torpedoCount: 2,
    explosionRadius: 44,
    shieldStrength: 3,
  },
  r: {
    name: 'Heavy Battlecruiser',
    standoffRatio: 0.32,
    duration: 5.6,
    beamCount: 4,
    torpedoCount: 4,
    explosionRadius: 52,
    shieldStrength: 4,
  },
  q: {
    name: 'Armada Flagship',
    standoffRatio: 0.28,
    duration: 6.0,
    beamCount: 6,
    torpedoCount: 4,
    explosionRadius: 64,
    shieldStrength: 5,
  },
  k: {
    name: 'Command Citadel Flagship',
    standoffRatio: 0.30,
    duration: 6.0,
    beamCount: 5,
    torpedoCount: 3,
    explosionRadius: 60,
    shieldStrength: 4,
  },
};

export interface Projectile {
  id: string;
  type: 'beam' | 'red_torpedo' | 'blue_torpedo';
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0 to 1
  speed: number;
  hasHit?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
}

export interface ActiveBattle {
  attackerPiece: Piece;
  defenderPiece: Piece;
  fromSquare: {r: number; c: number};
  toSquare: {r: number; c: number};
  fromCoords: {x: number; y: number};
  toCoords: {x: number; y: number};
  
  // Current dynamic positions
  attackerCurrent: {x: number; y: number; angle: number};
  defenderCurrent: {x: number; y: number; angle: number; opacity: number};
  
  elapsed: number;
  duration: number;
  standoffPos: {x: number; y: number};
  salvos: WeaponSalvo[];
  projectiles: Projectile[];
  particles: Particle[];
  shockwaves: Shockwave[];
  shakeAmount: number;
  isDefenderDestroyed: boolean;
  onComplete: () => void;
}

export function createBattle(
  attackerPiece: Piece,
  defenderPiece: Piece,
  fromSquare: {r: number; c: number},
  toSquare: {r: number; c: number},
  fromCoords: {x: number; y: number},
  toCoords: {x: number; y: number},
  onComplete: () => void,
  customDuration?: number,
): ActiveBattle {
  const profile = CLASS_ENGAGEMENT_PROFILES[attackerPiece.type];
  const duration = customDuration ?? profile.duration;

  // Standoff vector: approach toward defender, stopping at standoffRatio distance
  const dx = toCoords.x - fromCoords.x;
  const dy = toCoords.y - fromCoords.y;
  const totalDist = Math.hypot(dx, dy);
  const standoffDist = Math.max(30, totalDist * (1 - profile.standoffRatio));
  const normX = totalDist > 0 ? dx / totalDist : 1;
  const normY = totalDist > 0 ? dy / totalDist : 0;

  const standoffPos = {
    x: fromCoords.x + normX * standoffDist,
    y: fromCoords.y + normY * standoffDist,
  };

  const initialAngle = Math.atan2(dy, dx);

  // Generate salvo schedule distributed during the standoff firing phase (from 1.0s to duration - 1.5s)
  const salvos: WeaponSalvo[] = [];
  const firingStart = 1.0;
  const firingEnd = duration - 1.5;
  const firingSpan = Math.max(1.0, firingEnd - firingStart);

  const totalShots = profile.beamCount + profile.torpedoCount;
  for (let i = 0; i < totalShots; i++) {
    const fraction = (i + 0.5) / totalShots;
    const fireTime = firingStart + fraction * firingSpan;
    // Alternate weapon types
    let type: 'beam' | 'red_torpedo' | 'blue_torpedo' = 'beam';
    if (i % 2 === 1) {
      type = i % 4 === 1 ? 'red_torpedo' : 'blue_torpedo';
    }
    salvos.push({type, fireTime});
  }

  return {
    attackerPiece,
    defenderPiece,
    fromSquare,
    toSquare,
    fromCoords,
    toCoords,
    attackerCurrent: {x: fromCoords.x, y: fromCoords.y, angle: initialAngle},
    defenderCurrent: {
      x: toCoords.x,
      y: toCoords.y,
      angle: initialAngle + Math.PI,
      opacity: 1,
    },
    elapsed: 0,
    duration,
    standoffPos,
    salvos,
    projectiles: [],
    particles: [],
    shockwaves: [],
    shakeAmount: 0,
    isDefenderDestroyed: false,
    onComplete,
  };
}

export function updateBattle(battle: ActiveBattle, dt: number): boolean {
  battle.elapsed += dt;
  const {elapsed, duration, fromCoords, standoffPos, toCoords} = battle;

  // Camera shake decay
  battle.shakeAmount = Math.max(0, battle.shakeAmount - dt * 25);

  // Phase 1: Approach (0 to 1.0s)
  // Phase 2: Salvo Skirmish (1.0s to duration - 1.4s)
  // Phase 3: Catastrophic Explosion & Defender Vaporization (duration - 1.4s to duration - 0.7s)
  // Phase 4: Repositioning Attacker to destination (duration - 0.7s to duration)

  if (elapsed < 1.0) {
    const t = Math.min(1, elapsed / 1.0);
    // Smooth ease-out
    const ease = 1 - Math.pow(1 - t, 3);
    battle.attackerCurrent.x = fromCoords.x + (standoffPos.x - fromCoords.x) * ease;
    battle.attackerCurrent.y = fromCoords.y + (standoffPos.y - fromCoords.y) * ease;
  } else if (elapsed < duration - 0.7) {
    // Standoff hovering with slight orbital micro-sway
    const swayT = elapsed * 3;
    battle.attackerCurrent.x = standoffPos.x + Math.sin(swayT) * 3;
    battle.attackerCurrent.y = standoffPos.y + Math.cos(swayT) * 2;
  } else {
    // Attacker glides forward to contested coordinate
    const glideElapsed = elapsed - (duration - 0.7);
    const t = Math.min(1, glideElapsed / 0.7);
    const ease = t * t * (3 - 2 * t);
    battle.attackerCurrent.x = standoffPos.x + (toCoords.x - standoffPos.x) * ease;
    battle.attackerCurrent.y = standoffPos.y + (toCoords.y - standoffPos.y) * ease;
  }

  // Update angle towards target
  const curDx = toCoords.x - battle.attackerCurrent.x;
  const curDy = toCoords.y - battle.attackerCurrent.y;
  battle.attackerCurrent.angle = Math.atan2(curDy, curDx);

  // Fire scheduled salvos
  for (const salvo of battle.salvos) {
    if (!salvo.fired && elapsed >= salvo.fireTime) {
      salvo.fired = true;

      // Play audio
      if (salvo.type === 'beam') {
        gameAudio.playArcadeLaser();
      } else if (salvo.type === 'red_torpedo') {
        gameAudio.playGunshotBlast();
      } else {
        gameAudio.playGunshotBlast();
      }

      battle.projectiles.push({
        id: `proj_${Math.random()}`,
        type: salvo.type,
        startX: battle.attackerCurrent.x,
        startY: battle.attackerCurrent.y,
        targetX: toCoords.x + (Math.random() - 0.5) * 16,
        targetY: toCoords.y + (Math.random() - 0.5) * 16,
        progress: 0,
        speed: salvo.type === 'beam' ? 4.5 : 2.5,
      });
    }
  }

  // Update projectiles
  for (let i = battle.projectiles.length - 1; i >= 0; i--) {
    const proj = battle.projectiles[i];
    proj.progress += proj.speed * dt;

    if (proj.progress >= 1 && !proj.hasHit) {
      proj.hasHit = true;
      battle.shakeAmount = Math.min(20, battle.shakeAmount + 4);
      gameAudio.playShieldBlock();

      // Spawn shield-hit sparks
      const hitColor = proj.type === 'beam' ? '#fb923c' : proj.type === 'red_torpedo' ? '#ef4444' : '#38bdf8';
      for (let p = 0; p < 8; p++) {
        const pAngle = Math.random() * Math.PI * 2;
        const pSpeed = 40 + Math.random() * 80;
        battle.particles.push({
          x: proj.targetX,
          y: proj.targetY,
          vx: Math.cos(pAngle) * pSpeed,
          vy: Math.sin(pAngle) * pSpeed,
          life: 0.35 + Math.random() * 0.2,
          maxLife: 0.5,
          size: 3 + Math.random() * 4,
          color: hitColor,
        });
      }

      // Spawn subtle shield ripple shockwave
      battle.shockwaves.push({
        x: proj.targetX,
        y: proj.targetY,
        radius: 8,
        maxRadius: 28,
        opacity: 0.9,
        color: hitColor,
      });

      battle.projectiles.splice(i, 1);
    }
  }

  // Check for catastrophic defender destruction explosion
  const explosionTriggerTime = duration - 1.4;
  if (!battle.isDefenderDestroyed && elapsed >= explosionTriggerTime) {
    battle.isDefenderDestroyed = true;
    battle.shakeAmount = 24;
    gameAudio.playChiptuneExplosion();

    // Large cosmic explosion shockwaves
    battle.shockwaves.push({
      x: toCoords.x,
      y: toCoords.y,
      radius: 12,
      maxRadius: 80,
      opacity: 1,
      color: '#f97316',
    });
    battle.shockwaves.push({
      x: toCoords.x,
      y: toCoords.y,
      radius: 6,
      maxRadius: 60,
      opacity: 1,
      color: '#38bdf8',
    });

    // 50+ debris and cosmic fire motes
    const colors = ['#f97316', '#ef4444', '#facc15', '#38bdf8', '#ffffff'];
    for (let p = 0; p < 50; p++) {
      const pAngle = Math.random() * Math.PI * 2;
      const pSpeed = 60 + Math.random() * 160;
      battle.particles.push({
        x: toCoords.x,
        y: toCoords.y,
        vx: Math.cos(pAngle) * pSpeed,
        vy: Math.sin(pAngle) * pSpeed,
        life: 0.6 + Math.random() * 0.8,
        maxLife: 1.4,
        size: 3 + Math.random() * 6,
        color: colors[p % colors.length],
      });
    }
  }

  // Fade out defender when destroyed
  if (battle.isDefenderDestroyed) {
    const fadeElapsed = elapsed - explosionTriggerTime;
    battle.defenderCurrent.opacity = Math.max(0, 1 - fadeElapsed / 0.6);
  }

  // Update particles
  for (let i = battle.particles.length - 1; i >= 0; i--) {
    const p = battle.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    if (p.life <= 0) {
      battle.particles.splice(i, 1);
    }
  }

  // Update shockwaves
  for (let i = battle.shockwaves.length - 1; i >= 0; i--) {
    const sw = battle.shockwaves[i];
    sw.radius += (sw.maxRadius - sw.radius) * 6 * dt;
    sw.opacity -= dt * 1.5;
    if (sw.opacity <= 0) {
      battle.shockwaves.splice(i, 1);
    }
  }

  // Battle complete
  if (elapsed >= duration) {
    battle.onComplete();
    return true;
  }

  return false;
}
