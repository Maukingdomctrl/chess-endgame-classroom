// Regenerates courses/endgame-basics-course.pgn: solve, pick positions, verify lines, write and re-check the PGN.
//   npm run course:basics
require('./search.cjs'); // writes .out/picked.json
require('./build.cjs'); // verifies every line on real FENs, writes .out/lines.json
require('./pgnout.cjs'); // writes ../../courses/endgame-basics-course.pgn, reads it back and verifies it again
