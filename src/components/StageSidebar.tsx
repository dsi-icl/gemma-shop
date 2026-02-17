import { LayersTable } from './LayersTable';
import { NewShapeMenu } from './NewShapeMenu';

export const StageSidebar = () => {
    return (
        <div className="flex h-full flex-col items-stretch">
            <div className="flex justify-between border-b p-4">
                <h2 className="text-lg font-semibold">Layers</h2>
                <NewShapeMenu />
            </div>
            <div className="flex h-full grow flex-col items-center justify-start">
                <LayersTable />
            </div>
        </div>
    );
};
