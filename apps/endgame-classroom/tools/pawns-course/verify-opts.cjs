// How this course is checked (../course-kit/verify.cjs): every line to a safe promotion, measured by the
// toolkit's solver in plies to the promotion (two pawns, or one after Black has taken the other).
const solver = require('../course-kit/solver.cjs');
module.exports = { goal: 'promotion', probe: solver.probe, promotionProbe: solver.probePromotion };
