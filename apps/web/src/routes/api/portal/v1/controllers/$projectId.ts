import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createFileRoute } from '@tanstack/react-router';

import { getCorsHeaders, json } from '~/lib/portalHttp';
import { CONTROLLER_DIR } from '~/lib/serverVariables';
import { logAuditDenied } from '~/server/audit';
import { getProject } from '~/server/projects';

export const Route = createFileRoute('/api/portal/v1/controllers/$projectId')({
    server: {
        handlers: {
            OPTIONS: async ({ request }: { request: Request }) =>
                new Response(null, {
                    status: 204,
                    headers: getCorsHeaders(request)
                }),
            GET: async ({
                params,
                request
            }: {
                params: { projectId: string };
                request: Request;
            }) => {
                const { projectId } = params;

                const project = await getProject(projectId);
                if (!project) {
                    await logAuditDenied({
                        action: 'CUSTOM_CONTROLLER_HTML_DENIED',
                        resourceType: 'project',
                        resourceId: projectId,
                        reasonCode: 'PROJECT_NOT_FOUND',
                        executionContext: {
                            surface: 'http',
                            operation: 'GET /api/portal/v1/controllers/$projectId',
                            request
                        }
                    });
                    return json(request, 404, { error: 'Project not found' });
                }

                let html: string;
                try {
                    html = await readFile(
                        join(CONTROLLER_DIR, project.id, 'controller.html'),
                        'utf8'
                    );
                } catch {
                    return json(request, 404, { error: 'No controller HTML found' });
                }

                return new Response(html, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-store'
                    }
                });
            }
        }
    }
});
