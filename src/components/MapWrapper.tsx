'use client';

import { useRef, type FC, type HTMLAttributes, type RefAttributes } from 'react';
import Map, { type MapRef } from 'react-map-gl/maplibre';

import { setRefs } from '@/lib/setRefs';
import type { Layer } from '@/lib/types';

export const MapWrapper: FC<
    { layer: Extract<Layer, { type: 'map' }> } & RefAttributes<HTMLDivElement> &
        Partial<HTMLAttributes<HTMLDivElement>>
> = ({ ref, layer, ...props }) => {
    const mapRef = useRef<MapRef>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // useEffect(() => {
    //     if (!containerRef.current) return;

    //     const observer = new MutationObserver((mutations) => {
    //         mutations.forEach(
    //             throttle(
    //                 (mutation) => {
    //                     if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
    //                         const { style } = mutation.target as HTMLDivElement;
    //                         const { current } = mapRef;
    //                         if (!current) return;
    //                         // current.getContainer().style.transform = style.transform;
    //                         const canvas = current.getCanvas();
    //                         const scale = parseFloat(
    //                             style.transform?.match(/scale\((-?\d*\.?\d+)\)/)?.[1] ?? '0'
    //                         );
    //                         canvas.width = parseInt(style.width?.toString() ?? '0') * scale;
    //                         canvas.height = parseInt(style.height?.toString() ?? '0') * scale;
    //                         // current.resize();
    //                         // current.redraw();
    //                     }
    //                 },
    //                 { wait: 200 }
    //             )
    //         );
    //     });

    //     observer.observe(containerRef.current, { attributes: true });
    //     return () => {
    //         observer.disconnect();
    //     };
    //     // const handleResize = () => {
    //     //     const { current } = mapRef;
    //     //     if (!current) return;
    //     //     current.resize();
    //     // };
    //     // current.addEventListener('resize', handleResize);
    //     // return () => {
    //     //     current.removeEventListener('resize', handleResize);
    //     // };
    // }, []);

    // useEffect(() => {
    //     const { current } = mapRef;
    //     if (!current) return;
    //     const canvas = current.getCanvas();
    //     if (props.style) {
    //         canvas.width =
    //             parseInt(props.style.width?.toString() ?? '0') *
    //             parseInt(props.style.scale?.toString() ?? '0');
    //         canvas.height =
    //             parseInt(props.style.height?.toString() ?? '0') *
    //             parseInt(props.style.scale?.toString() ?? '0');
    //         current.redraw();
    //     }
    // }, [props.style?.width, props.style?.height, props.style?.scale]);

    return (
        <div
            ref={(node) => {
                containerRef.current = node;
                setRefs(node, ref);
            }}
            {...props}
        >
            <Map
                ref={mapRef}
                id={`map_in_${layer.numericId}`}
                initialViewState={layer.view}
                interactive={false}
                workerCount={5}
                reuseMaps={true}
                attributionControl={false}
                trackResize={true}
                mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            />
        </div>
    );
};

export default MapWrapper;
