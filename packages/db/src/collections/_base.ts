import '@tanstack/react-start/server-only';
import type { Collection, Document, Filter, FindOptions, ObjectId, UpdateFilter } from 'mongodb';
import { ObjectId as OID } from 'mongodb';

/** Converts any legacy timestamp format (Date, ISO string, epoch number) to epoch ms. */
export function toEpoch(value: unknown): number {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') {
        const n = Date.parse(value);
        return Number.isFinite(n) ? n : Date.now();
    }
    return Date.now();
}

/** A function that migrates a raw document from schema version N to version N+1. */
export type MigrationFn = (doc: Document) => Document;

/**
 * Map of migration functions keyed by the version they migrate FROM.
 * `migrations[0]` upgrades a v0 document to v1, `migrations[1]` upgrades v1 → v2, etc.
 */
export type MigrationMap = Record<number, MigrationFn>;

/** Minimum shape every app-owned document must satisfy. */
export interface BaseDoc {
    _id: ObjectId;
    createdAt: number;
    /** Internal schema version. Managed by the collection layer — do not set manually. */
    _version?: number;
}

/**
 * Fields excluded from insert input — generated automatically by the collection layer.
 */
type InsertData<TDoc extends BaseDoc> = Omit<TDoc, '_id' | 'createdAt' | 'updatedAt' | '_version'>;

/**
 * Fields excluded from update $set — `_id`, `createdAt`, and `_version` are immutable
 * after insert (the layer always writes the current version on every update).
 */
type UpdateData<TDoc extends BaseDoc> = Partial<Omit<TDoc, '_id' | 'createdAt' | '_version'>>;

/**
 * Abstract base for all app-owned MongoDB collections.
 *
 * Responsibilities:
 *  - `fromDB`    applies the migration chain for stale documents, then writes back
 *                asynchronously using a version guard to prevent racing a concurrent write.
 *  - `insert`    auto-generates `_id`, `createdAt`, `updatedAt`, `_version`.
 *  - `update`    always stamps `updatedAt` and `_version`.
 *  - `softDelete` stamps `deletedAt`, `deletedBy`, `updatedAt`, `_version`.
 *
 * Subclasses must declare:
 *  - `currentVersion` — the schema version stamped on every new write.
 *  - `migrations`     — a map of upgrade functions (version N → N+1).
 */
export abstract class BaseCollection<TDoc extends BaseDoc> {
    /** The MongoDB collection name — used only for diagnostics. */
    abstract readonly collectionName: string;

    /**
     * The current schema version. Every insert/update stamps this value as `_version`.
     * Documents read with a lower version are migrated transparently via `fromDB`.
     */
    abstract readonly currentVersion: number;

    /**
     * Migration functions keyed by the version they upgrade FROM.
     * Default is empty (no migrations needed yet). Override in subclasses.
     */
    protected readonly migrations: MigrationMap = {};

    protected constructor(protected readonly raw: Collection<Document>) {}

    /**
     * Normalise a raw MongoDB document to `TDoc`:
     *  1. Apply each migration step from the stored version up to `currentVersion`.
     *  2. Fire-and-forget write-back if any migration was applied, guarded by a
     *     version filter so a concurrent update's write is never overwritten.
     */
    protected fromDB(doc: Document): TDoc {
        let current = { ...doc } as Document;
        let version = (current._version as number | undefined) ?? 0;
        const initialVersion = version;

        while (version < this.currentVersion) {
            const migrate = this.migrations[version];
            if (!migrate) break;
            current = migrate(current);
            version++;
        }

        // Write back if any migration ran. The filter ensures this is a no-op if
        // a concurrent update already advanced the version past our starting point.
        if (version > initialVersion) {
            const { _id, ...rest } = current;
            this.raw
                .updateOne(
                    { _id, _version: { $not: { $gte: this.currentVersion } } },
                    { $set: { ...rest, _version: version } }
                )
                .catch(() => {});
        }

        return { ...current, _version: version } as unknown as TDoc;
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    async findById(id: string | ObjectId): Promise<TDoc | null> {
        const doc = await this.raw.findOne({ _id: new OID(id) });
        return doc ? this.fromDB(doc) : null;
    }

    async findOne(filter: Filter<Document>): Promise<TDoc | null> {
        const doc = await this.raw.findOne(filter);
        return doc ? this.fromDB(doc) : null;
    }

    async find(filter: Filter<Document> = {}, options?: FindOptions): Promise<TDoc[]> {
        const docs = await this.raw.find(filter, options).toArray();
        return docs.map((d) => this.fromDB(d));
    }

    async count(filter: Filter<Document> = {}): Promise<number> {
        return this.raw.countDocuments(filter);
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /** Insert a new document. `_id`, `createdAt`, `updatedAt`, and `_version` are auto-generated. */
    async insert(data: InsertData<TDoc>): Promise<TDoc> {
        const now = Date.now();
        const doc: Document = {
            _id: new OID(),
            createdAt: now,
            updatedAt: now,
            _version: this.currentVersion,
            ...data
        };
        await this.raw.insertOne(doc);
        return this.fromDB(doc);
    }

    /**
     * Update fields on a document by id. `updatedAt` and `_version` are always stamped.
     * Returns the updated document, or `null` if not found.
     */
    async update(id: string | ObjectId, $set: UpdateData<TDoc>): Promise<TDoc | null> {
        const result = await this.raw.findOneAndUpdate(
            { _id: new OID(id) },
            {
                $set: { ...$set, updatedAt: Date.now(), _version: this.currentVersion }
            } as UpdateFilter<Document>,
            { returnDocument: 'after' }
        );
        return result ? this.fromDB(result) : null;
    }

    /**
     * Apply an arbitrary MongoDB update expression by id.
     * Use when you need `$unset`, `$push`, etc. — `updatedAt` and `_version` are NOT
     * auto-stamped here; callers are responsible for including them if needed.
     */
    async updateRaw(id: string | ObjectId, update: UpdateFilter<Document>): Promise<TDoc | null> {
        const result = await this.raw.findOneAndUpdate({ _id: new OID(id) }, update, {
            returnDocument: 'after'
        });
        return result ? this.fromDB(result) : null;
    }

    /** Soft-delete: stamps `deletedAt`, `deletedBy`, `updatedAt`, and `_version`. */
    async softDelete(id: string | ObjectId, by: string): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne(
            { _id: new OID(id) },
            {
                $set: {
                    deletedAt: now,
                    deletedBy: by,
                    updatedAt: now,
                    _version: this.currentVersion
                }
            }
        );
    }

    /** Hard-delete — permanent removal. Use with care. */
    async delete(id: string | ObjectId): Promise<void> {
        await this.raw.deleteOne({ _id: new OID(id) });
    }

    /**
     * Escape hatch: returns the underlying raw Collection<Document>.
     * Use only for complex aggregations or bulk operations that the base API doesn't cover.
     * Remember to call `fromDB` on any documents you read back.
     */
    get collection(): Collection<Document> {
        return this.raw;
    }
}
