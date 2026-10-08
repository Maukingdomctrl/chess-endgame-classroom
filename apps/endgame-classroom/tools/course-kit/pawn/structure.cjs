// Structural keys for variety: two positions that only differ by the mirror image (files a <-> h), or by
// which of the two identical pawns is which, are the same position. Square list as in geometry.cjs.
//
// Exact keys (posKey, setupKey, pawnSetKey, kingsKey, pathKey) compare squares. They catch repeated
// positions, but not repeated *ideas*: the same picture shifted one file or one rank is a new key. For
// that there is shapeKey, a deliberately coarse pattern (see below), and wingKey (which pair of files).
// Lesson learned: a fine pattern (exact offsets of the kings) made every line look "different" while
// the course repeated one picture; too strict a cap on a coarse pattern rejected lessons whose idea *is*
// one pattern. Keep the pattern coarse and cap it per group, at about a third of the group.
const { file, rank } = require('../board.cjs');
const { kingToPawns, mirror } = require('./geometry.cjs');

const both = (s) => [s, mirror(s)];
const minKey = (keys) => keys.sort()[0];
const pawnPair = (t) => (t[3] === undefined || t[3] < 0 ? [t[2]] : [Math.min(t[2], t[3]), Math.max(t[2], t[3])]);

/** The whole position. */
const posKey = (s) => minKey(both(s).map((t) => [t[0], t[1], ...pawnPair(t)].join('-')));
/** The white king and the pawns. */
const setupKey = (s) => minKey(both(s).map((t) => [t[0], Math.min(t[2], t[3]), Math.max(t[2], t[3])].join('-')));
/** The pawns alone. */
const pawnSetKey = (s) => minKey(both(s).map((t) => [Math.min(t[2], t[3]), Math.max(t[2], t[3])].join('-')));
/** The two kings. */
const kingsKey = (s) => minKey([[s[0], s[1]], [s[0] ^ 7, s[1] ^ 7]].map((k) => k.join('-')));
/** A walk of the black king (its squares, one per White move). */
const pathKey = (squares) => minKey([squares.join('-'), squares.map((q) => q ^ 7).join('-')]);
/** Which pair of files (a+b = g+h: 0, b+c = f+g: 1, c+d = e+f: 2, d+e: 3). */
const wingKey = (s) => Math.min(Math.min(file(s[2]), file(s[3])), 7 - Math.max(file(s[2]), file(s[3])));

/**
 * The pattern, seen from the front pawn (mirror images alike): side by side (0) or a chain (-1), and where
 * each king stands: ahead / level / behind the front pawn (rank sign), and on the other pawn's side / the
 * front pawn's file / the far side (file sign relative to the other pawn). A white king more than two
 * squares from its pawns counts as "far". Equal keys = the same picture for a learner.
 */
function shapeKey(s) {
  return minKey(both(s).map((t) => {
    const [fp, op] = rank(t[2]) > rank(t[3]) || (rank(t[2]) === rank(t[3]) && t[2] < t[3]) ? [t[2], t[3]] : [t[3], t[2]];
    const zone = (q) => `${Math.sign(rank(q) - rank(fp))}${Math.sign((file(q) - file(fp)) * (file(op) - file(fp)))}`;
    return [rank(op) - rank(fp), zone(t[1]), kingToPawns(t) <= 2 ? zone(t[0]) : 'far'].join('|');
  }));
}

/** The same pattern in words (for reports and docs): { formation, blackKing, whiteKing, wing }. */
function describe(s) {
  const [fp, op] = rank(s[2]) > rank(s[3]) ? [s[2], s[3]] : [s[3], s[2]];
  const where = (q) => {
    const dr = Math.sign(rank(q) - rank(fp)), df = Math.sign((file(q) - file(fp)) * ((file(op) - file(fp)) || 1));
    return `${['behind', 'level', 'ahead'][dr + 1]}, ${['far side', 'front file', 'pawn side'][df + 1]}`;
  };
  return {
    formation: rank(s[2]) === rank(s[3]) ? 'side by side' : 'chain',
    blackKing: where(s[1]),
    whiteKing: kingToPawns(s) <= 2 ? where(s[0]) : 'far',
    wing: ['a+b / g+h', 'b+c / f+g', 'c+d / e+f', 'd+e'][wingKey(s)],
  };
}

module.exports = { posKey, setupKey, pawnSetKey, kingsKey, pathKey, wingKey, shapeKey, describe };
