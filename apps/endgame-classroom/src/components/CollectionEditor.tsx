import { useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import type { TvCollection } from "../types";
import { imageToCover, isImageUrl } from "../lib/image";
import { updateCollection } from "../lib/tvStore";

interface Props {
  collection: TvCollection;
  onDone: () => void;
}

export default function CollectionEditor({ collection, onDone }: Props) {
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description);
  const [cover, setCover] = useState(collection.cover);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function applyFile(file: Blob | null | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setCover(await imageToCover(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      applyFile(item.getAsFile());
      return;
    }
    const text = e.clipboardData.getData("text").trim();
    if (text) {
      e.preventDefault();
      if (isImageUrl(text)) {
        setError("");
        setCover(text);
      } else setError("Paste an image, or a link starting with https://");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) applyFile(file);
    else {
      const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
      if (url && isImageUrl(url)) setCover(url.trim());
      else setError("Drop an image file.");
    }
  }

  function save() {
    updateCollection(collection.id, {
      name: name.trim() || collection.name,
      description: description.trim(),
      cover,
    });
    onDone();
  }

  return (
    <div className="panel collection-editor">
      <h2 className="title-sm">Edit collection</h2>
      <div className="editor-grid">
        <div
          className={`cover-drop${dragOver ? " drag" : ""}${cover ? " has-cover" : ""}`}
          tabIndex={0}
          role="button"
          aria-label="Cover photo: click here and paste an image, or drop an image file"
          onPaste={onPaste}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {cover ? (
            <img src={cover} alt="" onError={() => setError("That image link didn't load.")} />
          ) : (
            <span className="cover-hint">
              <b>Cover photo</b>
              <span>Click here, then paste (Ctrl+V)</span>
              <span>or drop an image</span>
            </span>
          )}
          {busy && <span className="cover-busy">Processing…</span>}
        </div>

        <div className="stack">
          <label className="label" htmlFor="ce-name">Name</label>
          <input id="ce-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="label" htmlFor="ce-desc">Description</label>
          <textarea
            id="ce-desc"
            className="field"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="row wrap">
            <label className="btn small file-btn">
              Choose photo…
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  applyFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {cover && (
              <button className="btn small ghost" onClick={() => setCover(undefined)}>
                Remove photo
              </button>
            )}
          </div>
          <p className="small muted">
            Tip: right-click a photo on any website → <i>Copy image</i>, then click the cover box and press Ctrl+V.
          </p>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={save}>
          Save
        </button>
        <button className="btn ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
