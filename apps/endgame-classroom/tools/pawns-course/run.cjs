// Regenerates courses/connected-pawns-course.pgn: pick positions, verify lines, write and re-check the PGN.
//   npm run course:pawns        (KIT_CACHE=1 keeps the solved tables on disk between runs)
require('./search.cjs'); // writes .out/picked.json
require('./build.cjs'); // verifies every line on real FENs, writes .out/lines.json
require('./pgnout.cjs'); // writes ../../courses/connected-pawns-course.pgn, reads it back and verifies it again
require('./check.cjs'); // the independent check (another solver, chess.js, marks, variety)
