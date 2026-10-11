// How this course is checked (../course-kit/verify.cjs): the blueprint's measure (plies to a safe promotion,
// the King & Pawn solver), the learner is White in every line (also when Black moves first), and a line is
// checked as a win when its start is won, as a hold when it is drawn (the defending lines).
const { VERIFY } = require('../course-kit/curricula/opposition/direct-opposition.cjs');
module.exports = { ...VERIFY, objective: 'auto', learner: 'w' };
