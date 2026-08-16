import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from '@screens/App';
import ClusterDetailScreen from '@screens/ClusterDetailScreen';
import ClustersScreen from '@screens/ClustersScreen';
import DownloadsScreen from '@screens/DownloadsScreen';
import NodeDetailScreen from '@screens/NodeDetailScreen';
import NodeFormScreen from '@screens/NodeFormScreen';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<ClustersScreen />} />
          <Route path="/clusters/:id" element={<ClusterDetailScreen />} />
          <Route path="/clusters/:id/nodes/new" element={<NodeFormScreen />} />
          <Route path="/nodes/:id" element={<NodeDetailScreen />} />
          <Route path="/nodes/:id/edit" element={<NodeFormScreen />} />
          <Route path="/downloads" element={<DownloadsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
