import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { TvCollection } from "../types";
import { navigate } from "../lib/router";
import { newId } from "../lib/storage";
import { lineFens } from "../lib/chess";
import { importTvGames } from "../lib/pgn";
import { parseTvBackup, setCollections, tvBackupJson } from "../lib/tvStore";
import { downloadFile } from "../lib/storage";
import ImportBox from "../components/ImportBox";

interface Props {
  collections: TvCollection[];
}

export default function TvLibrary({ collections }: Props) {
  const [creating, setCreating] = useState(collections.length === 0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [backupMsg, setBackupMsg] = useState("");

  async function importBackup(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added: TvCollection[] = [];
      for (const f of files) added.push(...parseTvBackup(await f.text()));
      setCollections((cs) => [...added, ...cs]);
      const games = added.reduce((n, c) => n + c.games.length, 0);
      setBackupMsg(`Imported ${added.length} collection${added.length === 1 ? "" : "s"} (${games} games).`);
      setCreating(false);
    } catch {
      setBackupMsg("That file isn't a Chess TV backup (.json).");
    }
  }

  function exportBackup() {
    const day = new Date().toISOString().slice(0, 10);
    downloadFile(`chess-tv-backup-${day}.json`, tvBackupJson(collections), "application/json");
  }

  function create(games: ReturnType<typeof importTvGames>["items"] = []) {
    const c: TvCollection = {
      id: newId(),
      name: name.trim() || "Untitled collection",
      description: description.trim(),
      createdAt: Date.now(),
      games: games.map((g) => ({ ...g, id: newId() })),
    };
    setCollections((cs) => [c, ...cs]);
    navigate(`/tv/${c.id}`);
  }

  const totalGames = collections.reduce((n, c) => n + c.games.length, 0);

  return (
    <div className="page cat-tv">
      <nav className="crumbs">
        <a href="#/">← All sections</a>
      </nav>

      <section className="section-head">
        <span className="section-icon" aria-hidden="true">
          ▶
        </span>
        <div className="grow">
          <h1>Chess TV</h1>
          <p className="muted">A library of great games. Add PGNs, then sit back and watch them move by move.</p>
          <p className="small muted">
            {collections.length} collection{collections.length === 1 ? "" : "s"} · {totalGames} game
            {totalGames === 1 ? "" : "s"}
          </p>
        </div>
        <div className="row wrap">
          {!creating && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              ＋ New collection
            </button>
          )}
          <button className="btn ghost" disabled={!collections.length} onClick={exportBackup}>
            ⬇ Backup (.json)
          </button>
          <label className="btn ghost file-btn">
            Import backup
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(e) => {
                importBackup(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      {backupMsg && <p className="small muted">{backupMsg}</p>}

      {creating && (
        <div className="panel tv-create">
          <h2 className="title-sm">New collection</h2>
          <label className="label" htmlFor="tv-name">Name</label>
          <input
            id="tv-name"
            className="field"
            placeholder="Capablanca's best games"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="label" htmlFor="tv-desc">Description</label>
          <input
            id="tv-desc"
            className="field"
            placeholder="Endgame technique from the chess machine"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="label">Games</span>
          <ImportBox
            compact
            noun="game"
            parse={importTvGames}
            placeholder={"Paste PGN games (as many as you like) or drag & drop .pgn files here"}
            onImport={(games) => create(games)}
          />
          <div className="row">
            <button className="btn" onClick={() => create()}>
              Create empty collection
            </button>
            {collections.length > 0 && (
              <button className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {collections.length > 0 && (
        <div className="tv-grid">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionCard({ collection: c }: { collection: TvCollection }) {
  // Preview the final position of the first game — the moment the game was decided.
  const preview = useMemo(() => {
    const g = c.games[0];
    if (!g) return undefined;
    const fens = lineFens(g);
    return fens[fens.length - 1];
  }, [c.games]);

  return (
    <article className="tv-card">
      <a className="tv-card-board" href={`#/tv/${c.id}`} aria-label={`Open ${c.name}`}>
        {c.cover ? (
          <img className="tv-card-cover" src={c.cover} alt="" loading="lazy" />
        ) : preview ? (
          <Chessboard
            options={{
              id: `tv-${c.id}`,
              position: preview,
              allowDragging: false,
              showNotation: false,
              darkSquareStyle: { backgroundColor: "#b58863" },
              lightSquareStyle: { backgroundColor: "#f0d9b5" },
            }}
          />
        ) : (
          <span className="tv-card-empty">No games yet</span>
        )}
        <span className="tv-card-play" aria-hidden="true">
          ▶
        </span>
      </a>
      <div className="tv-card-body">
        <div className="tv-card-head">
          <h2>{c.name}</h2>
          <a className="icon-btn" href={`#/tv/${c.id}?edit=1`} title="Edit name, description and cover photo">
            ✎
          </a>
        </div>
        {c.description && <p className="muted small clamp">{c.description}</p>}
        <p className="small muted">
          {c.games.length} game{c.games.length === 1 ? "" : "s"}
        </p>
        <div className="row">
          <button
            className="btn primary small"
            disabled={!c.games.length}
            onClick={() => navigate(`/tv/${c.id}/${c.games[0].id}?autoplay=1`)}
          >
            ▶ Watch
          </button>
          <button className="btn small ghost" onClick={() => navigate(`/tv/${c.id}`)}>
            Games
          </button>
        </div>
      </div>
    </article>
  );
}
