import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import { z } from 'zod';

import { inkCollection } from '@/db/inkCollection';
import { shapesCollection } from '@/db/shapesCollection';
import { addListener, removeListener, getSocket } from '@/lib/websocketHandler';

const DO_NODE_WIDTH = 3072 / 16;
const DO_NODE_HEIGH = 432 / 4;

export const Route = createFileRoute('/viewer/$pid/$sid/')({
    component: RouteComponent
});

function RouteComponent() {
    const [renderCount, setRenderCount] = useState(0);
    const { data: shapes, collection: sCollection } = useLiveQuery((q) =>
        q.from({ shapes: shapesCollection })
    );
    const { data: inks, collection: iCollection } = useLiveQuery((q) =>
        q.from({ inks: inkCollection })
    );
    const routeParams = Route.useParams();
    const parsedParams = useMemo(
        () =>
            z
                .object({
                    pid: z.string().transform((p) => parseInt(p)),
                    sid: z.string().transform((s) => parseInt(s))
                })
                .safeParse(routeParams),
        [routeParams]
    );
    const routeSearch = Route.useSearch();
    const parsedSearch = useMemo(
        () =>
            z
                .object({
                    c: z.number(),
                    r: z.number()
                })
                .safeParse(routeSearch),
        [routeSearch]
    );

    const { data: params } = parsedParams;
    const { data: search } = parsedSearch;

    useEffect(() => {
        const sSub = sCollection.subscribeChanges(() => {
            setRenderCount(renderCount + 1);
        });
        const iSub = iCollection.subscribeChanges(() => {
            setRenderCount(renderCount + 1);
        });
        return () => {
            sSub.unsubscribe();
            iSub.unsubscribe();
        };
    }, []);

    const shapeInjector = useCallback(
        async (event: MessageEvent) => {
            let textData = '';
            if (typeof event.data === 'string') textData = event.data;
            if (event.data instanceof Blob) textData = await event.data.text();
            if (event.data instanceof ArrayBuffer) {
                const decoder = new TextDecoder('utf-8');
                textData = decoder.decode(event.data);
            }
            const data = JSON.parse(textData);
            // Bad code : This should rely on a Sync Engine !!!!
            if (data?.type === 'bShapesCollectionFull') {
                const { shapes } = data;
                if (!shapes || !Array.isArray(shapes)) return;
                const shapesMap = Object.fromEntries(shapes);
                const currentShapes = Array.from(shapesCollection.entries());
                const currentShapesIds = currentShapes.map((s) => s[1].id);
                const receivedShapesIds = shapes.map((s) => s[1].id);
                const removedShapes = currentShapesIds.filter(
                    (item) => !receivedShapesIds.includes(item)
                );
                const updatedShapes = currentShapesIds.filter((item) =>
                    receivedShapesIds.includes(item)
                );
                const newShapes = receivedShapesIds.filter(
                    (item) => !currentShapesIds.includes(item)
                );
                if (removedShapes.length > 0) shapesCollection.delete(removedShapes);
                if (updatedShapes.length > 0)
                    shapesCollection.update(updatedShapes, (s) => {
                        s.forEach((s) => {
                            Object.entries(shapesMap[s.id]).forEach(([key, value]) => {
                                (s as any)[key] = value;
                            });
                        });
                    });
                if (newShapes.length > 0)
                    shapesCollection.insert(newShapes.map((nid) => shapesMap[nid]));
            }
            if (data?.type === 'bInksCollectionFull') {
                const { inks } = data;
                if (!inks || !Array.isArray(inks)) return;
                const inksMap = Object.fromEntries(inks);
                const currentinks = Array.from(inkCollection.entries());
                const currentinksIds = currentinks.map((s) => s[1].id);
                const receivedinksIds = inks.map((s) => s[1].id);
                const removedinks = currentinksIds.filter(
                    (item) => !receivedinksIds.includes(item)
                );
                const updatedinks = currentinksIds.filter((item) => receivedinksIds.includes(item));
                const newinks = receivedinksIds.filter((item) => !currentinksIds.includes(item));
                console.log('n', newinks, 'r', removedinks, 'u', updatedinks);
                if (removedinks.length > 0) inkCollection.delete(removedinks);
                if (updatedinks.length > 0)
                    inkCollection.update(updatedinks, (s) => {
                        s.forEach((s) => {
                            Object.entries(inksMap[s.id]).forEach(([key, value]) => {
                                if (key === 'points') (s as any)[key] = new Array(...(value as []));
                                (s as any)[key] = value;
                            });
                        });
                    });
                if (newinks.length > 0) inkCollection.insert(newinks.map((nid) => inksMap[nid]));
            }
        },
        [params?.pid, params?.sid, search?.c, search?.r]
    );

    useEffect(() => {
        const socket = getSocket();
        if (socket?.readyState !== 1) return;
        socket?.send(
            JSON.stringify({
                ...(params ?? {}),
                ...(search ?? {})
            })
        );
        const currentCallBack = shapeInjector;
        addListener(currentCallBack);
        return () => {
            removeListener(currentCallBack);
        };
    }, [params?.pid, params?.sid, search?.c, search?.r]);

    if (!parsedParams.success || !parsedSearch.success) return <div>Missing parameters</div>;

    if (search?.c === undefined || search?.r === undefined)
        return <div>Missing coordinate parameters</div>;
    const NODE_OFFSET_LEFT = search.c * DO_NODE_WIDTH;
    const NODE_OFFSET_TOP = search.r * DO_NODE_HEIGH;

    // const relocatedShapes = shapes.map((s) => ({
    //     ...s,
    //     x: s.x - NODE_OFFSET_LEFT,
    //     y: s.y - NODE_OFFSET_TOP
    // }));

    // console.log(
    //     'shapes',
    //     shapes?.[0]?.x,
    //     relocatedShapes?.[0]?.x,
    //     shapes?.[0]?.y,
    //     relocatedShapes?.[0]?.y
    // );

    const displayWidth = window.document.getElementsByTagName('html')[0].clientWidth;
    const displayHeigth = window.document.getElementsByTagName('html')[0].clientHeight;
    const ratioedScaleX = displayWidth / 1920;
    const ratioedScaleY = displayHeigth / 1080;

    return (
        <Stage
            width={displayWidth}
            height={displayHeigth}
            scale={{ x: 10 * ratioedScaleX, y: 10 * ratioedScaleY }}
            offset={{ x: NODE_OFFSET_LEFT, y: NODE_OFFSET_TOP }}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'black',
                overflow: 'hidden'
            }}
        >
            <Layer>
                {/* <Rect x={0} y={0} width={1920} height={1080} stroke="#f00" strokeWidth={1} /> */}
                {shapes
                    .sort((a, b) => a.order - b.order)
                    .map((s) => (
                        <Rect key={s.id} {...s} />
                    ))}
                {inks.map((i) => (
                    <Line
                        key={`${renderCount}_${i.id}`}
                        points={i.points}
                        stroke="#df4b26"
                        strokeWidth={5}
                        tension={0.5}
                        lineCap="round"
                        lineJoin="round"
                    />
                ))}
            </Layer>
        </Stage>
    );
}
