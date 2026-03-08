import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequest as _getRequest } from '@tanstack/react-start/server';

export const getRequest = createServerOnlyFn(() => {
    const req = _getRequest();
    return req;
});
