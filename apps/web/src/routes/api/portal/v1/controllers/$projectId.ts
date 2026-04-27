import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createFileRoute } from '@tanstack/react-router';

import { CONTROLLER_DIR } from '~/lib/serverVariables';
import { logAuditDenied } from '~/server/audit';
import { getProject } from '~/server/projects';

export const Route = createFileRoute('/api/portal/v1/controllers/$projectId')({
    server: {
        handlers: {
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
                    return new Response('Project not found', { status: 404 });
                }

                let html: string;
                try {
                    html = await readFile(
                        join(CONTROLLER_DIR, projectId, 'controller.html'),
                        'utf8'
                    );
                } catch {
                    return new Response('No controller HTML found', { status: 404 });
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
