import Dexie, { type Table } from 'dexie';

type QueryCacheEntry = {
  key: string;
  collection: string;
  scope: string;
  updatedAt: number;
  data: unknown;
};

class QueryCacheDB extends Dexie {
  entries!: Table<QueryCacheEntry, string>;

  constructor() {
    super('PinNuoErpQueryCache');
    this.version(1).stores({
      entries: '&key, collection, scope, updatedAt',
    });
  }
}

const db = new QueryCacheDB();
const memoryCache = new Map<string, QueryCacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const collectionVersions = new Map<string, number>();

const FRESH_MS = 60_000;
const MAX_STALE_MS = 24 * 60 * 60_000;
const STALE_NETWORK_BUDGET_MS = 180;

function getScope() {
  if (typeof window === 'undefined') return 'server';
  try {
    const raw = window.localStorage.getItem('pnzj_erp_user')
      || window.localStorage.getItem('pnzj_user')
      || '';
    const user = raw ? JSON.parse(raw) : null;
    return String(user?.id || user?._id || user?.account || user?.phone || user?.name || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

function stableSerialize(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') return `[fn:${value.name || 'anonymous'}]`;
    return JSON.stringify(value) ?? String(value);
  }
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
    `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key], seen)}`
  )).join(',')}}`;
}

function hash(input: string) {
  let result = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    result ^= input.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function cacheKey(scope: string, collection: string, descriptor: unknown) {
  return `${scope}:${collection}:${hash(stableSerialize(descriptor))}`;
}

async function readEntry(key: string) {
  const memory = memoryCache.get(key);
  if (memory) return memory;
  try {
    const stored = await db.entries.get(key);
    if (stored) memoryCache.set(key, stored);
    return stored;
  } catch {
    return undefined;
  }
}

async function writeEntry(entry: QueryCacheEntry) {
  memoryCache.set(entry.key, entry);
  try {
    await db.entries.put(entry);
  } catch (error) {
    console.warn('[query-cache] persist failed', error);
  }
}

function runOnce<T>(key: string, loader: () => Promise<T>) {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const request = loader().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export async function cachedCloudQuery<T>(
  collection: string,
  descriptor: unknown,
  loader: () => Promise<T>,
): Promise<T> {
  const scope = getScope();
  const key = cacheKey(scope, collection, descriptor);
  const cached = await readEntry(key);
  const age = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;

  if (cached && age <= FRESH_MS) return cached.data as T;

  const versionAtStart = collectionVersions.get(collection) || 0;
  const network = runOnce(key, async () => {
    const data = await loader();
    if ((collectionVersions.get(collection) || 0) === versionAtStart) {
      await writeEntry({ key, collection, scope, updatedAt: Date.now(), data });
    }
    return data;
  });

  if (!cached || age > MAX_STALE_MS) return network;

  const timeout = new Promise<symbol>((resolve) => {
    window.setTimeout(() => resolve(STALE_RESULT), STALE_NETWORK_BUDGET_MS);
  });
  const guardedNetwork = network.catch((error) => {
    console.warn('[query-cache] refresh failed', collection, error);
    return STALE_RESULT;
  });
  const result = await Promise.race([guardedNetwork, timeout]);
  if (result === STALE_RESULT) {
    return cached.data as T;
  }
  return result as T;
}

const STALE_RESULT = Symbol('stale-cache-result');

export async function invalidateCollectionCache(collection: string) {
  collectionVersions.set(collection, (collectionVersions.get(collection) || 0) + 1);
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.collection === collection) memoryCache.delete(key);
  }
  try {
    await db.entries.where('collection').equals(collection).delete();
  } catch (error) {
    console.warn('[query-cache] invalidate failed', collection, error);
  }
}

export async function pruneQueryCache() {
  const cutoff = Date.now() - MAX_STALE_MS;
  try {
    await db.entries.where('updatedAt').below(cutoff).delete();
  } catch {
    // IndexedDB can be unavailable in restricted WebViews; memory caching still works.
  }
}

export async function clearQueryCache() {
  memoryCache.clear();
  inFlight.clear();
  collectionVersions.clear();
  try {
    await db.entries.clear();
  } catch {
    // Best-effort cleanup for WebViews with restricted IndexedDB access.
  }
}
