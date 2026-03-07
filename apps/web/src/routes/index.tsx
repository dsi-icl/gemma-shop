import { Button } from '@repo/ui/components/button';
import type { Project } from '@repo/ui/components/project-card';
import { ProjectCard } from '@repo/ui/components/project-card';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/')({
    component: HomePage
});

const projectsData: Project[] = [
    {
        name: 'Quantum Entanglement Visualizer',
        author: 'Dept. of Physics & QuantumLeap Inc.',
        description:
            'An interactive 3D visualization of quantum entanglement principles, designed for large-scale video walls.',
        tags: ['quantum', 'data-viz', 'simulation'],
        imageUrl:
            'https://plus.unsplash.com/premium_photo-1700942979302-72ef87e43525?q=80&w=1579&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
    },
    {
        name: 'Neural Network Mapping of the Brain',
        author: 'Dept. of Bioengineering',
        description:
            'Mapping neural pathways and activity in real-time using fMRI data, rendered for high-resolution displays.',
        tags: ['neuroscience', 'ai', 'medical'],
        imageUrl:
            'https://images.unsplash.com/photo-1649937801620-d31db7fb3ab3?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
    },
    {
        name: 'Fusion Reactor Plasma Flow Simulation',
        author: 'Dept. of Nuclear Engineering & General Atomics',
        description:
            'A high-fidelity simulation of plasma dynamics within a tokamak fusion reactor.',
        tags: ['simulation', 'energy', 'physics'],
        imageUrl:
            'https://plus.unsplash.com/premium_photo-1740997621891-99cf4ee1d44c?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
    },
    {
        name: 'Climate Change Impact on Coral Reefs',
        author: 'Dept. of Environmental Science',
        description:
            'Visualizing the projected impact of rising sea temperatures on coral reef ecosystems over the next century.',
        tags: ['climate', 'data-viz', 'biology'],
        imageUrl:
            'https://images.unsplash.com/photo-1584701782257-a77b042b1878?q=80&w=1335&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
    },
    {
        name: 'Protein Folding Dynamics',
        author: 'Dept. of Chemistry & Roche',
        description:
            'An interactive simulation showing the complex process of protein folding for drug discovery research.',
        tags: ['biology', 'simulation', 'medical'],
        imageUrl:
            'https://images.unsplash.com/photo-1717501805972-6f44905bc53c?q=80&w=1760&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
    },
    {
        name: 'Gravitational Wave Detection Analysis',
        author: 'LIGO Scientific Collaboration',
        description:
            'Analyzing and visualizing data from the LIGO detectors to identify gravitational waves from cosmic events.',
        tags: ['astronomy', 'physics', 'data-viz'],
        imageUrl:
            'https://plus.unsplash.com/premium_photo-1679082307205-6369510af1c2?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
    }
];

function HomePage() {
    const [activeTag, setActiveTag] = useState<string | null>(null);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        projectsData.forEach((p) => p.tags.forEach((t) => tags.add(t)));
        return Array.from(tags);
    }, []);

    const filteredProjects = useMemo(() => {
        if (!activeTag) return projectsData;
        return projectsData.filter((p) => p.tags.includes(activeTag));
    }, [activeTag]);

    return (
        <div className="container mx-auto p-4 pt-24">
            <div className="flex flex-col gap-8 md:flex-row">
                <aside className="w-full md:w-1/5">
                    <h2 className="mb-4 text-lg font-semibold">Filters</h2>
                    <div className="flex flex-wrap gap-2 md:flex-col md:flex-nowrap">
                        <Button
                            variant={!activeTag ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTag(null)}
                            className="justify-start"
                        >
                            All
                        </Button>
                        {allTags.map((tag) => (
                            <Button
                                key={tag}
                                variant={activeTag === tag ? 'secondary' : 'ghost'}
                                onClick={() => setActiveTag(tag)}
                                className="justify-start"
                            >
                                {tag}
                            </Button>
                        ))}
                    </div>
                </aside>
                <main className="w-full md:w-4/5">
                    <div className="gap-4 space-y-4 sm:columns-2 lg:columns-3 xl:columns-4">
                        <LayoutGroup>
                            <AnimatePresence>
                                {filteredProjects.map((project) => (
                                    <motion.div
                                        layout="position"
                                        key={project.name}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{
                                            type: 'spring',
                                            duration: 0.3,
                                            bounce: 0.2
                                        }}
                                        className="break-inside-avoid"
                                    >
                                        <ProjectCard project={project} />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </LayoutGroup>
                    </div>
                </main>
            </div>
        </div>
    );
}
