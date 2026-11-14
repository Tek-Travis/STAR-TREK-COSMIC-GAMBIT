// Cosmic Armada Gambit — shared fleet registry for BOTH sides.
// Edit fleet names, palettes, sizes and numbered folders here.
// Colors are editable art-direction defaults, not canon claims.
(function(global){
  'use strict';

  const TYPES=['p','n','b','r','q','k'];

  const FILES={
    p:'pawn',
    n:'knight',
    b:'bishop',
    r:'rook',
    q:'queen',
    k:'king'
  };

  const ORIGINAL_SHIPS={
    p:'./assets/images/ship_pawn_scout.png',
    n:'./assets/images/ship_knight_destroyer.png',
    b:'./assets/images/ship_bishop_frigate.png',
    r:'./assets/images/ship_rook_cruiser.png',
    q:'./assets/images/ship_queen_dreadnought.png',
    k:'./assets/images/ship_king_flagship.png'
  };

  // Percentages of the existing 72%-of-square ship holder.
  // Preserved exactly.
  const DEFAULT_SIZES={
    p:25,
    n:65,
    b:65,
    r:45,
    q:120,
    k:120
  };

  // Federation is the default for either side.
  // The internal ID remains "player" for existing-save compatibility.
  const DEFAULT_IDS={
    w:'player',
    b:'player'
  };

  const originalWeapons=()=>({
    phaser:{
      color:'#ff652f',
      core:'#ffe1bf'
    },
    photon:{
      color:'#ff3030',
      core:'#ffd0c0'
    },
    quantum:{
      color:'#d9f4ff',
      core:'#ffffff'
    }
  });

  function makeFleet(id,name,phaser,photon,quantum,core){
    return {
      id:String(id),
      name,
      folder:`./assets/images/enemy-fleets/${id}`,
      sizes:{...DEFAULT_SIZES},
      artForwardAngle:0,
      trail:phaser,
      primary:phaser,
      accent:core,
      hull:'#252129',
      weapons:{
        phaser:{
          color:phaser,
          core
        },
        photon:{
          color:photon,
          core
        },
        quantum:{
          color:quantum,
          core
        }
      }
    };
  }

  const FLEETS={
    player:{
      id:'player',
      name:'Federation',
      ships:{...ORIGINAL_SHIPS},
      sizes:{...DEFAULT_SIZES},
      artForwardAngle:0,
      trail:'#38bdf8',
      hull:'#0f2942',
      accent:'#fbbf24',
      primary:'#38bdf8',
      weapons:originalWeapons()
    },

    '1':makeFleet(
      1,
      'Klingon',
      '#70dd45',
      '#ff493d',
      '#b8ff70',
      '#eeffda'
    ),

    '2':makeFleet(
      2,
      'Romulan',
      '#30d6b0',
      '#7aff90',
      '#63ffe0',
      '#ddfff5'
    ),

    '3':makeFleet(
      3,
      'Cardassian',
      '#ffb02e',
      '#ff773d',
      '#ffe77a',
      '#fff1cc'
    ),

    '4':makeFleet(
      4,
      'Borg',
      '#adff32',
      '#55ef00',
      '#d3ff82',
      '#f0ffd9'
    ),

    '5':makeFleet(
      5,
      'Dominion',
      '#b67bff',
      '#a65cff',
      '#e6cfff',
      '#f6ebff'
    )
  };

  function normalizeFleetId(value,fallback='player'){
    const id=String(value);

    if(Object.prototype.hasOwnProperty.call(FLEETS,id)){
      return id;
    }

    return Object.prototype.hasOwnProperty.call(
      FLEETS,
      String(fallback)
    )
      ? String(fallback)
      : 'player';
  }

  function listFleets(){
    return [
      FLEETS.player,
      ...Object.values(FLEETS).filter(f=>f.id!=='player')
    ];
  }

  function getFleetById(id,fallback='player'){
    return FLEETS[normalizeFleetId(id,fallback)];
  }

  function getFleet(piece,selections=DEFAULT_IDS){
    const side=piece&&piece.color==='b'?'b':'w';

    return getFleetById(
      selections&&selections[side],
      DEFAULT_IDS[side]
    );
  }

  function getShip(piece,selections=DEFAULT_IDS){
    const side=piece&&piece.color==='b'?'b':'w';

    const type=piece&&TYPES.includes(piece.type)
      ? piece.type
      : 'p';

    const fleet=getFleet(piece,selections);

    const src=fleet.ships&&fleet.ships[type]
      ? fleet.ships[type]
      : `${fleet.folder}/${FILES[type]}.png`;

    const customAngle=
      fleet.restingAngles&&fleet.restingAngles[side];

    return {
      fleet,
      src,
      fallbackSrc:ORIGINAL_SHIPS[type],

      size:Number.isFinite(fleet.sizes&&fleet.sizes[type])
        ? fleet.sizes[type]
        : DEFAULT_SIZES[type],

      // Heading belongs to the SIDE, not the selected faction.
      rotation:Number.isFinite(customAngle)
        ? customAngle
        : side==='w'
          ? -Math.PI/2
          : Math.PI/2,

      artForwardAngle:Number.isFinite(fleet.artForwardAngle)
        ? fleet.artForwardAngle
        : 0
    };
  }

  global.ArmadaFactions={
    types:TYPES,
    files:FILES,
    fleets:FLEETS,
    defaultIds:{...DEFAULT_IDS},
    normalizeFleetId,
    listFleets,
    getFleetById,
    getFleet,
    getShip
  };

})(window);