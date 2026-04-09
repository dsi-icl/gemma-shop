import { createFileRoute } from '@tanstack/react-router';

import { buildInfo } from '~/lib/buildInfo';

export const Route = createFileRoute('/api/version')({
    server: {
        handlers: {
            GET: async () =>
                Response.json({
                    name: 'GemmaShop',
                    commit: buildInfo.commitSha,
                    builtAt: buildInfo.builtAt
                })
        }
    }
});
