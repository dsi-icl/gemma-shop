import { Provider } from '@lexical/yjs';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export function createWebsocketProvider(id: string, yjsDocMap: Map<string, Y.Doc>): Provider {
    const doc = getDocFromMap(id, yjsDocMap);

    return new WebsocketProvider('ws://localhost:3670/yjs', id, doc, {
        connect: false
    }) as unknown as Provider;
}

function getDocFromMap(id: string, yjsDocMap: Map<string, Y.Doc>): Y.Doc {
    let doc = yjsDocMap.get(id);

    if (doc === undefined) {
        doc = new Y.Doc();
        yjsDocMap.set(id, doc);
    } else {
        doc.load();
    }

    return doc;
}
