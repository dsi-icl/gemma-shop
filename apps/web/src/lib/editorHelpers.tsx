import { Line } from 'react-konva';

export const getDOGridLines = (width: number, height: number, strokeWidth = 1) => {
    const lines = [];
    for (let i = 1; i < 16; i++)
        lines.push(
            <Line
                key={`v-${i}`}
                points={[(i * width) / 16, 0, (i * width) / 16, height]}
                strokeWidth={strokeWidth}
                listening={false}
                stroke="black"
            />
        );
    for (let i = 1; i < 5; i++)
        lines.push(
            <Line
                key={`h-${i}`}
                points={[0, (i * height) / 4, width, (i * height) / 4]}
                strokeWidth={strokeWidth}
                listening={false}
                stroke="black"
            />
        );
    return lines;
};
