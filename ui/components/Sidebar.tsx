import { NavLink, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const { pathname } = useLocation();
  const clustersActive =
    pathname === '/' || pathname.startsWith('/clusters') || pathname.startsWith('/nodes');

  return (
    <header className="topbar">
      <nav className="topnav">
        <NavLink to="/" className="brand">
          <img src="/favicon.svg" alt="" width="18" height="18" />
          Platform.AI
        </NavLink>
        <NavLink to="/" className={clustersActive ? 'navlink current' : 'navlink'}>
          Clusters
        </NavLink>
        <NavLink to="/downloads" className={({ isActive }) => (isActive ? 'navlink current' : 'navlink')}>
          Downloads
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'navlink current' : 'navlink')}>
          Settings
        </NavLink>
      </nav>
      <span className="spacer" />
      <span className="meta">llama.cpp / vLLM · local</span>
    </header>
  );
}
