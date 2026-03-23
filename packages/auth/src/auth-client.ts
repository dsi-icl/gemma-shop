import { adminClient, emailOTPClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient({
    baseURL:
        typeof window !== 'undefined'
            ? window.location.origin
            : process.env.VITE_BASE_URL || 'http://localhost:3000',
    plugins: [adminClient(), magicLinkClient(), emailOTPClient()]
});

export default authClient;
