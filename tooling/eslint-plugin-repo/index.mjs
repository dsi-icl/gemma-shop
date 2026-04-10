const ALLOWED_FILE_SUFFIX = '/apps/web/src/server/collections.ts';
// The collection layer itself is the canonical place for db.collection() calls.
const ALLOWED_COLLECTION_LAYER_SEGMENT = '/packages/db/src/collections/';
// Test seed scripts may use raw db.collection() to insert fixtures with deterministic IDs.
const ALLOWED_SEED_SUFFIX = '/tooling/testing/seed.mjs';
const ALLOWED_AUDIT_FILE_SUFFIX = '/apps/web/src/server/audit.ts';
const WEB_APP_SRC_SEGMENT = '/apps/web/src/';
const ALLOWED_ZOD_IMPORT_FILE_SUFFIX = '/apps/web/src/lib/zod.ts';

function normalizePath(filePath) {
    return String(filePath || '').replaceAll('\\', '/');
}

function isAllowedFile(filePath) {
    const normalized = normalizePath(filePath);
    return (
        normalized.endsWith(ALLOWED_FILE_SUFFIX) ||
        normalized.includes(ALLOWED_COLLECTION_LAYER_SEGMENT) ||
        normalized.endsWith(ALLOWED_SEED_SUFFIX)
    );
}

function isAllowedAuditFile(filePath) {
    const normalized = normalizePath(filePath);
    return normalized.endsWith(ALLOWED_AUDIT_FILE_SUFFIX);
}

function isWebAppSourceFile(filePath) {
    const normalized = normalizePath(filePath);
    return normalized.includes(WEB_APP_SRC_SEGMENT);
}

function isAllowedZodImportFile(filePath) {
    const normalized = normalizePath(filePath);
    return normalized.endsWith(ALLOWED_ZOD_IMPORT_FILE_SUFFIX);
}

function isDirectZodSpecifier(specifier) {
    return specifier === 'zod' || specifier.startsWith('zod/');
}

function isDbCollectionCall(node) {
    if (!node || node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false;

    const object = callee.object;
    const property = callee.property;

    return (
        object?.type === 'Identifier' &&
        object.name === 'db' &&
        property?.type === 'Identifier' &&
        property.name === 'collection'
    );
}

const noDirectDbCollectionRule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow direct db.collection(...) calls outside apps/web/src/server/collections.ts'
        },
        schema: [],
        messages: {
            noDirectDbCollection:
                'Use shared collections from ~/server/collections instead of direct db.collection(...).'
        }
    },
    create(context) {
        const filename = context.filename || '';
        if (isAllowedFile(filename)) return {};

        return {
            CallExpression(node) {
                if (!isDbCollectionCall(node)) return;
                context.report({
                    node,
                    messageId: 'noDirectDbCollection'
                });
            }
        };
    }
};

function isAuditInsertCall(node) {
    if (!node || node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false;
    if (callee.property?.type !== 'Identifier' || callee.property.name !== 'insertOne') {
        return false;
    }

    const target = callee.object;
    if (!target) return false;

    if (target.type === 'Identifier' && target.name === 'audits') return true;

    if (
        target.type === 'MemberExpression' &&
        !target.computed &&
        target.object?.type === 'Identifier' &&
        target.object.name === 'collections' &&
        target.property?.type === 'Identifier' &&
        target.property.name === 'audits'
    ) {
        return true;
    }

    return false;
}

const noDirectAuditInsertRule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow direct audits.insertOne(...) outside apps/web/src/server/audit.ts'
        },
        schema: [],
        messages: {
            noDirectAuditInsert:
                'Use centralized audit helpers from ~/server/audit instead of direct audit log inserts.'
        }
    },
    create(context) {
        const filename = context.filename || '';
        if (isAllowedAuditFile(filename)) return {};

        return {
            CallExpression(node) {
                if (!isAuditInsertCall(node)) return;
                context.report({
                    node,
                    messageId: 'noDirectAuditInsert'
                });
            }
        };
    }
};

const noDirectZodImportRule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow direct zod imports in apps/web/src to ensure jitless configuration is always applied'
        },
        schema: [],
        messages: {
            noDirectZodImport:
                'Import { z } from "~/lib/zod" instead of importing directly from "zod".'
        }
    },
    create(context) {
        const filename = context.filename || '';
        if (!isWebAppSourceFile(filename) || isAllowedZodImportFile(filename)) return {};

        return {
            ImportDeclaration(node) {
                if (typeof node.source?.value !== 'string') return;
                if (!isDirectZodSpecifier(node.source.value)) return;
                context.report({
                    node: node.source,
                    messageId: 'noDirectZodImport'
                });
            },
            ImportExpression(node) {
                if (node.source?.type !== 'Literal') return;
                if (typeof node.source.value !== 'string') return;
                if (!isDirectZodSpecifier(node.source.value)) return;
                context.report({
                    node: node.source,
                    messageId: 'noDirectZodImport'
                });
            },
            CallExpression(node) {
                if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return;
                const firstArg = node.arguments?.[0];
                if (!firstArg || firstArg.type !== 'Literal') return;
                if (typeof firstArg.value !== 'string') return;
                if (!isDirectZodSpecifier(firstArg.value)) return;
                context.report({
                    node: firstArg,
                    messageId: 'noDirectZodImport'
                });
            }
        };
    }
};

export default {
    meta: {
        name: 'eslint-plugin-repo',
        version: '0.0.1'
    },
    rules: {
        'no-direct-db-collection': noDirectDbCollectionRule,
        'no-direct-audit-insert': noDirectAuditInsertRule,
        'no-direct-zod-import': noDirectZodImportRule
    }
};
