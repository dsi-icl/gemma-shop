import { XIcon } from '@phosphor-icons/react';
import { OrbitControls, useTexture } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { TipButton } from '@repo/ui/components/tip-button';
import { Suspense } from 'react';
import * as THREE from 'three';

const CylindricalScreen = ({
    imageUrl,
    radius = 10,
    height = 6
}: {
    imageUrl: string;
    radius?: number;
    height?: number;
}) => {
    // Load the image texture
    const texture = useTexture(imageUrl);
    texture.repeat.x = -1; // Reverses the image
    texture.offset.x = 1; // Shifts it back into the visible 0-1 UV space

    // Math for a 313-degree wall
    const viewAngle = 313;
    const gapAngle = 360 - viewAngle;

    // Center the "gap" directly behind the starting camera position
    const thetaStart = THREE.MathUtils.degToRad(gapAngle / 2);
    const thetaLength = THREE.MathUtils.degToRad(viewAngle);

    const geometryArgs = [radius, radius, height, 64, 1, true, thetaStart, thetaLength] as const;

    return (
        <group>
            {/* INSIDE: The Screen (Image) */}
            <mesh>
                <cylinderGeometry args={geometryArgs} />
                <meshBasicMaterial
                    map={texture}
                    side={THREE.BackSide} // Only renders when looking from the inside
                />
            </mesh>

            {/* OUTSIDE: The Physical Wall (Color) */}
            <mesh>
                <cylinderGeometry args={geometryArgs} />
                <meshBasicMaterial
                    color="#222222" // A dark grey/black for the back of the screens
                    side={THREE.FrontSide} // Only renders when looking from the outside
                />
            </mesh>
        </group>
    );
};

export default function DOPreview({ imageUrl }: { imageUrl: string }) {
    // Calculate pan limits so the camera doesn't spin past the screen edges
    const panLimit = THREE.MathUtils.degToRad(313 / 2);

    return (
        <div className="fixed z-100 h-screen w-screen pb-30" style={{ backgroundColor: '#222' }}>
            <Canvas camera={{ position: [0, 2, 20], fov: 50 }}>
                <Suspense fallback={null}>
                    <CylindricalScreen
                        imageUrl={imageUrl}
                        radius={10}
                        height={6} // Adjust based on your physical screen's aspect ratio
                    />
                </Suspense>

                <OrbitControls
                    enableDamping={true} // Enables the smooth, gliding movement
                    dampingFactor={0.05}
                    // Left and right panning limits
                    minAzimuthAngle={-panLimit}
                    maxAzimuthAngle={panLimit}
                    // Up and down panning limits
                    // Tightened slightly so the user doesn't stare at the empty ceiling/floor
                    minPolarAngle={Math.PI / 3.2}
                    maxPolarAngle={Math.PI / 1.8}
                    // Zoom limits: "enter and leave" the space
                    minDistance={6} // Closest you can get to the center
                    maxDistance={40} // Furthest you can pull back (exits through the gap)
                    target={[0, 0, 0]}
                />
            </Canvas>
            <TipButton tip="Close" variant="outline" className="absolute top-5 right-5 z-2000">
                <XIcon />
            </TipButton>
        </div>
    );
}
