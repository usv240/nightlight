/**
 * Idempotent webhook intake: Ring may redeliver a webhook, and processing
 * a 3am doorway event twice would play the voice prompt twice. Deduplicate
 * on meta.request_id with a bounded TTL map (LRU eviction on insert).
 *
 * In a multi-instance deployment back this with a conditional database put;
 * the interface is intentionally identical (seen returns true only once).
 */
export class Deduper {
  private readonly seenAt = new Map<string, number>();

  constructor(
    private readonly maxEntries: number = 10_000,
    private readonly ttlMs: number = 24 * 3600_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true the first time an id is seen, false on duplicates. */
  firstSeen(requestId: string): boolean {
    const t = this.now();
    const prev = this.seenAt.get(requestId);
    if (prev !== undefined && t - prev < this.ttlMs) {
      // Refresh recency for LRU behavior.
      this.seenAt.delete(requestId);
      this.seenAt.set(requestId, prev);
      return false;
    }
    this.seenAt.delete(requestId);
    this.seenAt.set(requestId, t);
    this.evict(t);
    return true;
  }

  private evict(now: number): void {
    if (this.seenAt.size <= this.maxEntries) {
      // Still drop expired entries opportunistically from the front.
      for (const [id, at] of this.seenAt) {
        if (now - at >= this.ttlMs) this.seenAt.delete(id);
        else break;
      }
      return;
    }
    const excess = this.seenAt.size - this.maxEntries;
    let removed = 0;
    for (const id of this.seenAt.keys()) {
      this.seenAt.delete(id);
      removed += 1;
      if (removed >= excess) break;
    }
  }

  get size(): number {
    return this.seenAt.size;
  }
}
