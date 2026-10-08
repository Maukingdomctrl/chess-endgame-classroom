// Regenerates courses/king-and-pawn-course.pgn: solve KPK, pick positions, verify lines, write PGN.
//   npm run course:kpk
require('./search.cjs'); // writes .out/picked.json
require('./build.cjs'); // verifies every line on real FENs, writes .out/lines.json
require('./pgnout.cjs'); // writes ../../courses/king-and-pawn-course.pgn
