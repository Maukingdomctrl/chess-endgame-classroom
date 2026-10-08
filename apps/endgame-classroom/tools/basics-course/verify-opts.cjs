// How this course is checked (../course-kit/verify.cjs): mates by distance to mate from the exact solver;
// king + pawn lines by the fastest safe promotion (the King & Pawn solver), then the piece that mates fastest.
module.exports = { goal: 'promotion', probe: require('../course-kit/solver.cjs').probe };
