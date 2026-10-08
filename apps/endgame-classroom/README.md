# Endgame Classroom

Build endgame courses from your own lines, then learn and practice them move by move.
Everything is stored in your browser on this device (use **Backup (.json)** to move courses between devices).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Using it

0. **Sections** – the home screen has three tiles: **Openings**, **Middlegame** and **Endgame**.
   Each course belongs to one section (change it any time in the builder's *Course details*).
   Courses created before sections existed are placed in Endgame.
1. **Create a Course** – give it a name, description, section and the side you play.
2. **Build lines** – paste a FEN to start from any position (or use the normal start), then play
   the moves for both sides on the board. Add a note to any move; the coach shows it in Learn mode.
   Press **End line and add to the course**, name it, and **Return to start** to add more.
3. **Import** – paste PGN or drop `.pgn` files: every game becomes a line, every variation becomes
   its own line, `[FEN]` headers and `{comments}` are kept. A list of FENs (one per line) creates
   positions you can then record moves for.
4. **See / export** – the **Lines** tab lists every line (edit, reorder, delete, copy PGN/FEN) and
   exports the whole course as PGN or a JSON backup.
5. **Learn** – lines play one after another. The coach explains each move and an arrow shows what
   to play; the opponent's moves are played for you. When a line ends you get 15 seconds to read the
   final notes before the next one starts: press **Next line** to go on now, or **Stay** to stop the
   countdown and look at the position as long as you like.
6. **Practice** – unlocks after you learn a line. No arrows: play from memory. Hints and wrong moves
   count as mistakes; a clean run marks the line **perfected**, lines with mistakes come back first.
   A move the line marks as just as good (see `[%also]` below) is not a mistake: the coach says so and
   asks for the line's move, so the line can go on.
7. **Search** – the search bar on the home screen finds lines by name, description, notes or moves.
   Paste a FEN to find every line that reaches that position (at the start or mid-line).
8. **Promotion** – when a pawn promotes you choose the piece (queen, rook, bishop or knight);
   in Learn/Practice the choice must match the line, so underpromotions are trained too.
9. **Pick a line** – in both modes, the **Line** dropdown jumps straight to any line you want to
   train; the session then carries on from there.

## Coloured squares and arrows

Comments in a PGN can carry board marks in the standard format used by Lichess and ChessBase:
`[%csl Gd6,Ge6]` colours squares and `[%cal Ge2e4]` draws arrows (G = green, R = red, Y = yellow,
B = blue). The app reads them on import, shows them in **Learn** mode (never in Practice, where they
would give the answer away), in the builder and in Chess TV, and writes them back on export. Other
`[%…]` codes such as Lichess clock times are removed from the comment text.

The app also reads `[%also Kd6,Ke7]` in the comment after a move: other moves that are just as good
as the one played there. Learn and Practice accept them without counting a mistake.

To mark a position yourself, open it in the builder and press **🎨 Mark the board**: pick a colour,
then click squares to colour them (click again to remove), or switch to **Arrows** and click a start
and an end square. Marks belong to the position on screen and are saved with the line.

## Built-in courses

Courses in `courses/` ship with the app and appear automatically (marked ★ Built-in) the first
time the app opens on a device:

- *King & Pawn: Opposition and Key Squares* (`courses/king-and-pawn-course.pgn`): 50 positions in
  17 lessons, every move verified with an exact king-and-pawn endgame solver. Every line is played
  to the end: until the pawn becomes a queen, or in the defence lessons until the pawn is won or it
  is stalemate. Key squares are shown in green (red in the defence lessons, blue for the square of
  the pawn; the queening square once the pawn is on the 7th rank). Regenerate it with
  `npm run course:kpk` (see `tools/kpk-course/`).
- *Endgame Basics: First Principles* (`courses/endgame-basics-course.pgn`): 31 positions in 6
  lessons: the king as a fighting piece, mating patterns on the edge and in the corner, checkmate
  with the queen and with the rook, stalemate traps, and a final exam. Every move is verified with
  exact solvers (king + queen / king + rook vs king with distance to mate, and the king + pawn
  solver): each of your moves is a fastest win, equally fast moves are accepted via `[%also]`, the
  opponent always defends as stubbornly as possible, and every line is played to mate (or, with a
  pawn, to the promotion). Blue squares show the black king's box (or the squares it can step to),
  green the key squares, red the moves that would stalemate or only draw. Regenerate it with
  `npm run course:basics` (see `tools/basics-course/`).
- *The Ladder Mate: Two Rooks, Queen and Rook* (`courses/ladder-mate-course.pgn`): 78 positions in
  7 lessons: the final picture, the ladder with two rooks, switching an attacked rook to the far
  side, the ladder with queen and rook, stalemate traps, a final exam, and 24 extra practice
  positions without explanations. Every move of yours is the only fastest mate (verified with the
  exact solver), and every move in the lessons is explained: check and climb, the wall moving up,
  the far side, cutting the king off, waiting moves, the final picture. Blue squares show the black
  king's box (or the squares it can step to), red the move that would be stalemate. Regenerate it
  with `npm run course:ladder` (see `tools/ladder-course/`).
- *Two Connected Pawns* (`courses/connected-pawns-course.pgn`): 80 positions in 8 lessons: promoting
  safely, side-by-side pawns the king cannot stop, letting the king take one pawn while the other
  runs, the chain that protects itself while your king walks over, escorting the pawns with your
  king, stalemate traps, a final exam, and 24 extra practice positions without explanations. Every
  line ends in a safe promotion, and every move of yours is the only fastest way there (verified
  with the exact solver, measured to the promotion). Green squares show the queening squares (or
  where your king is heading), blue the squares the black king can step to, red the pawn the king
  is going to take or the move that would be stalemate. Regenerate it with `npm run course:pawns`
  (see `tools/pawns-course/`).

A built-in course you delete stays deleted; the section page offers **Restore**. A copy you had
imported by hand is adopted instead of duplicated. When a newer version of the app changes a
built-in course's PGN (e.g. adds coloured squares), your copy is updated on the next start: your
progress is kept for every line whose moves didn't change, and lines you added yourself stay. To add another built-in course, put its PGN in
`courses/` and register it in `src/lib/builtinCourses.ts`.

New courses are generated with the shared toolkit in `tools/course-kit/` (exact endgame solver for up
to four pieces, line player, checker, PGN writer, browser test; see its README), following the
project skill `.claude/skills/endgame-course/` at the repository root:

```bash
npm run kit:selftest                    # check the solver
npm run course:e2e -- <builtin id>       # browser test of a built-in course
```

## Chess TV

A separate library for **watching** games (not training them). Open it from the banner under the
section tiles or **▶ Chess TV** in the top bar.

- Create collections (e.g. *Capablanca*, *Morphy*) and paste or drop PGNs — every game keeps its
  tags (players, event, date, result, ECO) and comments. Games are stored as imported; you can add,
  remove and export them, but not edit them.
- **✎ Edit** a collection to change its name, description and **cover photo**: click the cover box
  and paste (Ctrl+V) a copied image, drop an image file, choose one, or paste an image link.
  Photos are shrunk automatically so they don't fill the browser's storage.
- **Backup (.json)** saves the whole library (or one collection) including covers; **Import backup**
  restores it on any device.
- The viewer has **Play/Pause** (10 s per move by default; 1–30 s selectable and remembered),
  ⏮ ‹ › ⏭ buttons, a clickable move list, flip board, and **Play next game** to watch a whole
  collection in a row. Keys: Space = play/pause, ←/→ = step, Home/End = start/end.

## Code map

- `src/pages/` – `Home` (section tiles + search), `Section`, `NewCourse`, `Builder`, `Trainer` (Learn + Practice)
- `src/lib/categories.ts` – the three sections and their stats
- `src/pages/Tv*.tsx`, `src/lib/tvStore.ts` – Chess TV library, collection page and game viewer
- `src/components/` – `Board` (drag or click-to-move, promotion picker), `ImportBox`, `MoveList`, …
- `src/lib/pgn.ts` – PGN/FEN import (variations → lines) and PGN export
- `src/lib/store.ts`, `storage.ts` – courses saved in `localStorage`
