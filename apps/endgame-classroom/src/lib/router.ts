import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function getHash() {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => "/");
  const [path, query = ""] = hash.split("?");
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(query) };
}

export function navigate(to: string) {
  window.location.hash = to;
}
