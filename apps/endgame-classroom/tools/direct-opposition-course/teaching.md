# Direct Opposition: teaching written by hand

The teaching of lines the course does not explain on its own. `pgnout.cjs` reads this file on every run.
For each position here it uses this teaching in place of the generated texts. `teaching.cjs` checks every
claim it can against the board and the engine; a claim it finds false stops the build.

How to edit:

- A position is found by its name and FEN, and its moves must be the line's moves. If the course is
  generated with other lines, the build stops and names the position.
- **Intro**: shown before the first move, after the welcome, the lesson intro and the task ("Pawn on d3.
  Black moves first; then win."). It replaces the generated idea and question, so name the idea and ask a
  question without giving the move away.
- **Note** on a White move: write it without the move. The course puts "Kd4! — " in front (the "!" where
  the engine shows a tempting move that fails). On the first move it adds the tempting mistake ("Kf5? —
  Black gets the opposition. Only a draw now."), and on a move with equal moves it adds "Kd7 wins just as
  fast.".
- **Note** on a Black move: shown together with the note of your move before it, so keep the two to about
  20 words.
- **Note** on the last move: the whole closing note, starting with "Queen!".
- An empty field keeps the generated text or marks; "none" removes the generated note.
- **Marks**: a colour (green, red, blue, yellow), then squares or arrows, e.g. `green d6, e6; arrow red
  e4-f5`. Shown in Learn mode, on the board after that move. Empty keeps the generated red arrows.
- **Theme**: for the writer only (what the note should name); not shown.
- Course 1 does not use the words key square, zugzwang, distant or diagonal opposition, tempo, or odd
  number: they belong to later courses.

---

## Position 1: 01. What the opposition is (1/10)

FEN: `8/8/4k3/8/4K3/3P4/8/8 b - - 0 1` (Black moves first)

- Theme: the side that must move gives way
- Intro: Two kings are contesting the same narrow road, with one square between them. Who will have to give ground first?
- Marks at the start:

### Moves

**1... Kd6** (Black)
- Note: Black has to move, so its king steps aside.
- Theme: Black must give way
- Marks:

**2. Kd4** (White)
- Note: Take the opposition: the kings face across d5. Black must give way.
- Theme: take the opposition
- Marks:

**2... Kc6** (Black)
- Note: Black steps aside, but its king still guards d5.
- Theme: Black gives way
- Marks:

**3. Ke5** (White)
- Note: Your king walks forward, next to the pawn's path.
- Theme: go round the guarded square
- Marks:

**3... Kd7** (Black)
- Note: Black's king gets back in front of the pawn.
- Theme: Black blocks the pawn
- Marks:

**4. Kd5** (White)
- Note: Take the opposition again, across d6.
- Theme: take the opposition
- Marks:

**4... Kc7** (Black)
- Note: Black steps aside, still near the d-file.
- Theme: Black gives way
- Marks:

**5. Ke6** (White)
- Note: King first: your king goes ahead before the pawn moves.
- Theme: king first
- Marks:

**5... Kc6** (Black)
- Note: Black's king comes forward to guard d5, d6 and d7.
- Theme: Black guards the pawn's path
- Marks:

**6. d4** (White)
- Note: Now the pawn steps forward, with your king ahead of it.
- Theme: the pawn advances
- Marks:

**6... Kc7** (Black)
- Note: Black steps back. Your king guards the pawn's path: d5, d6, d7.
- Theme: your king guards the path
- Marks:

**7. d5** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**7... Kd8** (Black)
- Note: Black stands in front of the pawn, on d8.
- Theme: Black blocks the pawn
- Marks:

**8. Kd6** (White)
- Note: Take the opposition across d7; your king also protects the pawn.
- Theme: take the opposition
- Marks:

**8... Kc8** (Black)
- Note: Black steps aside, but still watches d7 and d8.
- Theme: Black gives way
- Marks:

**9. Ke7** (White)
- Note: Your king guards d8, the promotion square.
- Theme: guard the promotion square
- Marks:

**9... Kb7** (Black)
- Note: Black heads for your pawn from the side.
- Theme: Black comes from the side
- Marks:

**10. d6** (White)
- Note: Protected by your king, the pawn steps up. The finish is in sight!
- Theme: the pawn advances
- Marks:

**10... Kc6** (Black)
- Note: Black attacks the pawn, but your king protects it.
- Theme: the pawn is protected
- Marks:

**11. d7** (White)
- Note: The pawn reaches d7, still protected by your king.
- Theme: the pawn advances
- Marks:

**11... Kd5** (Black)
- Note: Black is too late to stop the pawn.
- Theme: too late
- Marks:

**12. d8=Q+** (White)
- Note: Queen! With check, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: When the black king must move, it gives up ground: use it to walk your king forward.

---

## Position 2: 01. What the opposition is (2/10)

FEN: `3k4/8/5P2/3K4/8/8/8/8 w - - 0 1` (White moves first)

- Theme: the opposition clears the pawn's road
- Intro: Your pawn is near the finish, but Black guards the road. Can your king take the opposition and clear the way?
- Marks at the start:

### Moves

**1. Kd6** (White)
- Note: Take the opposition: the kings face across d7.
- Theme: take the opposition
- Marks:

**1... Ke8** (Black)
- Note: Black cannot step forward, so it steps aside.
- Theme: Black gives way
- Marks:

**2. Ke6** (White)
- Note: Take the opposition again, and protect your pawn. Black must give way.
- Theme: take the opposition
- Marks:

**2... Kf8** (Black)
- Note: Black steps in front of the pawn, on f8.
- Theme: Black blocks the pawn
- Marks:

**3. f7** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**3... Kg7** (Black)
- Note: Black has only one move, away from f8.
- Theme: Black is pushed away
- Marks:

**4. Ke7** (White)
- Note: Your king guards f8, the promotion square.
- Theme: guard the promotion square
- Marks:

**4... Kg6** (Black)
- Note: Black cannot stop the pawn now.
- Theme: too late
- Marks:

**5. f8=Q** (White)
- Note: Queen! The pawn reaches f8, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Clear the road with your king first; then your pawn can advance with support.

---

## Position 3: 01. What the opposition is (3/10)

FEN: `2k5/8/8/1K1P4/8/8/8/8 w - - 0 1` (White moves first)

- Theme: king first, then pawn; the step can be diagonal
- Intro: Black's king guards the road ahead of your pawn. Take the opposition first; this time the step is not straight. Which step is it?
- Marks at the start:

### Moves

**1. Kc6** (White)
- Note: Take the opposition with a diagonal step: the kings face across c7.
- Theme: take the opposition
- Marks:

**1... Kb8** (Black)
- Note: Black steps aside, away from the d-file.
- Theme: Black gives way
- Marks:

**2. Kd6** (White, also accepted: Kd7)
- Note: Your king steps in front of the pawn and guards c7.
- Theme: king in front of the pawn
- Marks:

**2... Kb7** (Black)
- Note: Black comes closer, but your king protects the pawn.
- Theme: the pawn is protected
- Marks:

**3. Ke7** (White)
- Note: Your king guards the pawn's path: d6, d7 and d8.
- Theme: your king guards the path
- Marks:

**3... Kb6** (Black)
- Note: Black stays near your pawn. Is it safe?
- Theme: a question before your move
- Marks:

**4. d6** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**4... Kc5** (Black)
- Note: Black attacks the pawn, but your king protects it.
- Theme: the pawn is protected
- Marks:

**5. d7** (White)
- Note: The pawn steps up; your king guards d8.
- Theme: the pawn advances
- Marks:

**5... Kd4** (Black)
- Note: Black cannot reach d8 in time.
- Theme: too late
- Marks:

**6. d8=Q+** (White)
- Note: Queen! With check, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: A diagonal step can take the opposition too. Let your king win the way before the pawn moves.

---

## Position 4: 01. What the opposition is (4/10)

FEN: `8/8/7k/8/7K/6P1/8/8 b - - 0 1` (Black moves first)

- Theme: take the opposition again each time Black gives way
- Intro: The kings face each other on the h-file, with h5 between them. Can your king escort the g-pawn past Black's defence?
- Marks at the start:

### Moves

**1... Kg6** (Black)
- Note: Black has to move. It steps aside, in front of your pawn.
- Theme: Black must give way
- Marks:

**2. Kg4** (White)
- Note: Take the opposition, and keep the pawn protected. Black must give way.
- Theme: take the opposition
- Marks:

**2... Kf6** (Black)
- Note: Black steps aside, but still guards g5.
- Theme: Black gives way
- Marks:

**3. Kh5** (White)
- Note: g5 is guarded, so your king goes round, and the pawn waits.
- Theme: go round the guarded square
- Marks:

**3... Kg7** (Black)
- Note: Black gets back in front of the pawn.
- Theme: Black blocks the pawn
- Marks:

**4. Kg5** (White)
- Note: Take the opposition again, across g6.
- Theme: take the opposition
- Marks:

**4... Kh7** (Black)
- Note: Black steps aside, still guarding g6 and g7.
- Theme: Black gives way
- Marks:

**5. Kf6** (White)
- Note: Your king goes ahead and guards g5, g6 and g7.
- Theme: king ahead of the pawn
- Marks:

**5... Kh8** (Black)
- Note: Black retreats to the corner.
- Theme: Black retreats
- Marks:

**6. g4** (White, also accepted: Kg6)
- Note: The pawn steps up, far from Black's king.
- Theme: the pawn advances
- Marks:

**6... Kg8** (Black)
- Note: Black gets in front of the pawn again.
- Theme: Black blocks the pawn
- Marks:

**7. Kg6** (White)
- Note: Take the opposition again: the kings face across g7.
- Theme: take the opposition
- Marks:

**7... Kh8** (Black)
- Note: Black steps aside, back into the corner.
- Theme: Black gives way
- Marks:

**8. Kh6** (White, also accepted: g5)
- Note: Take the opposition again: Black can only go to g8.
- Theme: take the opposition
- Marks:

**8... Kg8** (Black)
- Note: Black's only move, back in front of the pawn.
- Theme: Black blocks the pawn
- Marks:

**9. g5** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**9... Kf7** (Black)
- Note: Black guards the pawn's path: g6, g7 and g8.
- Theme: Black guards the path
- Marks:

**10. Kh7** (White, also accepted: g6+)
- Note: Your king also guards g6, g7, g8.
- Theme: your king guards the path
- Marks:

**10... Ke6** (Black)
- Note: Black steps away from the pawn's path.
- Theme: Black gives up the path
- Marks:

**11. g6** (White)
- Note: The pawn steps up, right next to your king.
- Theme: the pawn advances
- Marks:

**11... Ke5** (Black)
- Note: Black's king is too slow to catch the pawn.
- Theme: too late
- Marks:

**12. g7** (White)
- Note: The pawn reaches g7; your king guards g8.
- Theme: the pawn advances
- Marks:

**12... Ke4** (Black)
- Note: Nothing can stop the pawn now.
- Theme: too late
- Marks:

**13. g8=Q** (White)
- Note: Queen! The pawn reaches g8, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Keep king and pawn working as a team: one holds ground while the other advances.

---

## Position 5: 01. What the opposition is (5/10)

FEN: `k7/8/1P6/K7/8/8/8/8 w - - 0 1` (White moves first)

- Theme: near the corner, the king still clears the way
- Intro: Black's king sits in the corner, next to your pawn's path. Can your king take the opposition and escort the pawn?
- Marks at the start:

### Moves

**1. Ka6** (White)
- Note: Take the opposition and guard b7. Black must give way.
- Theme: take the opposition
- Marks:

**1... Kb8** (Black)
- Note: Black steps in front of the pawn, on b8.
- Theme: Black blocks the pawn
- Marks:

**2. b7** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**2... Kc7** (Black)
- Note: Black's only move: it has to leave b8.
- Theme: Black is pushed away
- Marks:

**3. Ka7** (White)
- Note: Your king guards b8, the promotion square.
- Theme: guard the promotion square
- Marks:

**3... Kc6** (Black)
- Note: Black cannot stop the pawn now.
- Theme: too late
- Marks:

**4. b8=Q** (White)
- Note: Queen! The pawn reaches b8, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Even near the corner, a well-placed king clears the way for its pawn.

---

## Position 6: 01. What the opposition is (6/10)

FEN: `6k1/8/8/7K/5P2/8/8/8 w - - 0 1` (White moves first)

- Theme: the king leads the pawn, with the right step
- Intro: Your f-pawn needs an escort. Can your king take the opposition before Black blocks the road?
- Marks at the start:

### Moves

**1. Kg6** (White)
- Note: Take the opposition across g7, ahead of your pawn.
- Theme: take the opposition
- Marks:

**1... Kh8** (Black)
- Note: Black steps aside, away from the f-file.
- Theme: Black gives way
- Marks:

**2. Kf6** (White, also accepted: Kf7, f5)
- Note: Your king steps onto the f-file, ahead of the pawn.
- Theme: king ahead of the pawn
- Marks:

**2... Kh7** (Black)
- Note: Black comes out of the corner, still far from the pawn.
- Theme: Black is far away
- Marks:

**3. f5** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**3... Kh6** (Black)
- Note: Black tries to reach your pawn from the side.
- Theme: Black comes from the side
- Marks:

**4. Ke7** (White)
- Note: Your king guards the pawn's path: f6, f7 and f8.
- Theme: your king guards the path
- Marks:

**4... Kg5** (Black)
- Note: Black attacks your pawn. Can you save it?
- Theme: a question before your move
- Marks:

**5. f6** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**5... Kf4** (Black)
- Note: Black's king is left behind the pawn.
- Theme: Black is left behind
- Marks:

**6. f7** (White)
- Note: One step from the finish, and your king guards f8.
- Theme: the pawn advances
- Marks:

**6... Ke4** (Black)
- Note: Too late: Black cannot stop the pawn.
- Theme: too late
- Marks:

**7. f8=Q** (White)
- Note: Queen! The pawn reaches f8, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Let your king lead the way: one wrong step hands Black the opposition.

---

## Position 7: 01. What the opposition is (7/10)

FEN: `5k2/8/6K1/3P4/8/8/8/8 w - - 0 1` (White moves first)

- Theme: king first: the opposition walks the king in front of the pawn
- Intro: Your d-pawn wants to reach d8, but Black's king can come back to block it. Can your king hold the road first?
- Marks at the start:

### Moves

**1. Kf6** (White)
- Note: Take the opposition: the kings face across f7.
- Theme: take the opposition
- Marks:

**1... Ke8** (Black)
- Note: Black steps aside, toward the d-file.
- Theme: Black gives way
- Marks:

**2. Ke6** (White)
- Note: Take the opposition again, and protect your pawn.
- Theme: take the opposition
- Marks:

**2... Kd8** (Black)
- Note: Black steps in front of the pawn, on d8.
- Theme: Black blocks the pawn
- Marks:

**3. Kd6** (White)
- Note: Take the opposition from the square in front of your pawn.
- Theme: take the opposition
- Marks:

**3... Kc8** (Black)
- Note: Black steps aside, but still watches d7 and d8.
- Theme: Black gives way
- Marks:

**4. Ke7** (White)
- Note: Your king guards d8, the promotion square.
- Theme: guard the promotion square
- Marks:

**4... Kb7** (Black)
- Note: Black heads for your pawn from the side.
- Theme: Black comes from the side
- Marks:

**5. d6** (White)
- Note: The pawn steps up, protected by your king on e7.
- Theme: the pawn advances
- Marks:

**5... Kc6** (Black)
- Note: Black attacks the pawn, but your king protects it.
- Theme: the pawn is protected
- Marks:

**6. d7** (White)
- Note: The pawn reaches d7; your king guards d8.
- Theme: the pawn advances
- Marks:

**6... Kd5** (Black)
- Note: Black is too late to stop the pawn.
- Theme: too late
- Marks:

**7. d8=Q+** (White)
- Note: Queen! With check, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Hold the important squares with your king, and advance the pawn when the path is safe.

---

## Position 8: 01. What the opposition is (8/10)

FEN: `8/7k/8/7K/5P2/8/8/8 b - - 0 1` (Black moves first)

- Theme: Black must move: take the ground step by step
- Intro: The kings face each other across h6. Can you turn Black's first move into ground for your king?
- Marks at the start:

### Moves

**1... Kg7** (Black)
- Note: Black has to move, and steps aside to g7.
- Theme: Black must give way
- Marks:

**2. Kg5** (White)
- Note: Take the opposition and protect your pawn. Black must give way.
- Theme: take the opposition
- Marks:

**2... Kf7** (Black)
- Note: Black steps aside, in front of your pawn.
- Theme: Black blocks the pawn
- Marks:

**3. Kf5** (White)
- Note: Take the opposition again: the kings face across f6. Black must give way.
- Theme: take the opposition
- Marks:

**3... Ke7** (Black)
- Note: Black steps aside, but still guards f6.
- Theme: Black gives way
- Marks:

**4. Kg6** (White)
- Note: f6 is guarded, so your king walks around it.
- Theme: go round the guarded square
- Marks:

**4... Kf8** (Black)
- Note: Black steps in front of the pawn, on f8.
- Theme: Black blocks the pawn
- Marks:

**5. Kf6** (White, also accepted: f5)
- Note: Take the opposition again, across f7.
- Theme: take the opposition
- Marks:

**5... Kg8** (Black)
- Note: Black steps aside, watching f7 and f8.
- Theme: Black gives way
- Marks:

**6. Ke7** (White)
- Note: Your king guards the pawn's path: f6, f7 and f8.
- Theme: your king guards the path
- Marks:

**6... Kg7** (Black)
- Note: Black comes back to guard f6, f7 and f8.
- Theme: Black guards the path
- Marks:

**7. f5** (White)
- Note: Now the pawn moves: your king already guards the squares ahead.
- Theme: the pawn advances
- Marks:

**7... Kh6** (Black)
- Note: Black tries to reach your pawn from the side.
- Theme: Black comes from the side
- Marks:

**8. f6** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**8... Kg5** (Black)
- Note: Black attacks the pawn, but your king protects it.
- Theme: the pawn is protected
- Marks:

**9. f7** (White)
- Note: One step from the finish; your king guards f8.
- Theme: the pawn advances
- Marks:

**9... Kf4** (Black)
- Note: Black is too late to reach f8.
- Theme: too late
- Marks:

**10. f8=Q+** (White)
- Note: Queen! With check, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Use each king move to win a little ground, then send the pawn when its path is safe.

---

## Position 9: 01. What the opposition is (9/10)

FEN: `4k3/8/8/5K2/8/8/2P5/8 w - - 0 1` (White moves first)

- Theme: the king leads, far ahead of the pawn
- Intro: Your king is far from the pawn, and Black is ready to block its road. Should you push the pawn, or use your king first?
- Marks at the start:

### Moves

**1. Ke6** (White)
- Note: Take the opposition across e7, before touching the pawn.
- Theme: king first
- Marks:

**1... Kd8** (Black)
- Note: Black steps aside, toward the c-file.
- Theme: Black gives way
- Marks:

**2. Kd6** (White)
- Note: Take the opposition again, across d7.
- Theme: take the opposition
- Marks:

**2... Kc8** (Black)
- Note: Black steps in front of the pawn, on c8.
- Theme: Black blocks the pawn
- Marks:

**3. Kc6** (White, also accepted: c4)
- Note: Opposition again, in front of your pawn.
- Theme: take the opposition
- Marks:

**3... Kb8** (Black)
- Note: Black steps aside again.
- Theme: Black gives way
- Marks:

**4. c4** (White)
- Note: Your king is in front, so now the pawn moves.
- Theme: the pawn advances
- Marks:

**4... Ka7** (Black)
- Note: Black moves away from the c-file.
- Theme: Black is shut out
- Marks:

**5. c5** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**5... Ka6** (Black)
- Note: Black tries to reach your pawn from the side.
- Theme: Black comes from the side
- Marks:

**6. Kd7** (White)
- Note: Your king guards the pawn's path: c6, c7 and c8.
- Theme: your king guards the path
- Marks:

**6... Kb5** (Black)
- Note: Black attacks your pawn. Can you save it?
- Theme: a question before your move
- Marks:

**7. c6** (White)
- Note: The pawn steps up, protected by your king.
- Theme: the pawn advances
- Marks:

**7... Kc4** (Black)
- Note: Black's king is left behind the pawn.
- Theme: Black is left behind
- Marks:

**8. c7** (White)
- Note: The pawn reaches c7; your king guards c8.
- Theme: the pawn advances
- Marks:

**8... Kd4** (Black)
- Note: Black cannot stop the pawn now.
- Theme: too late
- Marks:

**9. c8=Q** (White)
- Note: Queen! The pawn reaches c8, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Bring your king forward to secure the route before sending the c-pawn on its way.

---

## Position 10: 01. What the opposition is (10/10)

FEN: `8/2k5/8/8/1K2P3/8/8/8 w - - 0 1` (White moves first)

- Theme: the opposition, again and again, then the pawn
- Intro: The kings are manoeuvring for the central road. Can you take the opposition, then find the right moment to push the e-pawn?
- Marks at the start:

### Moves

**1. Kc5** (White)
- Note: Take the opposition across c6. Black must give way.
- Theme: take the opposition
- Marks:

**1... Kd7** (Black)
- Note: Black steps aside, toward the e-file.
- Theme: Black gives way
- Marks:

**2. Kd5** (White)
- Note: Take the opposition again, across d6, and protect your pawn. Black must give way.
- Theme: take the opposition
- Marks:

**2... Ke7** (Black)
- Note: Black steps in front of your pawn, on e7.
- Theme: Black blocks the pawn
- Marks:

**3. Ke5** (White)
- Note: Once more: the kings face across e6. Black must give way.
- Theme: take the opposition
- Marks:

**3... Kf7** (Black)
- Note: Black steps aside, but still guards e6.
- Theme: Black gives way
- Marks:

**4. Kd6** (White)
- Note: Your king goes around and guards e5, e6 and e7.
- Theme: go round the guarded square
- Marks:

**4... Kf6** (Black)
- Note: Black comes closer to your pawn.
- Theme: Black comes closer
- Marks:

**5. e5+** (White)
- Note: The pawn steps up with check, protected by your king.
- Theme: the pawn advances with check
- Marks:

**5... Kf5** (Black)
- Note: Black has to step out of check.
- Theme: Black is in check
- Marks:

**6. e6** (White)
- Note: The pawn steps up, still protected by your king.
- Theme: the pawn advances
- Marks:

**6... Kf6** (Black)
- Note: Black attacks the pawn and guards e7.
- Theme: Black attacks the pawn
- Marks:

**7. e7** (White, also accepted: Kd7)
- Note: The pawn reaches the 7th rank, protected by your king.
- Theme: the pawn advances
- Marks:

**7... Kf7** (Black)
- Note: Black guards e8, the promotion square.
- Theme: Black guards the promotion square
- Marks:

**8. Kd7** (White)
- Note: Your king guards e8 too, so the pawn can promote.
- Theme: guard the promotion square
- Marks:

**8... Kf6** (Black)
- Note: Black steps away; nothing can stop the pawn now.
- Theme: too late
- Marks:

**9. e8=Q** (White)
- Note: Queen! The pawn reaches e8, and your king protects the new queen.
- Theme: promote
- Marks:

- Takeaway: Win ground with your king first; then push the pawn at the right moment.
