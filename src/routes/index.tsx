import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: App });

function App() {
    return (
        <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
            <Link to="/editor">Editor</Link>
            <Link to="/wall">Wall</Link>
        </div>
    );
}
