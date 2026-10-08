import { useEffect, useMemo, useRef, useState } from "react";
import type { Side, TvCollection, TvGame } from "../types";
import Board from "../components/Board";
import Material from "../components/Material";
import MoveList from "../components/MoveList";
import { lineFens, lineVerboseMoves } from "../lib/chess";
import { navigate } from "../lib/router";
import { gameSubtitle, gameTitle } from "../lib/tvStore";
import { setSoundEnabled, soundEnabled, sounds } from "../lib/sound";
import { marksToArrows } from "../lib/marks";

interface Props {
  collection: TvCollection;
  game: TvGame;
  autoplay: boolean;
}

const SPEED_KEY = "endgame-classroom.tv.speed";
const SPEEDS = [1, 2, 3, 5, 10, 15, 20, 30];
const NEXT_GAME_DELAY_MS = 4000;

function loadSpeed() {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 10;
  } catch {
    return 10;
  }
}

function clean(v?: string) {
  return v && !/^[?.\s]*$/.test(v) ? v : "";
}

export default function TvViewer({ collection, game, autoplay }: Props) {
  const fens = useMemo(() => lineFens(game), [game]);
  const verbose = useMemo(() => lineVerboseMoves(game), [game]);
  const total = verbose.length;
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [autoNext, setAutoNext] = useState(autoplay);
  const [speed, setSpeed] = useState(loadSpeed);
  const [flipped, setFlipped] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const moveListRef = useRef<HTMLDivElement>(null);

  const index = collection.games.findIndex((g) => g.id === game.id);
  const nextGame = collection.games[index + 1];
  const prevGame = collection.games[index - 1];
  const atEnd = ply >= total;

  // Autoplay: one move every `speed` seconds; at the end optionally roll on to the next game.
  useEffect(() => {
    if (!playing) return;
    if (!atEnd) {
      const t = window.setTimeout(() => {
        sounds.move();
        setPly((p) => Math.min(total, p + 1));
      }, speed * 1000);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(
      () => {
        if (autoNext && nextGame) navigate(`/tv/${collection.id}/${nextGame.id}?autoplay=1`);
        else setPlaying(false);
      },
      autoNext && nextGame ? NEXT_GAME_DELAY_MS : 0,
    );
    return () => window.clearTimeout(t);
  }, [playing, atEnd, ply, speed, total, autoNext, nextGame, collection.id]);

  // Keep the current move visible in the move list.
  useEffect(() => {
    const el = moveListRef.current?.querySelector(".ml-move.current");
    el?.scrollIntoView({ block: "nearest" });
  }, [ply]);

  function go(p: number) {
    setPly(Math.max(0, Math.min(total, p)));
  }

  function togglePlay() {
    if (!playing && atEnd) setPly(0);
    setPlaying((v) => !v);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        go(ply - 1);
      } else if (e.key === "ArrowRight") {
        setPlaying(false);
        go(ply + 1);
      } else if (e.key === "Home") {
        setPlaying(false);
        go(0);
      } else if (e.key === "End") {
        setPlaying(false);
        go(total);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const orientation: Side = flipped ? "black" : "white";
  const top: Side = orientation === "white" ? "black" : "white";
  const h = game.headers;
  const name = (side: Side) => clean(side === "white" ? h.White : h.Black) || (side === "white" ? "White" : "Black");
  const elo = (side: Side) => clean(side === "white" ? h.WhiteElo : h.BlackElo);
  const lastMove = ply > 0 ? verbose[ply - 1] : null;
  const note = ply === 0 ? game.intro : game.moves[ply - 1]?.comment;
  const plyMarks = ply === 0 ? game.introMarks : game.moves[ply - 1]?.marks;
  const result = clean(h.Result) && h.Result !== "*" ? h.Result : "";
  const details = [
    ["Event", clean(h.Event)],
    ["Site", clean(h.Site)],
    ["Date", clean(h.Date)?.replace(/\.\?\?/g, "")],
    ["Round", clean(h.Round)],
    ["Opening", [clean(h.ECO), clean(h.Opening)].filter(Boolean).join(" · ")],
  ].filter(([, v]) => v);

  const bar = (side: Side) => (
    <PlayerBar
      side={side}
      name={name(side)}
      elo={elo(side)}
      fen={fens[ply]}
      toMove={!atEnd && fens[ply]?.split(" ")[1] === side[0]}
    />
  );

  return (
    <div className="tv-viewer">
      <nav className="crumbs">
        <a href={`#/tv/${collection.id}`}>← {collection.name}</a>
      </nav>
      <div className="workspace">
        <div className="board-col">
          {bar(top)}
          <Board
            fen={fens[ply]}
            orientation={orientation}
            interactive={false}
            lastMove={lastMove}
            highlights={plyMarks?.squares}
            arrows={marksToArrows(plyMarks)}
          />
          {bar(orientation)}
          <div className="tv-timer" aria-hidden="true">
            {playing && !atEnd && <span key={`${ply}-${speed}`} style={{ animationDuration: `${speed}s` }} />}
          </div>
        </div>

        <aside className="side panel">
          <div className="tv-head">
            <span className="tv-live">{playing ? "● Playing" : "Chess TV"}</span>
            <span className="muted small">
              Game {index + 1}/{collection.games.length}
            </span>
          </div>
          <h1 className="tv-title">{gameTitle(game)}</h1>
          {gameSubtitle(game) && <p className="muted small">{gameSubtitle(game)}</p>}
          {details.length > 0 && (
            <dl className="tv-details">
              {details.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="tv-moves" ref={moveListRef}>
            {total > 0 && (
              <MoveList
                startFen={game.startFen}
                moves={game.moves}
                cursor={ply}
                onSelect={(p) => {
                  setPlaying(false);
                  go(p);
                }}
              />
            )}
            {atEnd && <p className="tv-result">{result ? `Game over · ${result}` : "End of game"}</p>}
          </div>

          <div className="tv-note">{note?.trim() ? note : <span className="muted">No comment on this move.</span>}</div>

          <div className="tv-controls">
            <button className="icon-btn" title="Start (Home)" disabled={ply === 0} onClick={() => (setPlaying(false), go(0))}>
              ⏮
            </button>
            <button className="icon-btn" title="Back (←)" disabled={ply === 0} onClick={() => (setPlaying(false), go(ply - 1))}>
              ‹
            </button>
            <button className="tv-play" title="Play / pause (Space)" onClick={togglePlay}>
              {playing ? "❚❚" : "▶"}
            </button>
            <button className="icon-btn" title="Forward (→)" disabled={atEnd} onClick={() => (setPlaying(false), go(ply + 1))}>
              ›
            </button>
            <button className="icon-btn" title="End (End)" disabled={atEnd} onClick={() => (setPlaying(false), go(total))}>
              ⏭
            </button>
          </div>

          <div className="tv-options">
            <label className="tv-speed">
              <span>Speed</span>
              <select
                className="field"
                value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeed(v);
                  try {
                    localStorage.setItem(SPEED_KEY, String(v));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s} s / move
                  </option>
                ))}
              </select>
            </label>
            <label className="tv-check">
              <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
              Play next game
            </label>
          </div>

          <div className="nav-row">
            <button className="icon-btn labeled" title="Flip board" onClick={() => setFlipped((f) => !f)}>
              ⇅<small>Flip</small>
            </button>
            <button
              className="icon-btn labeled"
              title="Sound"
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              {sound ? "🔊" : "🔈"}
              <small>Sound</small>
            </button>
            <span className="grow" />
            <button
              className="btn small ghost"
              disabled={!prevGame}
              onClick={() => prevGame && navigate(`/tv/${collection.id}/${prevGame.id}`)}
            >
              ‹ Prev game
            </button>
            <button
              className="btn small ghost"
              disabled={!nextGame}
              onClick={() => nextGame && navigate(`/tv/${collection.id}/${nextGame.id}${playing ? "?autoplay=1" : ""}`)}
            >
              Next game ›
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PlayerBar({ side, name, elo, fen, toMove }: { side: Side; name: string; elo: string; fen: string; toMove: boolean }) {
  return (
    <div className={`player-bar${toMove ? " to-move" : ""}`}>
      <span className={`player-dot ${side}`} aria-hidden="true" />
      <span className="player-name">{name}</span>
      {elo && <span className="muted small">{elo}</span>}
      <span className="grow" />
      <Material fen={fen} side={side} />
    </div>
  );
}
