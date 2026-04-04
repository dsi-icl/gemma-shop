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

/** Minimum shape every app-owned document must satisfy. */
export interface BaseDoc {
    _id: ObjectId;
    createdAt: number;
}

/**
 * Fields excluded from insert input — generated automatically by the collection layer.
 * `updatedAt` is excluded too even if optional, because the layer always writes it.
 */
type InsertData<TDoc extends BaseDoc> = Omit<TDoc, '_id' | 'createdAt' | 'updatedAt'>;

/**
 * Fields excluded from update $set — `_id` and `createdAt` are immutable after insert.
 */
type UpdateData<TDoc extends BaseDoc> = Partial<Omit<TDoc, '_id' | 'createdAt'>>;

/**
 * Abstract base for all app-owned MongoDB collections.
 *
 * Responsibilities:
 *  - `fromDB`  normalises any legacy timestamp format → epoch ms on read.
 *  - `insert`  auto-generates `_id`, `createdAt`, `updatedAt`.
 *  - `update`  always stamps `updatedAt`.
 *  - `softDelete` stamps `deletedAt`, `deletedBy`, `updatedAt`.
 *
 * The internal raw collection is typed as `Collection<Document>` so the layer
 * accepts documents with mixed legacy timestamp types without TypeScript errors.
 * All public methods return fully-typed `TDoc` values after normalisation.
 */
export abstract class BaseCollection<TDoc extends BaseDoc> {
    /** The MongoDB collection name — used only for diagnostics. */
    abstract readonly collectionName: string;

    /**
     * Names of fields that must be normalised to epoch ms.
     * Subclasses declare their own timestamp field names here.
     * `createdAt` and `updatedAt` are always included by the base.
     */
    protected abstract readonly epochFields: ReadonlyArray<string>;

    protected constructor(protected readonly raw: Collection<Document>) {}

    /** Normalise a raw MongoDB document to `TDoc` with epoch ms timestamps. */
    protected fromDB(doc: Document): TDoc {
        const out = { ...doc } as Record<string, unknown>;
        for (const field of ['createdAt', 'updatedAt', ...this.epochFields]) {
            const val = doc[field];
            if (val != null) out[field] = toEpoch(val);
        }
        return out as unknown as TDoc;
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

    /** Insert a new document. `_id`, `createdAt`, and `updatedAt` are auto-generated. */
    async insert(data: InsertData<TDoc>): Promise<TDoc> {
        const now = Date.now();
        const doc: Document = { _id: new OID(), createdAt: now, updatedAt: now, ...data };
        await this.raw.insertOne(doc);
        return this.fromDB(doc);
    }

    /**
     * Update fields on a document by id. `updatedAt` is always stamped automatically.
     * Returns the updated document, or `null` if not found.
     */
    async update(id: string | ObjectId, $set: UpdateData<TDoc>): Promise<TDoc | null> {
        const result = await this.raw.findOneAndUpdate(
            { _id: new OID(id) },
            { $set: { ...$set, updatedAt: Date.now() } } as UpdateFilter<Document>,
            { returnDocument: 'after' }
        );
        return result ? this.fromDB(result) : null;
    }

    /**
     * Apply an arbitrary MongoDB update expression by id.
     * Use when you need `$unset`, `$push`, etc. — `updatedAt` is NOT auto-stamped here;
     * callers are responsible for including it in the expression if needed.
     */
    async updateRaw(id: string | ObjectId, update: UpdateFilter<Document>): Promise<TDoc | null> {
        const result = await this.raw.findOneAndUpdate({ _id: new OID(id) }, update, {
            returnDocument: 'after'
        });
        return result ? this.fromDB(result) : null;
    }

    /** Soft-delete: stamps `deletedAt`, `deletedBy`, and `updatedAt`. */
    async softDelete(id: string | ObjectId, by: string): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne(
            { _id: new OID(id) },
            { $set: { deletedAt: now, deletedBy: by, updatedAt: now } }
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
