import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { CaregiverAck, RingEvent } from "@nightlight/engine";

/**
 * Persistence for the household event log.
 *
 * The event log is the source of truth; every read model is a deterministic
 * replay of it (see household.ts). That makes the store interface tiny:
 * append events, append acknowledgements, and record which effects have
 * already been executed so a replay never runs a 3am voice prompt twice.
 *
 * MemoryStore backs local development and tests. DynamoStore backs the AWS
 * deployment (documented in docs/AWS.md): a single on-demand table, one
 * partition per household, sort-key prefixes for the three record kinds.
 * Effect executions use a conditional put, so even concurrent Lambda
 * instances agree that each effect runs exactly once.
 */

export interface EffectExecutionRecord {
  key: string;
  executedAt: string;
  detail: string;
}

export interface NightlightStore {
  appendEvent(householdId: string, event: RingEvent): Promise<void>;
  listEvents(householdId: string): Promise<RingEvent[]>;
  appendAck(householdId: string, ack: CaregiverAck): Promise<void>;
  listAcks(householdId: string): Promise<CaregiverAck[]>;
  /** Small per-household key-value metadata (Ring tokens, link state). */
  putMeta(householdId: string, key: string, value: string): Promise<void>;
  getMeta(householdId: string, key: string): Promise<string | null>;
  /** Returns true when this call claimed the effect (first execution). */
  claimEffect(householdId: string, key: string, record: Omit<EffectExecutionRecord, "key">): Promise<boolean>;
  listExecutions(householdId: string): Promise<EffectExecutionRecord[]>;
  reset(householdId: string): Promise<void>;
}

export class MemoryStore implements NightlightStore {
  private events = new Map<string, RingEvent[]>();
  private meta = new Map<string, string>();
  private acks = new Map<string, CaregiverAck[]>();
  private executions = new Map<string, Map<string, EffectExecutionRecord>>();

  async appendEvent(h: string, event: RingEvent): Promise<void> {
    const arr = this.events.get(h) ?? [];
    arr.push(event);
    this.events.set(h, arr);
  }

  async listEvents(h: string): Promise<RingEvent[]> {
    return [...(this.events.get(h) ?? [])].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  }

  async appendAck(h: string, ack: CaregiverAck): Promise<void> {
    const arr = this.acks.get(h) ?? [];
    arr.push(ack);
    this.acks.set(h, arr);
  }

  async listAcks(h: string): Promise<CaregiverAck[]> {
    return [...(this.acks.get(h) ?? [])];
  }

  async putMeta(h: string, key: string, value: string): Promise<void> {
    this.meta.set(`${h}:${key}`, value);
  }

  async getMeta(h: string, key: string): Promise<string | null> {
    return this.meta.get(`${h}:${key}`) ?? null;
  }

  async claimEffect(
    h: string,
    key: string,
    record: Omit<EffectExecutionRecord, "key">,
  ): Promise<boolean> {
    const map = this.executions.get(h) ?? new Map<string, EffectExecutionRecord>();
    if (map.has(key)) return false;
    map.set(key, { key, ...record });
    this.executions.set(h, map);
    return true;
  }

  async listExecutions(h: string): Promise<EffectExecutionRecord[]> {
    return [...(this.executions.get(h)?.values() ?? [])];
  }

  async reset(h: string): Promise<void> {
    this.events.delete(h);
    this.acks.delete(h);
    this.executions.delete(h);
  }
}

export class DynamoStore implements NightlightStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client?: DynamoDBClient,
  ) {
    this.doc = DynamoDBDocumentClient.from(
      client ?? new DynamoDBClient({}),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }

  private pk(h: string): string {
    return `HOUSEHOLD#${h}`;
  }

  private async queryPrefix(
    h: string,
    prefix: string,
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      // DynamoDB rejects empty strings in key conditions, so an empty
      // prefix (used by reset) queries the whole partition by pk alone.
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression:
            prefix === "" ? "pk = :pk" : "pk = :pk AND begins_with(sk, :sk)",
          ExpressionAttributeValues:
            prefix === ""
              ? { ":pk": this.pk(h) }
              : { ":pk": this.pk(h), ":sk": prefix },
          ExclusiveStartKey: lastKey,
        }),
      );
      items.push(...((res.Items as Record<string, unknown>[]) ?? []));
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return items;
  }

  async appendEvent(h: string, event: RingEvent): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: this.pk(h),
          sk: `EVENT#${event.ts}#${event.requestId ?? "no-id"}`,
          ...event,
        },
      }),
    );
  }

  async listEvents(h: string): Promise<RingEvent[]> {
    const items = await this.queryPrefix(h, "EVENT#");
    return items
      .map((i) => {
        const e: RingEvent = {
          ts: i.ts as string,
          type: i.type as RingEvent["type"],
          deviceId: i.deviceId as string,
        };
        if (typeof i.subType === "string") e.subType = i.subType;
        if (typeof i.requestId === "string") e.requestId = i.requestId;
        return e;
      })
      .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  }

  async appendAck(h: string, ack: CaregiverAck): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: this.pk(h), sk: `ACK#${ack.at}`, at: ack.at },
      }),
    );
  }

  async listAcks(h: string): Promise<CaregiverAck[]> {
    const items = await this.queryPrefix(h, "ACK#");
    return items.map((i) => ({ at: i.at as string }));
  }

  async putMeta(h: string, key: string, value: string): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: this.pk(h), sk: `META#${key}`, value },
      }),
    );
  }

  async getMeta(h: string, key: string): Promise<string | null> {
    const items = await this.queryPrefix(h, `META#${key}`);
    const v = items[0]?.value;
    return typeof v === "string" ? v : null;
  }

  async claimEffect(
    h: string,
    key: string,
    record: Omit<EffectExecutionRecord, "key">,
  ): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk: this.pk(h), sk: `EXEC#${key}`, key, ...record },
          ConditionExpression: "attribute_not_exists(sk)",
        }),
      );
      return true;
    } catch (err) {
      if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
        return false;
      }
      throw err;
    }
  }

  async listExecutions(h: string): Promise<EffectExecutionRecord[]> {
    const items = await this.queryPrefix(h, "EXEC#");
    return items.map((i) => ({
      key: i.key as string,
      executedAt: i.executedAt as string,
      detail: i.detail as string,
    }));
  }

  async reset(h: string): Promise<void> {
    // Demo-only operation: delete every item in the household partition,
    // 25 at a time (the BatchWrite limit).
    const all = await this.queryPrefix(h, "");
    for (let i = 0; i < all.length; i += 25) {
      const chunk = all.slice(i, i + 25);
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((item) => ({
              DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
            })),
          },
        }),
      );
    }
  }
}
