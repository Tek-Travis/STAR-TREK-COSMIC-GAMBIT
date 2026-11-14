COSMIC ARMADA GAMBIT — INTEGRATED TWO-SIDED FLEET REBUILD
READ THIS BEFORE INSTALLING

1. BACK UP YOUR PROJECT
Keep a separate copy of your current project folder, including chess.js,
audio.js and all artwork. Do not clear browser saved-game storage.

2. REPLACE THESE FIVE FILES TOGETHER
  index.html
  styles.css
  factions.js
  battle.js
  main.js
Put them in your existing game folder beside your actual chess.js and audio.js.
If your entry HTML has another filename, put the supplied HTML contents into
that entry file instead, retaining its filename.
Do not mix this main.js or factions.js with the previous versions.

3. REMOVE THE ADD-ON
Remove dual-fleet-selectors.js from the project and remove any script tag that
loads it. The replacement HTML already omits it. This rebuild does not use it.
There are NO runtime prototype patches, selector injections or extra stylesheets.

4. KEEP YOUR REAL ENGINE, AUDIO AND ARTWORK
chess.js and audio.js are NOT included, replaced, or reimplemented.
No ship PNGs, marker PNGs or background images are included.
No TEST ENGINE or TEST AUDIO FILE is included in this package.
Copying this ZIP alone into a completely empty folder will not create a full game:
it still needs your original chess.js and your existing assets.
Audio is optional; missing or failing audio callbacks no longer stop startup
or a battle animation in the replacement controller/battle files.

5. RELOAD
Reload the game without cached old scripts. Use the existing HTML entry file.
The required local script order is already in the replacement HTML:
  audio.js
  chess.js
  factions.js
  battle.js
  main.js
No server, CDN, API or runtime library has been added.

WHAT CHANGED
PLAYER and ENEMY selectors are now permanent elements in the HTML.
Both are populated directly by main.js from one shared fleet registry.
Both selections are stored on the controller as fleetIds.w and fleetIds.b.
Board images, canvas images and battle palettes all receive that same map.
The player and AI can select different factions or the same faction.
Either side can select any registered fleet, including the original sets.
Resting direction is based on side: White up, Black down, regardless of fleet.
Source artwork orientation remains configurable per fleet.
Both selectors lock during glides, battles, AI thinking and promotion.
Changing a fleet while idle does not reset the board or change AI strength.
New Game retains your two selected factions.
Save/load stores and restores both selections before any AI turn resumes.
Previous version-2 and version-3 saves and older flat saves are handled where
the existing engine accepts their state. Saves without a player choice retain
the current player selection. Invalid IDs fall back to that side's default.
Full engine state is serialized without intentionally dropping rule metadata.

PRESERVED SETTINGS
Neutral gray UI, white text, translucent move markers and board ship shadows.
Marker icon sizes, hidden name labels, and white-side marker grayscale.
Your exact ship-size percentages inside the existing 72% holder:
  Pawn 25; Knight 65; Bishop 65; Rook 45; Queen 120; King 120.
Phasers: all ships.
Photon torpedoes: Pawn / Rook / Bishop.
Quantum torpedoes: Knight / Queen / King.
Weapon profile durations, shot counts and maneuver speeds are preserved.
No faction damage, shields or additional chess rules have been introduced.
Large destruction explosions retain the original warm color palette.

SHARED FACTION ARTWORK
The existing folder names are retained even when a faction is used by White:
  assets/images/enemy-fleets/1/pawn.png
  assets/images/enemy-fleets/1/knight.png
  assets/images/enemy-fleets/1/bishop.png
  assets/images/enemy-fleets/1/rook.png
  assets/images/enemy-fleets/1/queen.png
  assets/images/enemy-fleets/1/king.png
Use the same six names in folders 2, 3, 4 and 5.
The empty numbered folders in the ZIP are only placeholders; no artwork is inside.
There is no need to duplicate faction art into separate player folders.
Missing numbered PNG -> matching original ship PNG -> procedural SVG fallback.
If fallback artwork is in use, several factions can appear to have identical
original ships while their weapon colors differ. This does not mean the selector
failed. Add the appropriate faction PNGs and reload to see different ship models.
Original filenames retained:
 ship_pawn_scout.png, ship_knight_destroyer.png, ship_bishop_frigate.png,
 ship_rook_cruiser.png, ship_queen_dreadnought.png, ship_king_flagship.png.

EDITING FLEETS
Open factions.js. FLEETS is the single registry for both dropdowns.
Defaults: White 'player' (Stellar Coalition), Black '0' (Original AI).
Numbered defaults: 1 Klingon, 2 Romulan, 3 Cardassian, 4 Borg, 5 Dominion.
'Original AI' is just a display name; it is selectable by either side and can
be renamed in the registry if desired.
A numbered entry looks like:
 '1':makeFleet(1,'Klingon','#70dd45','#ff493d','#b8ff70','#eeffda'),
Arguments after the name: phaser color, photon color, quantum color, bright core.
These are editable art-direction suggestions, not canon-color claims.
Adding a new numbered entry and its six images makes it appear in BOTH selectors.
The phaser color also supplies the default trail/fallback-hull accent.
You can override a fleet's sizes independently of the central DEFAULT_SIZES.
Source artForwardAngle defaults to 0 (PNG points right).
For PNGs pointing up, set artForwardAngle:-Math.PI/2 for that fleet.
Optional restingAngles:{w:-Math.PI/2,b:Math.PI/2} can override board headings.
Transparent PNG margins still affect apparent visual size.

STARTUP DIAGNOSTICS
Missing required HTML elements or engine functions now produce a STARTUP ERROR
message in the start dialog instead of an uninformative blank/stuck start screen.
The controller checks the existing ChessEngine methods it already relies on:
 createInitialState, makeMove, getLegalMovesForSquare, findBestMove, findKing.
Optional methods: validateState and getGameStatus.
This is not a substitute for reviewing your real engine if its interface differs.
The original failure's exact cause is NOT established: no console error or actual
chess.js/audio.js file was supplied. This rebuild removes the add-on dependency
and integrates the supplied files consistently; it does not claim a verified
root-cause diagnosis of your previous installation.

VALIDATION PERFORMED
58/58 browser checks passed with the actual replacement HTML/CSS/JS running in
HEADLESS CHROMIUM. Static JS syntax, CSS parsing, unique IDs and script order
also passed. A detailed report is included as TEST_RESULTS.json.
Checked desktop and mobile layout, UI interactions, image fallback decoding,
actual canvas drawing, weapon palette routing, preserved loadouts, moves/skips,
AI callback flow, promotion controls, save/load migration, both preferences,
missing/throwing audio, blocked storage and a real local file:// launch.
IMPORTANT LIMITATION: the browser tests used an API-shaped CHESS TEST DOUBLE,
AUDIO TEST DOUBLES and SYNTHETIC PNG FIXTURES. They were not your engine/audio/art.
The production controller and battle engine were the real replacement files,
not mocks. The fixture files are NOT shipped in this package.
These checks do not verify chess-rule correctness, your actual engine interface,
real audio playback, or your real PNG appearances. The original real-game
failure was not reproduced with your unavailable chess.js and audio.js.
Keep your backup until you confirm the rebuilt UI against those real files.

SAVE STORAGE
Preferences and saves stay in browser localStorage, using the existing keys.
Storage restrictions are handled without crashing the selectors/game. Saving
and remembering selections remain dependent on the browser allowing storage.

PACKAGE CONTENTS
Five complete production replacement files, this installation guide,
TEST_RESULTS.json, and empty numbered artwork directories.
Do not install the older dual-fleet add-on alongside these replacements.
