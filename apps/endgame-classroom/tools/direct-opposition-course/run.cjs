// Regenerates courses/direct-opposition-course.pgn: fill the blueprint's 100 slots, verify the lines, write and
// re-check the PGN, then the independent check.
//   npm run course:opposition                   # enumerates the candidates first (about 12 minutes)
//   npm run course:opposition -- --from-json    # reuses the saved candidates (feasibility.json): about 2 minutes
require('./search.cjs'); // writes .out/picked.json
require('./build.cjs'); // verifies every line on real FENs, writes .out/lines.json
require('./pgnout.cjs'); // writes ../../courses/direct-opposition-course.pgn, reads it back and verifies it again
require('./check.cjs'); // the independent check (the pawn oracle, chess.js, the blueprint's tasks, variety)
