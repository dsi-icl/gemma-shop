import { createFileRoute } from '@tanstack/react-router';

import type { AuthContext } from '~/server/requestAuthContext';
import { createWallMediaCookie } from '~/server/wallMediaCookie';

export const Route = createFileRoute('/api/wall/media-cookie')({
    server: {
        handlers: {
            POST: async ({ request, context }) => {
                const authContext: AuthContext = ((context ?? {}) as { authContext?: AuthContext })
                    .authContext ?? { guest: true };
                const device = authContext.device;

                if (device?.kind !== 'wall' || !device.wallId) {
                    return new Response('Unauthorized', { status: 401 });
                }

                const cookie = createWallMediaCookie({ request, device });
                if (!cookie) return new Response('Unauthorized', { status: 401 });

                return new Response(null, {
                    status: 204,
                    headers: {
                        'Set-Cookie': cookie,
                        'Cache-Control': 'no-store'
                    }
                });
            }
        }
    }
});
