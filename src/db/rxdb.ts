import {
    ExtractDocumentTypeFromTypedRxJsonSchema,
    RxDocument,
    RxJsonSchema,
    toTypedRxJsonSchema
} from 'rxdb';
import { createRxDatabase, addRxPlugin, RxCollection } from 'rxdb/plugins/core';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedKeyCompressionStorage } from 'rxdb/plugins/key-compression';
import { getRxStorageLocalstorage } from 'rxdb/plugins/storage-localstorage';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

addRxPlugin(RxDBDevModePlugin);

const shapeSchemaLiteral = {
    title: 'todos',
    version: 0,
    type: 'object',
    primaryKey: 'id',
    properties: {
        id: { type: 'string', maxLength: 100 },
        type: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        height: { type: 'number' },
        width: { type: 'number' },
        rotation: { type: 'number' },
        fill: { type: 'string' }
    },
    required: ['id', 'type']
} as const;

const typedShapeSchemaLiteral = toTypedRxJsonSchema(shapeSchemaLiteral);

type ShapeDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof typedShapeSchemaLiteral>;
type ShapeDocMethods = {};
type ShapeDocument = RxDocument<ShapeDocType, ShapeDocMethods>;

type ShapeColMethods = {};
type ShapeCollection = RxCollection<ShapeDocument, ShapeColMethods>;

export const shapeSchema: RxJsonSchema<ShapeDocType> = typedShapeSchemaLiteral;

type GemmaShopDocCatalog = {
    shapes: ShapeCollection;
};

// type GemmaShopDB = RxDatabase<GemmaShopDocCatalog>
export const db = await createRxDatabase<GemmaShopDocCatalog>({
    name: 'gemma-shop-v0',
    storage: wrappedValidateAjvStorage({
        storage: wrappedKeyCompressionStorage({
            storage: getRxStorageLocalstorage()
        })
    })
});

await db.addCollections({
    shapes: {
        schema: typedShapeSchemaLiteral
    }
});
