// ==========================================================================
// Cosmic Armada Gambit — Starship Dogfight Engine
//
// Three weapon types only:
//   phaser  — red-orange beam, available to every ship
//   photon  — red torpedo, Pawn / Rook / Bishop
//   quantum — white-blue torpedo, Knight / Queen / King
//
// Actual ship PNG rendering is supplied by main.js.
// ==========================================================================

(function(global) {
  'use strict';

  const PROFILES = {
    p: {
      duration: 7.2,
      shots: 6,
      speed: 1.15,
      torpedo: 'photon',
    },
    n: {
      duration: 8.0,
      shots: 8,
      speed: 1.35,
      torpedo: 'quantum',
    },
    b: {
      duration: 8.2,
      shots: 8,
      speed: 1.05,
      torpedo: 'photon',
    },
    r: {
      duration: 8.6,
      shots: 9,
      speed: 0.85,
      torpedo: 'photon',
    },
    q: {
      duration: 9.0,
      shots: 10,
      speed: 1.0,
      torpedo: 'quantum',
    },
    k: {
      duration: 8.4,
      shots: 8,
      speed: 0.9,
      torpedo: 'quantum',
    },
  };

  const WEAPONS = {
    phaser: {
      color: '#ff652f',
      core: '#ffe1bf',
      duration: 0.2,
      sound: 'playPhaser',
    },
    photon: {
      color: '#ff3030',
      core: '#ffd0c0',
      duration: 0.43,
      sound: 'playPhotonTorpedo',
    },
    quantum: {
      color: '#d9f4ff',
      core: '#ffffff',
      duration: 0.43,
      sound: 'playQuantumTorpedo',
    },
  };

  const PATTERNS = [
    'circle',
    'passes',
    'pursuit',
    'figureEight',
    'broadside',
  ];

  const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));

  const lerp = (start, end, amount) =>
    start + (end - start) * amount;

  const random = (min, max) =>
    min + Math.random() * (max - min);

  const choose = list =>
    list[Math.floor(Math.random() * list.length)];

  function smooth(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  class BattleEngine {
    constructor(canvas, onShake) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.onShake = onShake || (() => {});
      this.activeBattle = null;
      this.activeGlide = null;
    }

    setCanvas(canvas) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
    }

    playSound(name) {
      const audio = global.ArmadaAudio;

      if (audio && typeof audio[name] === 'function') {
        audio[name]();
      }
    }

    getProfile(piece) {
      return PROFILES[piece && piece.type] || PROFILES.p;
    }

    getCellSize() {
      const grid = document.getElementById('chess-grid');

      return grid && grid.clientWidth
        ? grid.clientWidth / 8
        : (this.canvas ? this.canvas.width / 9 : 80);
    }

    getPiece(battle, actor) {
      return actor === 'attacker'
        ? battle.move.piece
        : battle.move.captured;
    }

    getActor(battle, actor) {
      return actor === 'attacker'
        ? battle.attackerPos
        : battle.defenderPos;
    }

    getTarget(battle, actor) {
      return actor === 'attacker'
        ? battle.defenderPos
        : battle.attackerPos;
    }

    getTorpedo(battle, actor) {
      return this.getProfile(
        this.getPiece(battle, actor)
      ).torpedo;
    }

    addSalvo(battle, time, actor, type, options = {}) {
      battle.salvos.push({
        time,
        actor,
        type,
        miss: Boolean(options.miss),
        finisher: Boolean(options.finisher),
        fired: false,
      });
    }

    startBattle(move, fromCoords, toCoords, onComplete) {
      const profile = this.getProfile(move.piece);
      const cell = this.getCellSize();

      const width = this.canvas
        ? this.canvas.width
        : cell * 9;

      const height = this.canvas
        ? this.canvas.height
        : cell * 9;

      const radius = Math.min(
        cell * 1.05,
        width * 0.22,
        height * 0.22
      );

      const margin = Math.min(
        radius + cell * 0.45,
        width / 2,
        height / 2
      );

      const bearing = Math.atan2(
        toCoords.y - fromCoords.y,
        toCoords.x - fromCoords.x
      );

      let pool = PATTERNS;

      if (move.piece.type === 'n') {
        pool = [
          'pursuit',
          'passes',
          'figureEight',
          'circle',
        ];
      } else if (move.piece.type === 'r') {
        pool = [
          'broadside',
          'broadside',
          'circle',
          'passes',
        ];
      }

      const battle = {
        move,
        profile,
        cell,
        radius,
        bearing,
        center: {
          x: clamp(toCoords.x, margin, width - margin),
          y: clamp(toCoords.y, margin, height - margin),
        },
        fromCoords: { ...fromCoords },
        toCoords: { ...toCoords },
        pattern: choose(pool),
        direction: Math.random() < 0.5 ? -1 : 1,
        phase: random(0, Math.PI * 2),
        elapsed: 0,
        duration: profile.duration,
        explosionTime: profile.duration - 1.35,
        attackerPos: {
          ...fromCoords,
          angle: bearing,
        },
        defenderPos: {
          ...toCoords,
          angle: bearing + Math.PI,
          opacity: 1,
        },
        salvos: [],
        projectiles: [],
        particles: [],
        shockwaves: [],
        trails: {
          attacker: [],
          defender: [],
        },
        trailClock: 0,
        shakeAmount: 0,
        isDestroyed: false,
        finalStart: null,
        onComplete,
      };

      const fireStart = 1.25;
      const fireEnd = battle.explosionTime - 1.0;

      // Every attacker alternates phasers with its assigned torpedo.
      // Every defender uses its own assigned torpedo, not the attacker's.
      for (let i = 0; i < profile.shots; i++) {
        const time = lerp(
          fireStart,
          fireEnd,
          (i + 0.3) / profile.shots
        );

        const attackerWeapon = i % 2 === 0
          ? 'phaser'
          : this.getTorpedo(battle, 'attacker');

        this.addSalvo(
          battle,
          time,
          'attacker',
          attackerWeapon,
          { miss: Math.random() < 0.2 }
        );

        if (i % 2 === 0 && time + 0.22 < fireEnd) {
          const defenderWeapon = i % 4 === 0
            ? 'phaser'
            : this.getTorpedo(battle, 'defender');

          this.addSalvo(
            battle,
            time + 0.22,
            'defender',
            defenderWeapon,
            { miss: Math.random() < 0.35 }
          );
        }
      }

      // Optional spread uses only the firing ship's assigned torpedo.
      if (Math.random() < 0.75) {
        const time = lerp(
          fireStart,
          fireEnd,
          random(0.25, 0.65)
        );

        const actor = Math.random() < 0.7
          ? 'attacker'
          : 'defender';

        const torpedo = this.getTorpedo(battle, actor);

        for (let i = 0; i < 3; i++) {
          this.addSalvo(
            battle,
            time + i * 0.1,
            actor,
            torpedo,
            { miss: i === 0 && Math.random() < 0.5 }
          );
        }
      }

      // Final combination: phaser followed by the correct torpedo.
      this.addSalvo(
        battle,
        battle.explosionTime - 0.65,
        'attacker',
        'phaser'
      );

      this.addSalvo(
        battle,
        battle.explosionTime - 0.43,
        'attacker',
        this.getTorpedo(battle, 'attacker'),
        { finisher: true }
      );

      battle.salvos.sort((a, b) => a.time - b.time);

      this.activeGlide = null;
      this.activeBattle = battle;
    }

    patternPosition(battle, actor, time) {
      const defender = actor === 'defender';
      const sign = defender ? -1 : 1;
      const offset = defender ? Math.PI : 0;

      const w = time * battle.profile.speed;
      const a = battle.phase + battle.direction * w * 1.65;
      const r = battle.radius;

      let x;
      let y;

      switch (battle.pattern) {
        case 'passes': {
          const phase = a + offset;
          x = Math.sin(phase) * r;
          y = Math.cos(phase) * r * 0.62;
          break;
        }

        case 'pursuit': {
          const phase = a + (defender ? 0.95 : 0);
          x = Math.cos(phase) * r * 0.9;
          y = Math.sin(phase) * r * 0.65;
          y += Math.sin(phase * 2) * r * 0.14;
          break;
        }

        case 'figureEight': {
          const phase = a + (
            defender ? Math.PI * 0.65 : 0
          );

          x = Math.sin(phase) * r;
          y = Math.sin(phase * 2) * r * 0.42;
          break;
        }

        case 'broadside': {
          x = Math.sin(a) * r * 0.9;
          y = sign * r * 0.48
            + Math.cos(a) * r * 0.22;
          break;
        }

        case 'circle':
        default: {
          const phase = a + offset;
          const pulse = 0.86 + 0.12 * Math.sin(w * 1.4);

          x = Math.cos(phase) * r * pulse;
          y = Math.sin(phase) * r * pulse;
          break;
        }
      }

      y += Math.sin(w * 3.2 + offset) * r * 0.06;

      const cos = Math.cos(battle.bearing);
      const sin = Math.sin(battle.bearing);

      return {
        x: battle.center.x + x * cos - y * sin,
        y: battle.center.y + x * sin + y * cos,
      };
    }

    flightPosition(battle, actor, elapsed) {
      const start = actor === 'attacker'
        ? battle.fromCoords
        : battle.toCoords;

      const entry = this.patternPosition(battle, actor, 0);

      if (elapsed < 1) {
        const t = smooth(elapsed);
        const bend = Math.sin(Math.PI * t)
          * battle.cell * 0.35;

        const sign = actor === 'attacker' ? 1 : -1;

        return {
          x: lerp(start.x, entry.x, t)
            - Math.sin(battle.bearing) * bend * sign,
          y: lerp(start.y, entry.y, t)
            + Math.cos(battle.bearing) * bend * sign,
        };
      }

      return this.patternPosition(
        battle,
        actor,
        elapsed - 1
      );
    }

    startGlide(move, fromCoords, toCoords, onComplete) {
      this.activeBattle = null;

      this.activeGlide = {
        move,
        fromCoords: { ...fromCoords },
        toCoords: { ...toCoords },
        current: { ...fromCoords },
        elapsed: 0,
        duration: 0.45,
        onComplete,
      };
    }

    finishAnimation(animation, isBattle) {
      const finish = animation.onComplete;

      if (isBattle) {
        this.activeBattle = null;
      } else {
        this.activeGlide = null;
      }

      this.onShake(0);
      this.clearCanvas();

      if (finish) finish();
    }

    skipAnimation() {
      if (this.activeBattle) {
        this.finishAnimation(this.activeBattle, true);
        return true;
      }

      if (this.activeGlide) {
        this.finishAnimation(this.activeGlide, false);
        return true;
      }

      return false;
    }

    isBusy() {
      return Boolean(this.activeBattle || this.activeGlide);
    }

    update(dt) {
      if (this.activeBattle) {
        this.updateBattle(dt);
      } else if (this.activeGlide) {
        this.updateGlide(dt);
      }
    }

    updateGlide(dt) {
      const glide = this.activeGlide;
      glide.elapsed += dt;

      const t = smooth(glide.elapsed / glide.duration);

      glide.current.x = lerp(
        glide.fromCoords.x,
        glide.toCoords.x,
        t
      );

      glide.current.y = lerp(
        glide.fromCoords.y,
        glide.toCoords.y,
        t
      );

      if (glide.elapsed >= glide.duration) {
        this.finishAnimation(glide, false);
      }
    }

    fire(battle, salvo) {
      const source = this.getActor(battle, salvo.actor);
      const target = this.getTarget(battle, salvo.actor);

      // Enforce loadouts at launch, even if a schedule is edited.
      const type = salvo.type === 'phaser'
        ? 'phaser'
        : this.getTorpedo(battle, salvo.actor);

      const weapon = WEAPONS[type];

      this.playSound(weapon.sound);

      const missAngle = random(0, Math.PI * 2);
      const missDistance = salvo.miss
        ? battle.cell * 0.55
        : 0;

      const shot = {
        type,
        actor: salvo.actor,
        miss: salvo.miss,
        finisher: Boolean(salvo.finisher),
        x: source.x,
        y: source.y,
        age: 0,
        duration: weapon.duration,
        offsetX: Math.cos(missAngle) * missDistance,
        offsetY: Math.sin(missAngle) * missDistance,
        bend: random(-1, 1) * battle.cell * 0.3,
        sourceX: source.x,
        sourceY: source.y,
      };

      shot.targetX = target.x + shot.offsetX;
      shot.targetY = target.y + shot.offsetY;

      battle.projectiles.push(shot);
    }

    updateBattle(dt) {
      const battle = this.activeBattle;
      battle.elapsed += dt;

      const t = battle.elapsed;

      battle.shakeAmount = Math.max(
        0,
        battle.shakeAmount - dt * 28
      );

      // Both ships maneuver until the decisive destruction moment.
      if (!battle.isDestroyed) {
        const flightTime = Math.min(
          t,
          battle.explosionTime
        );

        for (const actor of ['attacker', 'defender']) {
          const pos = this.getActor(battle, actor);

          const point = this.flightPosition(
            battle,
            actor,
            flightTime
          );

          const next = this.flightPosition(
            battle,
            actor,
            flightTime + 0.025
          );

          pos.x = point.x;
          pos.y = point.y;

          const dx = next.x - point.x;
          const dy = next.y - point.y;

          if (Math.hypot(dx, dy) > 0.01) {
            pos.angle = Math.atan2(dy, dx);
          }
        }

        // Keep the two ship images separated on crossing paths.
        const dx = battle.defenderPos.x - battle.attackerPos.x;
        const dy = battle.defenderPos.y - battle.attackerPos.y;
        const distance = Math.hypot(dx, dy);
        const minimum = battle.cell * 0.62;

        if (distance < minimum) {
          const angle = distance > 0.01
            ? Math.atan2(dy, dx)
            : battle.bearing + Math.PI / 2;

          const correction = (minimum - distance) / 2;
          const ox = Math.cos(angle) * correction;
          const oy = Math.sin(angle) * correction;

          battle.attackerPos.x -= ox;
          battle.attackerPos.y -= oy;
          battle.defenderPos.x += ox;
          battle.defenderPos.y += oy;
        }
      }

      // Launch scheduled weapon exchanges.
      for (const salvo of battle.salvos) {
        if (
          !salvo.fired &&
          t >= salvo.time &&
          !battle.isDestroyed
        ) {
          salvo.fired = true;
          this.fire(battle, salvo);
        }
      }

      // Update phasers and torpedoes.
      for (
        let i = battle.projectiles.length - 1;
        i >= 0;
        i--
      ) {
        const shot = battle.projectiles[i];
        shot.age += dt;

        const source = this.getActor(battle, shot.actor);
        const target = this.getTarget(battle, shot.actor);

        shot.targetX = target.x + shot.offsetX;
        shot.targetY = target.y + shot.offsetY;

        if (shot.type !== 'phaser') {
          const u = clamp(
            shot.age / shot.duration,
            0,
            1
          );

          const dx = shot.targetX - shot.sourceX;
          const dy = shot.targetY - shot.sourceY;
          const distance = Math.hypot(dx, dy) || 1;
          const curve = Math.sin(Math.PI * u) * shot.bend;

          shot.x = lerp(
            shot.sourceX,
            shot.targetX,
            u
          ) - (dy / distance) * curve;

          shot.y = lerp(
            shot.sourceY,
            shot.targetY,
            u
          ) + (dx / distance) * curve;
        } else {
          // Phasers remain connected to the moving ship centers.
          source.angle = Math.atan2(
            shot.targetY - source.y,
            shot.targetX - source.x
          );
        }

        if (shot.age >= shot.duration) {
          if (!shot.miss && !shot.finisher) {
            this.addBurst(
              battle,
              target.x,
              target.y,
              WEAPONS[shot.type].color,
              7,
              false
            );

            battle.shakeAmount = Math.max(
              battle.shakeAmount,
              2
            );

            // Existing audio function name only.
            // This does not introduce shields.
            this.playSound('playShieldBlock');
          }

          battle.projectiles.splice(i, 1);
        }
      }

      // The legal capturing ship always wins.
      if (
        !battle.isDestroyed &&
        t >= battle.explosionTime
      ) {
        battle.isDestroyed = true;
        battle.projectiles.length = 0;

        battle.finalStart = {
          x: battle.attackerPos.x,
          y: battle.attackerPos.y,
          angle: battle.attackerPos.angle,
        };

        this.playSound('playChiptuneExplosion');

        this.addBurst(
          battle,
          battle.defenderPos.x,
          battle.defenderPos.y,
          '#ff8930',
          65,
          true
        );

        battle.shakeAmount = 9;
      }

      // Winner returns to the legal destination square.
      if (battle.isDestroyed) {
        const u = smooth(
          (t - battle.explosionTime) /
          (battle.duration - battle.explosionTime)
        );

        battle.attackerPos.x = lerp(
          battle.finalStart.x,
          battle.toCoords.x,
          u
        );

        battle.attackerPos.y = lerp(
          battle.finalStart.y,
          battle.toCoords.y,
          u
        );

        const dx = battle.toCoords.x - battle.finalStart.x;
        const dy = battle.toCoords.y - battle.finalStart.y;

        if (Math.hypot(dx, dy) > 1) {
          battle.attackerPos.angle = Math.atan2(dy, dx);
        }

        battle.defenderPos.opacity = Math.max(
          0,
          1 - (t - battle.explosionTime) / 0.35
        );
      }

      // Fading flight trails.
      battle.trailClock += dt;

      if (battle.trailClock >= 0.035) {
        battle.trailClock = 0;

        for (const actor of ['attacker', 'defender']) {
          if (
            actor === 'defender' &&
            battle.isDestroyed
          ) {
            continue;
          }

          const pos = this.getActor(battle, actor);
          const piece = this.getPiece(battle, actor);

          battle.trails[actor].push({
            x: pos.x,
            y: pos.y,
            life: 0.32,
            color: piece && piece.color === 'w'
              ? '#38bdf8'
              : '#ef4444',
          });
        }
      }

      for (const trail of Object.values(battle.trails)) {
        for (let i = trail.length - 1; i >= 0; i--) {
          trail[i].life -= dt;

          if (trail[i].life <= 0) {
            trail.splice(i, 1);
          }
        }
      }

      // Hull sparks and explosion debris.
      for (
        let i = battle.particles.length - 1;
        i >= 0;
        i--
      ) {
        const particle = battle.particles[i];

        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;

        const drag = Math.exp(-2 * dt);
        particle.vx *= drag;
        particle.vy *= drag;

        if (particle.life <= 0) {
          battle.particles.splice(i, 1);
        }
      }

      // Shockwaves are impact/explosion effects, not shields.
      for (
        let i = battle.shockwaves.length - 1;
        i >= 0;
        i--
      ) {
        const wave = battle.shockwaves[i];

        wave.radius += wave.speed * dt;
        wave.opacity -= dt * 1.7;

        if (wave.opacity <= 0) {
          battle.shockwaves.splice(i, 1);
        }
      }

      this.onShake(battle.shakeAmount);

      if (t >= battle.duration) {
        this.finishAnimation(battle, true);
      }
    }

    addBurst(battle, x, y, color, count, large) {
      const palette = large
        ? ['#ffffff', '#ffd580', '#ff8930', '#ff4030']
        : [color];

      for (let i = 0; i < count; i++) {
        const angle = random(0, Math.PI * 2);

        const speed = battle.cell * (
          large
            ? random(0.5, 2.1)
            : random(0.2, 0.7)
        );

        const life = large
          ? random(0.45, 1.1)
          : random(0.15, 0.35);

        battle.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: Math.max(
            1,
            battle.cell * (
              large ? random(0.015, 0.05) : 0.02
            )
          ),
          color: palette[i % palette.length],
        });
      }

      battle.shockwaves.push({
        x,
        y,
        radius: 3,
        speed: battle.cell * (large ? 1.4 : 0.45),
        opacity: 1,
        color,
      });
    }

    clearCanvas() {
      if (!this.ctx || !this.canvas) return;

      this.ctx.clearRect(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
    }

    render(drawPieceFn) {
      if (!this.ctx || !this.canvas) return;
      this.clearCanvas();

      const ctx = this.ctx;

      if (this.activeGlide) {
        const glide = this.activeGlide;

        drawPieceFn(
          ctx,
          glide.move.piece,
          glide.current.x,
          glide.current.y,
          1
        );

        return;
      }

      const battle = this.activeBattle;
      if (!battle) return;

      // Draw trails behind the actual PNG ships.
      for (const trail of Object.values(battle.trails)) {
        for (let i = 1; i < trail.length; i++) {
          const previous = trail[i - 1];
          const current = trail[i];

          ctx.save();
          ctx.globalAlpha = clamp(
            current.life / 0.32,
            0,
            1
          ) * 0.3;

          ctx.strokeStyle = current.color;
          ctx.lineWidth = Math.max(
            1,
            battle.cell * 0.025
          );

          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(current.x, current.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (battle.defenderPos.opacity > 0) {
        drawPieceFn(
          ctx,
          battle.move.captured,
          battle.defenderPos.x,
          battle.defenderPos.y,
          battle.defenderPos.opacity,
          battle.defenderPos.angle
        );
      }

      drawPieceFn(
        ctx,
        battle.move.piece,
        battle.attackerPos.x,
        battle.attackerPos.y,
        1,
        battle.attackerPos.angle
      );

      for (const shot of battle.projectiles) {
        const weapon = WEAPONS[shot.type];
        const source = this.getActor(battle, shot.actor);

        ctx.save();
        ctx.shadowColor = weapon.color;
        ctx.shadowBlur = 10;

        if (shot.type === 'phaser') {
          // Red-orange phaser with a bright central beam.
          ctx.strokeStyle = weapon.color;
          ctx.lineWidth = Math.max(
            2,
            battle.cell * 0.04
          );

          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(shot.targetX, shot.targetY);
          ctx.stroke();

          ctx.strokeStyle = weapon.core;
          ctx.lineWidth = Math.max(
            1,
            battle.cell * 0.012
          );
          ctx.stroke();
        } else {
          const angle = Math.atan2(
            shot.targetY - shot.y,
            shot.targetX - shot.x
          );

          const radius = Math.max(
            2,
            battle.cell * (
              shot.type === 'quantum' ? 0.045 : 0.04
            )
          );

          ctx.translate(shot.x, shot.y);
          ctx.rotate(angle);

          // Colored torpedo trail.
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = weapon.color;
          ctx.lineWidth = radius;
          ctx.beginPath();
          ctx.moveTo(-radius * 4, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();

          // Photon = red; quantum = whitish blue.
          ctx.globalAlpha = 1;
          ctx.fillStyle = weapon.color;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = weapon.core;
          ctx.beginPath();
          ctx.arc(
            0,
            0,
            radius * 0.45,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        ctx.restore();
      }

      for (const wave of battle.shockwaves) {
        ctx.save();
        ctx.strokeStyle = wave.color;
        ctx.globalAlpha = Math.max(0, wave.opacity);
        ctx.lineWidth = 2;
        ctx.shadowColor = wave.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(
          wave.x,
          wave.y,
          wave.radius,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }

      for (const particle of battle.particles) {
        ctx.save();
        ctx.globalAlpha = clamp(
          particle.life / particle.maxLife,
          0,
          1
        );

        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 6;

        ctx.beginPath();
        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    }
  }

  global.BattleEngine = BattleEngine;
})(window);