import { useState } from "react";
import type { DragEvent } from "react";
import type { Line } from "../types";
import { importText } from "../lib/pgn";

interface Props<T> {
  onImport: (items: T[]) => void;
  compact?: boolean;
  /** Turns pasted text into items; defaults to course lines from PGN/FEN. */
  parse?: (text: string) => { items: T[]; warnings: string[] };
  placeholder?: string;
  /** Singular noun for the result message, e.g. "line" or "game". */
  noun?: string;
}

const parseLines = (text: string) => {
  const { lines, warnings } = importText(text);
  return { items: lines, warnings };
};

export default function ImportBox<T = Line>({
  onImport,
  compact,
  parse = parseLines as unknown as (text: string) => { items: T[]; warnings: string[] },
  placeholder = "Paste PGN (one or many games, variations become separate lines)\nor FENs, one per line — or drag & drop a .pgn file here",
  noun = "line",
}: Props<T>) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  function run(source: string) {
    const { items, warnings } = parse(source);
    const msgs = [...warnings];
    if (items.length) {
      msgs.unshift(`Imported ${items.length} ${noun}${items.length === 1 ? "" : "s"}.`);
      onImport(items);
      setText("");
    }
    setMessages(msgs);
  }

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    const texts = await Promise.all([...files].map((f) => f.text()));
    run(texts.join("\n\n"));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    readFiles(e.dataTransfer.files);
  }

  return (
    <div className="import-box">
      <textarea
        className={`field${dragOver ? " drag" : ""}`}
        rows={compact ? 4 : 6}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      />
      <div className="row">
        <button className="btn" disabled={!text.trim()} onClick={() => run(text)}>
          Import
        </button>
        <label className="btn ghost file-btn">
          Choose .pgn file
          <input
            type="file"
            accept=".pgn,.txt,text/plain"
            multiple
            onChange={(e) => {
              readFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {messages.length > 0 && (
        <ul className="messages">
          {messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
