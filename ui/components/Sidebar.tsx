import { NavLink, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const { pathname } = useLocation();
  const clustersActive =
    pathname === '/' || pathname.startsWith('/clusters') || pathname.startsWith('/nodes');

  return (
    <header className="topbar">
      <nav className="topnav">
        <NavLink to="/" className="brand">
          Platform.AI
        </NavLink>
        <NavLink to="/" className={clustersActive ? 'navlink current' : 'navlink'}>
          Clusters
        </NavLink>
      </nav>
      <span className="spacer" />
      <span className="meta">llama.cpp · local</span>
    </header>
  );
}
