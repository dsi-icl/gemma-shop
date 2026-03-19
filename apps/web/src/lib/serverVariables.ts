import { join } from 'path';

export const PORT = 3000;
export const UPLOAD_DIR = join(process.cwd(), '.uploads');
export const TMP_DIR = join(process.cwd(), '.tmp');
export const ASSET_DIR = join(process.cwd(), 'public', 'assets');
export const PUBLIC_ASSET_PROJECT_ID = '000000000000000000000001';
