import { NavLink, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const { pathname } = useLocation();
  const clustersActive =
    pathname === '/' || pathname.startsWith('/clusters') || pathname.startsWith('/nodes');

  return (
    <aside className="flex min-h-screen w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="px-5 py-6 text-lg font-semibold tracking-tight text-white">Platform.AI</div>
      <nav className="space-y-1 px-3">
        <NavLink
          to="/"
          className={[
            'block rounded-md px-3 py-2 text-sm font-medium',
            clustersActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
          ].join(' ')}
        >
          Clusters
        </NavLink>
      </nav>
    </aside>
  );
}
