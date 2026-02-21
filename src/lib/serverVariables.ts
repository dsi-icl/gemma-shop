import { join } from 'path';

export const PORT = 3000;
export const ASSET_DIR = join(process.cwd(), 'public', 'assets');
export const TMP_DIR = join(process.cwd(), '.tmp');
