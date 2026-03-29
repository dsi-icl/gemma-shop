const ALLOWED_FILE_SUFFIX = '/apps/web/src/server/collections.ts';
const ALLOWED_AUDIT_FILE_SUFFIX = '/apps/web/src/server/audit.ts';

function normalizePath(filePath) {
    return String(filePath || '').replaceAll('\\', '/');
}

function isAllowedFile(filePath) {
    const normalized = normalizePath(filePath);
    return normalized.endsWith(ALLOWED_FILE_SUFFIX);
}

function isAllowedAuditFile(filePath) {
    const normalized = normalizePath(filePath);
    return normalized.endsWith(ALLOWED_AUDIT_FILE_SUFFIX);
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

    if (target.type === 'Identifier' && target.name === 'auditLogs') return true;

    if (
        target.type === 'MemberExpression' &&
        !target.computed &&
        target.object?.type === 'Identifier' &&
        target.object.name === 'collections' &&
        target.property?.type === 'Identifier' &&
        target.property.name === 'auditLogs'
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
                'Disallow direct auditLogs.insertOne(...) outside apps/web/src/server/audit.ts'
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

export default {
    meta: {
        name: 'eslint-plugin-repo',
        version: '0.0.1'
    },
    rules: {
        'no-direct-db-collection': noDirectDbCollectionRule,
        'no-direct-audit-insert': noDirectAuditInsertRule
    }
};
