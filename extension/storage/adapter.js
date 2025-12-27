import Dexie from "dexie";
import {
  ANALYSIS_CACHE_FIELDS,
  ANALYSIS_CACHE_TABLE,
  DB_VERSION,
  LOG_FIELDS,
  LOG_TABLE,
  SNAPSHOT_FIELDS,
  SNAPSHOT_TABLE,
  getSchemaDefinition,
} from "./schema.js";
import { pruneLogs, pruneSnapshots } from "./retention.js";
import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";

const hasIndexedDb = typeof indexedDB !== "undefined";

function sanitizeRecord(record, shape) {
  const normalized = {};
  Object.keys(shape).forEach((key) => {
    if (record[key] !== undefined) normalized[key] = record[key];
  });
  return normalized;
}

class MemoryAdapter {
  constructor(config = DEFAULT_RUNTIME_CONFIG) {
    this.config = getRuntimeConfig(config);
    this.snapshots = [];
    this.logs = [];
    this.analysisCache = new Map();
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG) {
    this.config = getRuntimeConfig(config);
  }

  async addSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    this.snapshots.push(...sanitized);
    return { inserted: sanitized.length };
  }

  async getSnapshots() {
    return [...this.snapshots];
  }

  async pruneSnapshots(now = new Date()) {
    const before = this.snapshots.length;
    this.snapshots = pruneSnapshots(this.snapshots, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      config: this.config,
    });
    return { removed: before - this.snapshots.length, remaining: this.snapshots.length };
  }

  async saveLog(entry) {
    this.logs.push(sanitizeRecord(entry, LOG_FIELDS));
    return entry;
  }

  async getLogs() {
    return [...this.logs];
  }

  async pruneLogs(now = new Date()) {
    const before = this.logs.length;
    this.logs = pruneLogs(this.logs, { now });
    return { removed: before - this.logs.length, remaining: this.logs.length };
  }

  async updateAnalysisCache(symbols = [], lastAnalyzedAt) {
    symbols.forEach((symbol) => {
      if (!symbol) return;
      this.analysisCache.set(String(symbol), lastAnalyzedAt);
    });
    return { updated: symbols.length };
  }

  async getAnalysisCache() {
    return Array.from(this.analysisCache.entries()).map(([symbol, lastAnalyzedAt]) => ({
      symbol,
      lastAnalyzedAt,
    }));
  }
}

class DexieAdapter extends MemoryAdapter {
  constructor(config = DEFAULT_RUNTIME_CONFIG) {
    super(config);
    this.db = new Dexie(this.config.DB_NAME);
    this.db.version(DB_VERSION).stores(getSchemaDefinition());
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG) {
    const nextConfig = getRuntimeConfig(config);
    const shouldReset = nextConfig.DB_NAME !== this.config.DB_NAME;
    this.config = nextConfig;
    if (shouldReset) {
      this.db.close();
      this.db = new Dexie(this.config.DB_NAME);
      this.db.version(DB_VERSION).stores(getSchemaDefinition());
    }
  }

  async addSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    await this.db[SNAPSHOT_TABLE].bulkPut(sanitized);
    return { inserted: sanitized.length };
  }

  async getSnapshots() {
    return this.db[SNAPSHOT_TABLE].toArray();
  }

  async pruneSnapshots(now = new Date()) {
    const all = await this.getSnapshots();
    const pruned = pruneSnapshots(all, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      config: this.config,
    });
    if (pruned.length !== all.length) {
      await this.db[SNAPSHOT_TABLE].clear();
      await this.db[SNAPSHOT_TABLE].bulkPut(pruned);
    }
    return { removed: all.length - pruned.length, remaining: pruned.length };
  }

  async saveLog(entry) {
    const sanitized = sanitizeRecord(entry, LOG_FIELDS);
    await this.db[LOG_TABLE].add(sanitized);
    return sanitized;
  }

  async getLogs() {
    return this.db[LOG_TABLE].toArray();
  }

  async pruneLogs(now = new Date()) {
    const all = await this.getLogs();
    const pruned = pruneLogs(all, { now });
    if (pruned.length !== all.length) {
      await this.db[LOG_TABLE].clear();
      await this.db[LOG_TABLE].bulkPut(pruned);
    }
    return { removed: all.length - pruned.length, remaining: pruned.length };
  }

  async updateAnalysisCache(symbols = [], lastAnalyzedAt) {
    const rows = symbols
      .filter(Boolean)
      .map((symbol) => sanitizeRecord({ symbol, lastAnalyzedAt }, ANALYSIS_CACHE_FIELDS));
    if (rows.length) await this.db[ANALYSIS_CACHE_TABLE].bulkPut(rows);
    return { updated: rows.length };
  }

  async getAnalysisCache() {
    return this.db[ANALYSIS_CACHE_TABLE].toArray();
  }
}

export function createStorageAdapter(config = DEFAULT_RUNTIME_CONFIG) {
  if (hasIndexedDb) return new DexieAdapter(config);
  return new MemoryAdapter(config);
}

export const storageAdapter = createStorageAdapter();
