// A document navigation drops private media and React state at auth boundaries.
export function navigateFresh(path: string) {
  window.location.assign(path);
}
