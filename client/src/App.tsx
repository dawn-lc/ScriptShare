import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import { useSystemTheme } from './utils/useSystemTheme';
import Home from './pages/Home';
import ScriptList from './pages/ScriptList';
import ScriptDetail from './pages/ScriptDetail';
import Upload from './pages/Upload';
import EditScript from './pages/EditScript';
import ScriptSettings from './pages/ScriptSettings';
import Stats from './pages/Stats';
import ScriptStatsPage from './pages/ScriptStatsPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Admin from './pages/Admin';
import MyStats from './pages/MyStats';
import Settings from './pages/Settings';

/** Wraps a route, redirecting to /login if not authenticated */
function RequireAuth({ children }: { children: React.ReactElement }) {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }

    return children;
}

/** Wraps a route, redirecting to /login if not admin */
function RequireAdmin({ children }: { children: React.ReactElement }) {
    const { isAuthenticated, user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }

    if (user?.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    return children;
}

function App() {
    useSystemTheme();
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="scripts" element={<ScriptList />} />
                <Route path="scripts/:id" element={<ScriptDetail />} />
                <Route
                    path="scripts/:id/edit"
                    element={
                        <RequireAuth>
                            <EditScript />
                        </RequireAuth>
                    }
                />
                <Route path="scripts/:id/stats" element={<RequireAuth><ScriptStatsPage /></RequireAuth>} />
                <Route path="scripts/:id/settings" element={<RequireAuth><ScriptSettings /></RequireAuth>} />
                <Route
                    path="upload"
                    element={
                        <RequireAuth>
                            <Upload />
                        </RequireAuth>
                    }
                />
                <Route path="stats" element={<RequireAuth><Stats /></RequireAuth>} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="my-stats" element={<RequireAuth><MyStats /></RequireAuth>} />
                <Route path="settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route
                    path="admin"
                    element={
                        <RequireAdmin>
                            <Admin />
                        </RequireAdmin>
                    }
                />
            </Route>
        </Routes>
    );
}

export default App;
