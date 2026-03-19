import { adminClient, emailOTPClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient({
    baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3670',
    plugins: [adminClient(), magicLinkClient(), emailOTPClient()]
});

export default authClient;
