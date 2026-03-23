import { join } from 'path';

import { env } from '@repo/env';

export const PORT = env.PORT;
export const APP_DATA_DIR = env.APP_DATA_DIR;
export const UPLOAD_DIR = env.UPLOAD_DIR || join(APP_DATA_DIR, 'uploads');
export const TMP_DIR = env.TMP_DIR || join(APP_DATA_DIR, 'tmp');
export const ASSET_DIR = env.ASSET_DIR || join(APP_DATA_DIR, 'assets');
