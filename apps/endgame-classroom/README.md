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

1. **Create a Course** – give it a name, description and the side you play.
2. **Build lines** – paste a FEN to start from any position (or use the normal start), then play
   the moves for both sides on the board. Add a note to any move; the coach shows it in Learn mode.
   Press **End line and add to the course**, name it, and **Return to start** to add more.
3. **Import** – paste PGN or drop `.pgn` files: every game becomes a line, every variation becomes
   its own line, `[FEN]` headers and `{comments}` are kept. A list of FENs (one per line) creates
   positions you can then record moves for.
4. **See / export** – the **Lines** tab lists every line (edit, reorder, delete, copy PGN/FEN) and
   exports the whole course as PGN or a JSON backup.
5. **Learn** – lines play one after another. The coach explains each move and an arrow shows what
   to play; the opponent's moves are played for you.
6. **Practice** – unlocks after you learn a line. No arrows: play from memory. Hints and wrong moves
   count as mistakes; a clean run marks the line **perfected**, lines with mistakes come back first.
7. **Search** – the search bar on the home screen finds lines by name, description, notes or moves.
   Paste a FEN to find every line that reaches that position (at the start or mid-line).
8. **Promotion** – when a pawn promotes you choose the piece (queen, rook, bishop or knight);
   in Learn/Practice the choice must match the line, so underpromotions are trained too.
9. **Pick a line** – in both modes, the **Line** dropdown jumps straight to any line you want to
   train; the session then carries on from there.

## Code map

- `src/pages/` – `CourseList`, `NewCourse`, `Builder`, `Trainer` (Learn + Practice)
- `src/components/` – `Board` (drag or click-to-move, promotion picker), `ImportBox`, `MoveList`, …
- `src/lib/pgn.ts` – PGN/FEN import (variations → lines) and PGN export
- `src/lib/store.ts`, `storage.ts` – courses saved in `localStorage`
