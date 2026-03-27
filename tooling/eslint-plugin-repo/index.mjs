const ALLOWED_FILE_SUFFIX = '/apps/web/src/server/collections.ts';

function normalizePath(filePath) {
    return String(filePath || '').replaceAll('\\', '/');
}

function isAllowedFile(filePath) {
    const normalized = normalizePath(filePath);
    return normalized.endsWith(ALLOWED_FILE_SUFFIX);
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

export default {
    meta: {
        name: 'eslint-plugin-repo',
        version: '0.0.1'
    },
    rules: {
        'no-direct-db-collection': noDirectDbCollectionRule
    }
};
