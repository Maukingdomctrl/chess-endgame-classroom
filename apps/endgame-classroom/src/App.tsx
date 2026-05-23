import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import rawLines from "./data/endgames.sample.json";
import { EndgameLine } from "./types";
import { groupedRandomAscending, sanitizeSan } from "./lib/trainer";
import "./styles.css";

const lines = rawLines as EndgameLine[];

export default function App() {
  const queue = useMemo(() => groupedRandomAscending(lines), []);
  const [lineIdx, setLineIdx] = useState(0);
  const [moveIdx, setMoveIdx] = useState(0);
  const [status, setStatus] = useState("Your move.");
  const [hint, setHint] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [fen, setFen] = useState(queue[0]?.startFen || "start");
  const [game, setGame] = useState(new Chess(queue[0]?.startFen || undefined));

  const line = queue[lineIdx];

  function restartLine() {
    const g = new Chess(line?.startFen || undefined);
    setGame(g);
    setFen(g.fen());
    setMoveIdx(0);
    setHint("");
    setHistory([]);
    setStatus("Your move.");
  }

  function nextLine() {
    const next = (lineIdx + 1) % queue.length;
    setLineIdx(next);
    const g = new Chess(queue[next]?.startFen || undefined);
    setGame(g);
    setFen(g.fen());
    setMoveIdx(0);
    setHint("");
    setHistory([]);
    setStatus("New line. Your move.");
  }

  function onDrop(source: string, target: string) {
    if (!line) return false;
    if (moveIdx >= line.moves.length) return false;

    const g = new Chess(game.fen());
    const move = g.move({ from: source, to: target, promotion: "q" });
    if (!move) return false;

    const expected = line.moves[moveIdx].san;
    if (sanitizeSan(move.san) !== sanitizeSan(expected)) {
      setStatus("Incorrect. Try again or press Hint.");
      return false;
    }

    setGame(g);
    setFen(g.fen());
    setMoveIdx((m) => m + 1);
    setHistory((h) => [...h, move.san]);
    setHint("");
    setStatus(`Correct: ${move.san}`);

    if (moveIdx + 1 >= line.moves.length) {
      setStatus("Victory ✅ Line completed.");
    }
    return true;
  }

  function showHint() {
    if (!line || moveIdx >= line.moves.length) return;
    setHint(`Hint: ${line.moves[moveIdx].san}`);
  }

  if (!line) return <div className="app">No lines found.</div>;

  return (
    <div className="app">
      <h1>Endgame Classroom</h1>
      <p className="subtitle">{line.title} · ELO {line.difficultyElo}</p>

      <div className="board-wrap">
        <Chessboard
          id="endgame-board"
          position={fen}
          onPieceDrop={onDrop}
          boardWidth={620}
          customDarkSquareStyle={{ backgroundColor: "#9c6b3d" }}
          customLightSquareStyle={{ backgroundColor: "#f1d9b5" }}
        />
      </div>

      <div className="chalk">{status}</div>
      {hint && <div className="hint">{hint}</div>}
      <div className="note">
        {moveIdx > 0 ? line.moves[moveIdx - 1]?.note : "Move notes will appear here."}
      </div>

      <div className="controls">
        <button onClick={showHint}>Hint</button>
        <button onClick={restartLine}>Restart</button>
        <button onClick={nextLine}>Next</button>
      </div>

      <div className="history">Moves: {history.join(" ") || "—"}</div>
    </div>
  );
}
