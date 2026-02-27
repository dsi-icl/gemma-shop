import { defineWebSocketHandler } from 'nitro/h3';
import { z } from 'zod';

export default defineWebSocketHandler({
    open(peer) {
        peer.send({ id: peer.id, message: 'server hello' });
        peer.publish('channel', { id: peer.id, status: 'joined' });
        peer.subscribe('channel');
    },
    message(peer, mess) {
        // const message = z
        //     .object({
        //         type: z.literal('shapesCollectionFull'),
        //         shapes: z.object()
        //     })
        //     .parse(mess.json());
        const message = mess.json() as any;
        if (message.type === 'shapesCollectionFull') {
            // Implement spatial filtering with `message.shapes` here
            peer.publish('channel', {
                type: 'bShapesCollectionFull',
                shapes: message.shapes
            });
        } else if (message.type === 'inksCollectionFull') {
            // Implement spatial filtering with `message.shapes` here
            peer.publish('channel', {
                type: 'bInksCollectionFull',
                inks: message.inks
            });
        }
    },
    close(peer) {
        peer.publish('channel', { id: peer.id, status: 'left' });
    }
});
