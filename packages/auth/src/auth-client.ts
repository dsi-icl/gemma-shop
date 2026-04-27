import { adminClient, emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { auth } from './auth';

const authClient = createAuthClient({
    baseURL:
        typeof window !== 'undefined'
            ? window.location.origin
            : process.env.VITE_BASE_URL || 'http://localhost:3000',
    plugins: [inferAdditionalFields<typeof auth>(), adminClient(), emailOTPClient()]
});

export default authClient;
