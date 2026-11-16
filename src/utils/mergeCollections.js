// Three-way merge for the app's array collections, used when the server rejects a save because the
// collection changed elsewhere (e.g. the check-in kiosk recorded someone while the owner was
// editing). Instead of discarding either side, the local edits — what changed between `base` (the
// version this device last synced) and `local` — are replayed onto the server's latest copy.
//
// Records are matched by a per-collection key; field-level replay means a kiosk-recorded checkIn
// time survives the owner changing the same day's status.

const recordKey = {
  asm_attendance: (r) => `${r.employeeId}_${r.date}`,
};
const keyOf = (collection) => recordKey[collection] || ((r) => r.id);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Returns the merged array, or null when the collection can't be merged (not an array of
// identifiable records) and the conflict must go to the user.
export function mergeCollection(collection, base, local, server) {
  if (![base, local, server].every(Array.isArray)) return null;
  const key = keyOf(collection);
  if ([...base, ...local, ...server].some((r) => !r || typeof r !== 'object' || key(r) == null)) return null;

  const baseMap = new Map(base.map((r) => [key(r), r]));
  const localMap = new Map(local.map((r) => [key(r), r]));
  const result = new Map(server.map((r) => [key(r), r]));

  for (const [k, rec] of localMap) {
    const before = baseMap.get(k);
    if (before && same(before, rec)) continue;          // untouched here: server copy stands
    const theirs = result.get(k);
    if (!theirs) { result.set(k, rec); continue; }       // new here (or deleted there): keep ours
    const changed = {};
    for (const f of new Set([...Object.keys(rec), ...Object.keys(before || {})])) {
      if (!before || !same(before[f], rec[f])) changed[f] = rec[f];
    }
    const merged = { ...theirs, ...changed };
    for (const f of Object.keys(changed)) if (changed[f] === undefined) delete merged[f];
    result.set(k, merged);
  }
  for (const k of baseMap.keys()) {
    if (!localMap.has(k)) result.delete(k);              // deleted here
  }
  return [...result.values()];
}
