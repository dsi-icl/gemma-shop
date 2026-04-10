import { config, z } from 'zod';

// Disable Zod's JIT parser generation so CSP does not see eval/new Function probes.
config({ jitless: true });

export { z };
