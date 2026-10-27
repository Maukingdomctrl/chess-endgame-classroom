// How this course is checked (../course-kit/verify.cjs): a win runs to the learner's capture or promotion that
// keeps it (goal 'conversion': the Lucena ends with the safe promotion, the skewer with the rook won); a drawn
// start (the Philidor, White defending) is checked as a hold, measured by the mate tables, to a draw on the
// board. The learner is White in every line.
const solver = require('../course-kit/solver.cjs');
module.exports = { goal: 'conversion', probe: solver.probe, objective: 'auto', learner: 'w' };
