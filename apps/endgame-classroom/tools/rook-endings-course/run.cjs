// Regenerates courses/rook-endings-course.pgn: find the positions and play their lines, verify and explain them,
// write the PGN, read it back and verify it again.
//   npm run course:rook        (KIT_CACHE=1 keeps the five-piece tables between runs)
require('./search.cjs'); // writes .out/picked.json
require('./build.cjs'); // writes .out/lines.json
require('./pgnout.cjs'); // writes ../../courses/rook-endings-course.pgn, reads it back and checks it again
