import { defineWebSocketHandler } from 'nitro/h3';
import { createHandler } from 'y-crossws';

export default defineWebSocketHandler(createHandler().hooks);
