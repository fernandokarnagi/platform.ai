import { Outlet } from 'react-router-dom';
import Sidebar from '@components/Sidebar';
import { ClusterProvider } from '@contexts/ClusterContext';

export default function App() {
  return (
    <ClusterProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-h-screen flex-1 bg-slate-50">
          <Outlet />
        </main>
      </div>
    </ClusterProvider>
  );
}
