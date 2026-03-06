import { emailOTPClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient({
    baseURL: process.env.VITE_BASE_URL,
    plugins: [magicLinkClient(), emailOTPClient()]
});

export default authClient;
