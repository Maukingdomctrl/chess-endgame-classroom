import { useState } from "react";
import type { TvCollection } from "../types";
import { navigate } from "../lib/router";
import { downloadFile, slugify } from "../lib/storage";
import { importTvGames, tvGameToPgn } from "../lib/pgn";
import { addGames, gameSubtitle, gameTitle, setCollections } from "../lib/tvStore";
import ImportBox from "../components/ImportBox";

interface Props {
  collection: TvCollection;
}

export default function TvCollectionPage({ collection: c }: Props) {
  const [adding, setAdding] = useState(c.games.length === 0);
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const games = c.games
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => !q || `${gameTitle(g)} ${gameSubtitle(g)} ${g.headers.ECO ?? ""}`.toLowerCase().includes(q));

  function exportPgn() {
    downloadFile(`${slugify(c.name)}.pgn`, c.games.map(tvGameToPgn).join("\n"), "application/x-chess-pgn");
  }

  function removeGame(id: string, title: string) {
    if (!confirm(`Remove "${title}" from this collection?`)) return;
    setCollections((cs) => cs.map((x) => (x.id === c.id ? { ...x, games: x.games.filter((g) => g.id !== id) } : x)));
  }

  function removeCollection() {
    if (!confirm(`Delete the collection "${c.name}" and its ${c.games.length} games? This can't be undone.`)) return;
    setCollections((cs) => cs.filter((x) => x.id !== c.id));
    navigate("/tv");
  }

  return (
    <div className="page cat-tv">
      <nav className="crumbs">
        <a href="#/tv">← Chess TV</a>
      </nav>

      <section className="section-head">
        <span className="section-icon" aria-hidden="true">
          ▶
        </span>
        <div className="grow">
          <h1>{c.name}</h1>
          {c.description && <p className="muted">{c.description}</p>}
          <p className="small muted">
            {c.games.length} game{c.games.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="row wrap">
          <button
            className="btn primary"
            disabled={!c.games.length}
            onClick={() => navigate(`/tv/${c.id}/${c.games[0].id}?autoplay=1`)}
          >
            ▶ Watch all
          </button>
          <button className="btn" onClick={() => setAdding((a) => !a)}>
            ＋ Add games
          </button>
          <button className="btn ghost" disabled={!c.games.length} onClick={exportPgn}>
            ⬇ PGN
          </button>
          <button className="btn ghost danger-text" onClick={removeCollection}>
            Delete
          </button>
        </div>
      </section>

      {adding && (
        <div className="panel">
          <h2 className="title-sm">Add games</h2>
          <ImportBox
            compact
            noun="game"
            parse={importTvGames}
            placeholder={"Paste PGN games (as many as you like) or drag & drop .pgn files here"}
            onImport={(items) => {
              addGames(c.id, items);
              setAdding(false);
            }}
          />
        </div>
      )}

      {c.games.length > 0 && (
        <div className="panel tv-list-panel">
          {c.games.length > 6 && (
            <input
              type="search"
              className="field"
              placeholder="Filter by player, event, year or ECO…"
              aria-label="Filter games"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          <ol className="tv-list">
            {games.map(({ g, i }) => {
              const title = gameTitle(g);
              return (
                <li key={g.id}>
                  <button className="tv-row" onClick={() => navigate(`/tv/${c.id}/${g.id}`)}>
                    <span className="tv-no">{i + 1}</span>
                    <span className="tv-row-main">
                      <span className="tv-row-title">{title}</span>
                      <span className="small muted">
                        {gameSubtitle(g) || "—"} · {Math.ceil(g.moves.length / 2)} moves
                        {g.headers.ECO && g.headers.ECO !== "?" ? ` · ${g.headers.ECO}` : ""}
                      </span>
                    </span>
                    <span className="tv-row-play" aria-hidden="true">
                      ▶
                    </span>
                  </button>
                  <button className="icon-btn danger" title="Remove game" onClick={() => removeGame(g.id, title)}>
                    🗑
                  </button>
                </li>
              );
            })}
          </ol>
          {games.length === 0 && <p className="muted small">No games match "{filter}".</p>}
        </div>
      )}
    </div>
  );
}
