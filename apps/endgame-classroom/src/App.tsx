import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { PieceDropHandlerArgs } from "react-chessboard";
import rawLines from "./data/endgames.sample.json";
import type { EndgameLine } from "./types";
import {
  groupedRandomAscending,
  playOpponentMoves,
  sanitizeSan,
  sideToColor,
} from "./lib/trainer";
import "./styles.css";

const lines = rawLines as EndgameLine[];
const OPPONENT_DELAY_MS = 500;
const TRIES_BEFORE_REVEAL = 2;

interface LineState {
  fen: string;
  moveIdx: number;
  history: string[];
  status: string;
}

function initLine(line: EndgameLine | undefined, intro: string): LineState {
  if (!line) return { fen: "start", moveIdx: 0, history: [], status: "" };
  const g = new Chess(line.startFen);
  const { played, moveIdx } = playOpponentMoves(g, line, 0);
  return { fen: g.fen(), moveIdx, history: played, status: intro };
}

export default function App() {
  const queue = useMemo(() => groupedRandomAscending(lines), []);
  const [lineIdx, setLineIdx] = useState(0);
  const [state, setState] = useState(() => initLine(queue[0], "Your move."));
  const [hint, setHint] = useState("");
  const [wrongTries, setWrongTries] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const line = queue[lineIdx];
  const lineDone = !!line && state.moveIdx >= line.moves.length;

  function loadLine(idx: number, intro: string) {
    window.clearTimeout(timer.current);
    setWaiting(false);
    setLineIdx(idx);
    setState(initLine(queue[idx], intro));
    setHint("");
    setWrongTries(0);
  }

  function restartLine() {
    loadLine(lineIdx, "Your move.");
  }

  function nextLine() {
    if (lineIdx + 1 >= queue.length) {
      window.clearTimeout(timer.current);
      setAllDone(true);
      return;
    }
    loadLine(lineIdx + 1, "New line. Your move.");
  }

  function startOver() {
    setAllDone(false);
    loadLine(0, "Your move.");
  }

  function onDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!line || lineDone || waiting || !targetSquare) return false;

    const g = new Chess(state.fen);
    if (g.turn() !== sideToColor(line.sideToTrain)) return false;

    let san: string;
    try {
      san = g.move({ from: sourceSquare, to: targetSquare, promotion: "q" }).san;
    } catch {
      return false; // illegal move
    }

    const expected = line.moves[state.moveIdx].san;
    if (sanitizeSan(san) !== sanitizeSan(expected)) {
      const tries = wrongTries + 1;
      setWrongTries(tries);
      setState((s) => ({
        ...s,
        status:
          tries >= TRIES_BEFORE_REVEAL
            ? `${san} is not the move. The correct move is ${expected}.`
            : `${san} is not the move. Try again or press Hint.`,
      }));
      return false;
    }

    const moveIdx = state.moveIdx + 1;
    const history = [...state.history, san];
    setHint("");
    setWrongTries(0);

    if (moveIdx >= line.moves.length) {
      setState({ fen: g.fen(), moveIdx, history, status: "Victory ✅ Line completed." });
      return true;
    }

    setState({ fen: g.fen(), moveIdx, history, status: `Correct: ${san}` });

    // Let the trainee's move land on the board before the opponent replies.
    setWaiting(true);
    timer.current = window.setTimeout(() => {
      const reply = playOpponentMoves(g, line, moveIdx);
      const done = reply.moveIdx >= line.moves.length;
      setState({
        fen: g.fen(),
        moveIdx: reply.moveIdx,
        history: [...history, ...reply.played],
        status: done
          ? "Victory ✅ Line completed."
          : `Correct: ${san}. Opponent played ${reply.played.join(" ")}. Your move.`,
      });
      setWaiting(false);
    }, OPPONENT_DELAY_MS);

    return true;
  }

  function showHint() {
    if (!line || lineDone || waiting) return;
    setHint(`Hint: ${line.moves[state.moveIdx].san}`);
  }

  if (!line) {
    return (
      <div className="app">
        <h1>Endgame Classroom</h1>
        <div className="chalk">No lines loaded yet.</div>
      </div>
    );
  }

  if (allDone) {
    return (
      <div className="app">
        <h1>Endgame Classroom</h1>
        <div className="chalk">🏆 All {queue.length} lines completed. Well done!</div>
        <div className="controls">
          <button onClick={startOver}>Start over</button>
        </div>
      </div>
    );
  }

  const lastNote = state.moveIdx > 0 ? line.moves[state.moveIdx - 1]?.note : "";

  return (
    <div className="app">
      <h1>Endgame Classroom</h1>
      <p className="subtitle">
        {line.title} · ELO {line.difficultyElo} · Line {lineIdx + 1}/{queue.length} ·
        You play {line.sideToTrain}
      </p>

      <div className="board-wrap">
        <Chessboard
          options={{
            id: "endgame-board",
            position: state.fen,
            onPieceDrop: onDrop,
            boardOrientation: line.sideToTrain,
            allowDragging: !lineDone && !waiting,
            darkSquareStyle: { backgroundColor: "#9c6b3d" },
            lightSquareStyle: { backgroundColor: "#f1d9b5" },
          }}
        />
      </div>

      <div className="chalk">{state.status}</div>
      {hint && <div className="hint">{hint}</div>}
      <div className="note">{lastNote || "Move notes will appear here."}</div>

      <div className="controls">
        <button onClick={showHint} disabled={lineDone || waiting}>
          Hint
        </button>
        <button onClick={restartLine}>Restart</button>
        <button onClick={nextLine}>
          {lineIdx + 1 >= queue.length ? "Finish" : "Next"}
        </button>
      </div>

      <div className="history">Moves: {state.history.join(" ") || "—"}</div>
    </div>
  );
}
