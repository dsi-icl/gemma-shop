import { throttle } from '@tanstack/react-pacer';

import { appEnvCollection, EnvSchema, type EnvType } from '@/db/appEnvCollection';
import { shapesCollection, type ShapeType } from '@/db/shapesCollection';

import { UnionToRecord } from './typeUtils';

type FlatEnv = UnionToRecord<EnvType>;

export const envVar = <P extends keyof FlatEnv>(key: P): FlatEnv[P] => {
    return appEnvCollection.get(key)?.value as FlatEnv[P];
};

export const updateEnvVar = <P extends keyof FlatEnv>(key: P, value: FlatEnv[P]) => {
    const existing = envVar(key);
    if (existing)
        appEnvCollection.update(key, (e) => {
            (e as any)[key] = value;
        });
    else appEnvCollection.insert([{ key, value } as any]);
};

export const addShape = (shape: Omit<ShapeType, 'id' | 'order'>) => {
    shapesCollection.insert({
        id: `s-${Date.now()}`,
        ...shape,
        order: shapesCollection.size ?? 0,
        x: Math.round(shape.x),
        y: Math.round(shape.y),
        height: Math.round(shape.height),
        width: Math.round(shape.width),
        rotation: Math.round(shape.rotation)
    });
};

export const updateShape = throttle(
    (shape: ShapeType) => {
        shapesCollection.update(shape.id, (attrs) => {
            Object.entries(shape).forEach(([key, value]) => {
                (attrs as any)[key] = value;
            });
        });
    },
    {
        wait: 100
    }
);

export const addRectangleShape = (rect: Pick<ShapeType, 'x' | 'y' | 'width' | 'height'>) => {
    const newShape = {
        type: 'rect' as const,
        name: `Shape ${shapesCollection.size + 1}`,
        x: rect.x,
        y: rect.y,
        rotation: 0,
        height: rect.height,
        width: rect.width,
        fill: getRandomColor(),
        visible: true,
        selected: false
    };
    addShape(newShape);
};

export const addCircleShape = (circle: Pick<ShapeType, 'x' | 'y' | 'width' | 'height'>) => {
    const newShape = {
        type: 'circle' as const,
        name: `Shape ${shapesCollection.size + 1}`,
        x: circle.x,
        y: circle.y,
        rotation: 0,
        height: circle.height,
        width: circle.width,
        fill: getRandomColor(),
        visible: true,
        selected: false
    };
    addShape(newShape);
};

export const addTextShape = (text: string, position: { x: number; y: number }) => {};

const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

// export const addTextShape = (text: string) => {
//     shapesCollection.insert({
//         id: crypto.randomUUID(),
//         type: 'text',
//         text: 'Coucou',
//     });
// };
