// ==========================================================================
// Cosmic Armada Gambit — Local MP3 Audio Controller
// Preserves the existing ArmadaAudio interface used by the game.
// ==========================================================================

(function(global) {
  'use strict';

  const SOUND_FILES = {
    background: './assets/audio/BACKGROUND.mp3',
    destroyed: './assets/audio/DESTROYED.mp3',
    intro: './assets/audio/INTRO.mp3',
    phaser: './assets/audio/PHASER.mp3',
    photon: './assets/audio/PHOTON TORP.mp3',
    quantum: './assets/audio/QUANTUM TORP.mp3',
    select: './assets/audio/SELECT.mp3',
  };

  // Relative levels multiplied by the existing master volume slider.
  const SOUND_LEVELS = {
    background: 0.25,
    destroyed: 1.0,
    intro: 0.85,
    phaser: 0.8,
    photon: 0.9,
    quantum: 0.9,
    select: 0.55,
  };

  class ArmadaAudioPlayer {
    constructor() {
      this.volume = 0.65;
      this.muted = false;
      this.templates = {};
      this.activeSounds = new Set();
      this.reportedErrors = new Set();
      this.maxVoices = 24;
      this.backgroundPending = false;
      this.introPlayed = false;

      try {
        const saved = localStorage.getItem('armada_volume');

        if (saved !== null) {
          const value = Number(saved);

          if (Number.isFinite(value)) {
            this.volume = Math.max(0, Math.min(1, value));
          }
        }
      } catch (error) {
        // Audio still works if browser storage is unavailable.
      }

      this.muted = this.volume === 0;

      Object.entries(SOUND_FILES).forEach(([name, path]) => {
        const audio = new Audio(path);
        audio.preload = 'auto';

        audio.addEventListener('error', () => {
          this.reportError(name);
        });

        this.templates[name] = audio;
      });

      this.background = this.templates.background;
      this.background.loop = true;

      this.applyVolume();
      this.initUnlockListeners();
    }

    reportError(name) {
      if (this.reportedErrors.has(name)) return;

      this.reportedErrors.add(name);

      console.warn(
        'Unable to load or play audio file:',
        SOUND_FILES[name]
      );
    }

    initUnlockListeners() {
      // Retry on later interactions if playback was initially blocked.
      const unlock = () => {
        this.resume();
      };

      window.addEventListener('pointerdown', unlock, {
        passive: true,
      });

      window.addEventListener('keydown', unlock);
    }

    effectiveVolume(name) {
      if (this.muted) return 0;

      return Math.max(
        0,
        Math.min(1, this.volume * (SOUND_LEVELS[name] || 1))
      );
    }

    applyVolume() {
      if (this.background) {
        this.background.volume =
          this.effectiveVolume('background');
      }

      for (const voice of this.activeSounds) {
        voice.audio.volume =
          this.effectiveVolume(voice.name);
      }
    }

    resume() {
      this.startBackground();
    }

    startBackground() {
      if (
        !this.background ||
        this.backgroundPending ||
        !this.background.paused ||
        this.muted ||
        this.volume === 0
      ) {
        return;
      }

      this.background.volume =
        this.effectiveVolume('background');

      this.backgroundPending = true;

      const attempt = this.background.play();

      if (attempt && typeof attempt.then === 'function') {
        attempt.then(() => {
          this.backgroundPending = false;
        }).catch((error) => {
          this.backgroundPending = false;

          // A blocked autoplay attempt can retry on user interaction.
          if (
            error.name !== 'NotAllowedError' &&
            error.name !== 'AbortError'
          ) {
            this.reportError('background');
          }
        });
      } else {
        this.backgroundPending = false;
      }
    }

    stopBackground() {
      this.background.pause();
      this.background.currentTime = 0;
    }

    setVolume(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return;

      this.volume = Math.max(0, Math.min(1, number));
      this.muted = this.volume === 0;

      this.applyVolume();

      try {
        localStorage.setItem(
          'armada_volume',
          String(this.volume)
        );
      } catch (error) {
        // Saving preferences is optional.
      }

      if (!this.muted) {
        this.startBackground();
      }
    }

    getVolume() {
      return this.volume;
    }

    toggleMute() {
      this.muted = !this.muted;
      this.applyVolume();

      if (!this.muted) {
        this.startBackground();
      }

      return this.muted;
    }

    isMuted() {
      return this.muted;
    }

    releaseVoice(voice, stop = false) {
      if (stop) {
        voice.audio.pause();
      }

      voice.audio.onended = null;
      voice.audio.onerror = null;
      this.activeSounds.delete(voice);
    }

    playSound(name) {
      if (
        this.muted ||
        this.volume === 0 ||
        !this.templates[name]
      ) {
        return false;
      }

      // Limit simultaneous sound effects during heavy exchanges.
      if (this.activeSounds.size >= this.maxVoices) {
        const oldest = this.activeSounds.values().next().value;

        if (oldest) {
          this.releaseVoice(oldest, true);
        }
      }

      // Each launch gets its own player so shots can overlap.
      const audio = this.templates[name].cloneNode(true);
      audio.loop = false;
      audio.volume = this.effectiveVolume(name);

      const voice = { audio, name };
      this.activeSounds.add(voice);

      audio.onended = () => {
        this.releaseVoice(voice);
      };

      audio.onerror = () => {
        this.reportError(name);
        this.releaseVoice(voice);
      };

      const attempt = audio.play();

      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch((error) => {
          this.releaseVoice(voice);

          if (
            error.name !== 'NotAllowedError' &&
            error.name !== 'AbortError'
          ) {
            this.reportError(name);
          }
        });
      }

      return true;
    }

    stopAllEffects() {
      for (const voice of [...this.activeSounds]) {
        this.releaseVoice(voice, true);
      }
    }

    // ---- Named MP3 effects ----

    playIntro() {
      if (this.introPlayed) return;

      // Do not mark it played if audio is currently muted.
      this.introPlayed = this.playSound('intro');
      this.startBackground();
    }

    playPhaser() {
      this.playSound('phaser');
    }

    playPhotonTorpedo() {
      this.playSound('photon');
    }

    playQuantumTorpedo() {
      this.playSound('quantum');
    }

    playDestroyed() {
      this.playSound('destroyed');
    }

    playSelect() {
      this.playSound('select');
    }

    // ---- Compatibility with your existing main.js ----

    playArcadeLaser() {
      this.playPhaser();
    }

    playChiptuneExplosion() {
      this.playDestroyed();
    }

    playCrispClick() {
      this.playSelect();
    }

    playConfirmSelect() {
      this.playSelect();
    }

    // No impact recording was supplied.
    playShieldBlock() {}

    // Battle weapons now use explicit photon/quantum methods.
    // Keeping this silent also prevents the old main.js
    // post-capture call from playing an extra launch sound.
    playGunshotBlast() {}

    // No recordings were assigned to these events.
    // Preserve their methods so existing calls remain valid.
    playErrorBuzz() {}
    playVictoryFanfare() {}
    playDefeatMotif() {}
  }

  global.ArmadaAudio = new ArmadaAudioPlayer();
})(window);