import {useEffect, useState} from "react";

export function readWorkspaceLocation() {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}
/** Object selection is addressable; back/forward and reload preserve the task context. */
export function useWorkspaceLocation() {
  const [query, setQuery] = useState(readWorkspaceLocation);
  useEffect(() => {
    const sync = () => setQuery(readWorkspaceLocation());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("desk:navigation", sync);
    return () => {window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); window.removeEventListener("desk:navigation", sync);};
  }, []);
  return query;
}
export function selectWorkspaceObject(values: Record<string,string | null>) {
  const query = readWorkspaceLocation();
  for (const [key,value] of Object.entries(values)) value === null ? query.delete(key) : query.set(key,value);
  const route = window.location.hash.split("?")[0];
  window.history.pushState(null,"",`${route}${query.size ? `?${query}` : ""}`);
  window.dispatchEvent(new Event("desk:navigation"));
}
