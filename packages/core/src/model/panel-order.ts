/** Convert a gap in filtered Cards into the full document's insertion index. */
export function insertionIndex(
  fullIds: readonly string[],
  shownIds: readonly string[],
  movingId: string,
  gap: number,
): number {
  const full = fullIds.filter((id) => id !== movingId);
  const shown = shownIds.filter((id) => id !== movingId);
  const sourceGap = Math.max(0, Math.min(gap, shownIds.length));
  const movingVisible = shownIds.indexOf(movingId);
  const normalized = sourceGap - (movingVisible >= 0 && movingVisible < sourceGap ? 1 : 0);
  const clamped = Math.max(0, Math.min(normalized, shown.length));
  const before = shown[clamped];
  if (before) {
    const index = full.indexOf(before);
    if (index >= 0) return index;
  }
  const last = shown.at(-1);
  if (last) {
    const index = full.indexOf(last);
    if (index >= 0) return index + 1;
  }
  return full.length;
}
