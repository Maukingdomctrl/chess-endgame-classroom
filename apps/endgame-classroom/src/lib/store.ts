import { useSyncExternalStore } from "react";
import type { Course } from "../types";
import { loadCourses, saveCourses } from "./storage";

interface State {
  courses: Course[];
  saveError: boolean;
}

let state: State = { courses: loadCourses(), saveError: false };
const listeners = new Set<() => void>();

export function setCourses(fn: (cs: Course[]) => Course[]) {
  const courses = fn(state.courses);
  state = { courses, saveError: !saveCourses(courses) };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCourseStore() {
  return useSyncExternalStore(subscribe, () => state);
}
