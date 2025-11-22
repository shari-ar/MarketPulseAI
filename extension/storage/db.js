import Dexie from "../vendor/dexie.mjs";
import { DB_NAME, SCHEMA_MIGRATIONS } from "./schema.js";

const db = new Dexie(DB_NAME);

Object.entries(SCHEMA_MIGRATIONS)
  .map(([version, definition]) => [Number(version), definition])
  .sort(([a], [b]) => a - b)
  .forEach(([version, { stores, upgrade }]) => {
    const dexieVersion = db.version(version).stores(stores);
    if (upgrade) {
      dexieVersion.upgrade(upgrade);
    }
  });

export default db;
