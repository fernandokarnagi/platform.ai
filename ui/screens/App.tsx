import { Outlet } from 'react-router-dom';
import Sidebar from '@components/Sidebar';
import { ClusterProvider } from '@contexts/ClusterContext';

export default function App() {
  return (
    <ClusterProvider>
      <div>
        <Sidebar />
        <main>
          <Outlet />
        </main>
      </div>
    </ClusterProvider>
  );
}
