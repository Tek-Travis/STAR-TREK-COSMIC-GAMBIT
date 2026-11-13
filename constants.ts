export const CONFIG = {
  title: {
    value: 'Cosmic Armada Gambit',
    type: 'string',
    label: 'Game Title',
    group: 'GAME',
  },
  baseCanvasWidth: {
    value: 1280,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'GAME',
  },
  baseCanvasHeight: {
    value: 800,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'GAME',
  },

  // System Constants for loop
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'SYSTEM',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'SYSTEM',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'SYSTEM',
  },

  // Thematic elements
  backgroundColor: {
    value: '#030712',
    type: 'color',
    label: 'Background Color',
    group: 'THEME',
  },
  primaryColor: {
    value: '#38bdf8',
    type: 'color',
    label: 'Primary Color',
    group: 'THEME',
  },
  fontFamily: {
    value: 'Orbitron, Rajdhani, sans-serif',
    type: 'string',
    label: 'Font Family',
    group: 'THEME',
  },

  // Standard audio levels
  defaultMusicVolume: {
    value: 0.45,
    type: 'number',
    label: 'Default Music Volume',
    group: 'AUDIO',
  },
  defaultSfxVolume: {
    value: 0.65,
    type: 'number',
    label: 'Default SFX Volume',
    group: 'AUDIO',
  },

  // Rules and Gameplay
  aiDifficulty: {
    value: 2,
    type: 'number',
    label: 'AI Tactical Level',
    group: 'Rules',
  },
  battleDuration: {
    value: 5.5,
    type: 'number',
    label: 'Battle Salvo Duration (s)',
    group: 'Rules',
  },
  laserVolleys: {
    value: 4,
    type: 'number',
    label: 'Beam Volleys',
    group: 'Rules',
  },
  torpedoVolleys: {
    value: 3,
    type: 'number',
    label: 'Torpedo Volleys',
    group: 'Rules',
  },
  cameraShakeIntensity: {
    value: 12,
    type: 'number',
    label: 'Impact Shake Intensity',
    group: 'Rules',
  },

  // Asset configurations derived from read_assets_metadata
  assetBgSpaceAspectRatio: {
    value: 1.7916,
    type: 'number',
    label: 'Space Background Aspect Ratio',
    group: 'ASSETS',
  },
  assetShipPawnAspectRatio: {
    value: 1.2518,
    type: 'number',
    label: 'Pawn Corvette Aspect Ratio',
    group: 'ASSETS',
  },
  assetShipKnightAspectRatio: {
    value: 1.3597,
    type: 'number',
    label: 'Knight Destroyer Aspect Ratio',
    group: 'ASSETS',
  },
  assetShipBishopAspectRatio: {
    value: 3.3586,
    type: 'number',
    label: 'Bishop Frigate Aspect Ratio',
    group: 'ASSETS',
  },
  assetShipRookAspectRatio: {
    value: 2.7317,
    type: 'number',
    label: 'Rook Cruiser Aspect Ratio',
    group: 'ASSETS',
  },
  assetShipQueenAspectRatio: {
    value: 1.5967,
    type: 'number',
    label: 'Queen Dreadnought Aspect Ratio',
    group: 'ASSETS',
  },
  assetShipKingAspectRatio: {
    value: 1.0047,
    type: 'number',
    label: 'King Flagship Aspect Ratio',
    group: 'ASSETS',
  },
  assetWeaponBeamAspectRatio: {
    value: 3.5183,
    type: 'number',
    label: 'Beam Lance Aspect Ratio',
    group: 'ASSETS',
  },
  assetWeaponRedTorpedoAspectRatio: {
    value: 0.7357,
    type: 'number',
    label: 'Red Torpedo Aspect Ratio',
    group: 'ASSETS',
  },
  assetWeaponBlueTorpedoAspectRatio: {
    value: 1.0015,
    type: 'number',
    label: 'Blue Torpedo Aspect Ratio',
    group: 'ASSETS',
  },
};

// Merge customized config values if present (injected by Playground)
const {playgroundConfig} = globalThis as {
  playgroundConfig?: Record<string, unknown>;
};
if (playgroundConfig) {
  for (const [key, value] of Object.entries(playgroundConfig)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], {value});
    }
  }
}

/** Type helper for reading values in game code */
export type ConfigKey = keyof typeof CONFIG;

export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}

export interface FactionTheme {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  glowColor: string;
  bannerBg: string;
  description: string;
}

export const FACTIONS: Record<string, FactionTheme> = {
  generic: {
    id: 'generic',
    name: 'Generic',
    primaryColor: '#94a3b8',
    accentColor: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.7)',
    bannerBg: 'from-slate-800 to-slate-950',
    description: 'Standard high-readability tactical armada with balanced spectral telemetry.',
  },
  coalition: {
    id: 'coalition',
    name: 'Stellar Coalition',
    primaryColor: '#38bdf8',
    accentColor: '#fbbf24',
    glowColor: 'rgba(56, 189, 248, 0.8)',
    bannerBg: 'from-cyan-900 to-blue-950',
    description: 'Allied democratic exploration fleet with high-luminance azure defense screens.',
  },
  collective: {
    id: 'collective',
    name: 'Cyber Collective',
    primaryColor: '#34d399',
    accentColor: '#10b981',
    glowColor: 'rgba(52, 211, 153, 0.8)',
    bannerBg: 'from-emerald-950 to-teal-950',
    description: 'Synchronized biomechanical network armed with lethal sub-space assimilation arrays.',
  },
  union: {
    id: 'union',
    name: 'Obsidian Union',
    primaryColor: '#f59e0b',
    accentColor: '#d97706',
    glowColor: 'rgba(245, 158, 11, 0.8)',
    bannerBg: 'from-amber-950 to-neutral-950',
    description: 'Disciplined militaristic order deploying reinforced dreadnought hulls and amber lances.',
  },
  legion: {
    id: 'legion',
    name: 'Crimson Legion',
    primaryColor: '#ef4444',
    accentColor: '#f97316',
    glowColor: 'rgba(239, 68, 68, 0.85)',
    bannerBg: 'from-red-950 to-rose-950',
    description: 'Aggressive warlord armada utilizing incandescent plasma salvos and armor-shredding prow rams.',
  },
  enclave: {
    id: 'enclave',
    name: 'Shadow Enclave',
    primaryColor: '#c084fc',
    accentColor: '#a855f7',
    glowColor: 'rgba(192, 132, 252, 0.8)',
    bannerBg: 'from-purple-950 to-slate-950',
    description: 'Stealth-cloaked enigma fleet employing phase-shifting frigate tactics and quantum warheads.',
  },
};
