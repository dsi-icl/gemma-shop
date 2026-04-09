import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/')({
    beforeLoad: () => {
        throw redirect({ to: '/admin/users' });
    },
    head: () => ({
        meta: [{ title: 'Admin · GemmaShop' }]
    }),
    component: () => null
});
