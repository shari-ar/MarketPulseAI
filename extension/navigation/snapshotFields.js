const OPTIONAL_SNAPSHOT_FIELDS = new Set(["floatingShares", "predictedSwingPercent"]);

export function missingSnapshotFields(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return ["snapshot"];

  return Object.entries(snapshot)
    .filter(
      ([field, value]) =>
        !OPTIONAL_SNAPSHOT_FIELDS.has(field) && (value === null || value === undefined)
    )
    .map(([field]) => field);
}

export function hasCompleteSnapshot(snapshot) {
  const missing = missingSnapshotFields(snapshot);
  return missing.length === 0;
}
