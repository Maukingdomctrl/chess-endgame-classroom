// How this course is checked (../course-kit/verify.cjs): every line to checkmate, by distance to mate.
module.exports = { goal: 'mate', probe: require('../course-kit/solver.cjs').probe };
