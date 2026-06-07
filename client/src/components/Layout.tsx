import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { DocumentTextIcon, HomeIcon, ArrowUpTrayIcon, ChartBarIcon, Cog6ToothIcon, UserIcon, ArrowRightEndOnRectangleIcon, ArrowRightStartOnRectangleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

export default function Layout() {
    const { t } = useTranslation();
    const { isAuthenticated, user, loading, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    async function handleLogout() {
        await logout();
        navigate('/');
    }

    return (
        <div className="flex flex-col min-h-screen">
            {/* Header */}
            <header className="bg-white dark:bg-gray-900 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 dark:border-gray-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link to="/" className="flex items-center space-x-2">
                            <DocumentTextIcon className="w-6 h-6 text-primary-600 dark:text-primary-400 dark:text-primary-400" />
                            <span className="text-xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">ScriptShare</span>
                        </Link>

                        {/* Desktop nav */}
                        <nav className="hidden md:flex items-center space-x-1">
                            <Link
                                to="/"
                                className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <HomeIcon className="w-4 h-4 mr-1.5 inline-block" />{t('nav.home')}
                            </Link>
                            <Link
                                to="/scripts"
                                className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/scripts') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <DocumentTextIcon className="w-4 h-4 mr-1.5 inline-block" />{t('nav.scripts')}
                            </Link>
                            {isAuthenticated && (
                                <Link
                                    to="/upload"
                                    className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/upload') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <ArrowUpTrayIcon className="w-4 h-4 mr-1.5 inline-block" />{t('nav.upload')}
                                </Link>
                            )}
                            {user?.role === 'admin' && (
                                <Link
                                    to="/stats"
                                    className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/stats') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <ChartBarIcon className="w-4 h-4 mr-1.5 inline-block" />{t('nav.stats')}
                                </Link>
                            )}
                            {user?.role === 'admin' && (
                                <Link
                                    to="/admin"
                                    className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/admin') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <Cog6ToothIcon className="w-4 h-4 mr-1.5 inline-block" />{t('nav.admin')}
                                </Link>
                            )}
                        </nav>

                        {/* Auth buttons + Mobile menu */}
                        <div className="flex items-center gap-2">
                            {!loading && (
                                <>
                                    {isAuthenticated ? (
                                        <div className="hidden md:flex items-center gap-2">
                                            <Link to="/my-stats" className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 dark:text-primary-400 dark:hover:text-primary-400" title={t('nav.myStats')}>
                                                {user?.displayName || user?.username}
                                            </Link>
                                            <Link to="/settings" className="text-sm text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 dark:text-primary-400 dark:hover:text-primary-400" title={t('nav.settings')}>
                                                <Cog6ToothIcon className="w-4 h-4" />
                                            </Link>
                                            {user?.role === 'admin' && <span className="text-xs bg-amber-100 dark:bg-amber-900/50 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">{t('nav.adminLabel')}</span>}
                                            <button onClick={handleLogout} className="btn-secondary">
                                                {t('nav.logout')}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="hidden md:flex items-center gap-2">
                                            <Link to="/login" className="btn-secondary">
                                                {t('nav.login')}
                                            </Link>
                                            <Link to="/register" className="btn-primary">
                                                {t('nav.register')}
                                            </Link>
                                        </div>
                                    )}
                                </>
                            )}
                            <button
                                className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {mobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile nav */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t border-gray-200 dark:border-gray-700 dark:border-gray-800">
                        <div className="px-2 py-3 space-y-1">
                            <Link
                                to="/"
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium ${isActive('/') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <HomeIcon className="w-4 h-4 mr-1" /> {t('nav.home')}
                            </Link>
                            <Link
                                to="/scripts"
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium ${isActive('/scripts') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <DocumentTextIcon className="w-4 h-4 mr-1" /> {t('nav.scripts')}
                            </Link>
                            {isAuthenticated && (
                                <Link
                                    to="/upload"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium ${isActive('/upload') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <ArrowUpTrayIcon className="w-4 h-4 mr-1" /> {t('nav.upload')}
                                </Link>
                            )}
                            {user?.role === 'admin' && (
                                <Link
                                    to="/stats"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium ${isActive('/stats') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <ChartBarIcon className="w-4 h-4 mr-1" /> {t('nav.stats')}
                                </Link>
                            )}
                            {user?.role === 'admin' && (
                                <Link
                                    to="/admin"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium ${isActive('/admin') ? 'bg-primary-50 dark:bg-primary-900/30 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <Cog6ToothIcon className="w-4 h-4 mr-1" /> {t('nav.admin')}
                                </Link>
                            )}
                            <hr className="my-2 border-gray-200 dark:border-gray-700 dark:border-gray-700" />
                            {isAuthenticated ? (
                                <>
                                    <Link
                                        to="/my-stats"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800"
                                    >
                                        <ChartBarIcon className="w-4 h-4 mr-1" /> {t('nav.myStats')}
                                    </Link>
                                    <Link
                                        to="/settings"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800"
                                    >
                                        <Cog6ToothIcon className="w-4 h-4 mr-1" /> {t('nav.settings')}
                                    </Link>
                                    <div className="flex items-center px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                        <UserIcon className="w-4 h-4 mr-1" /> {user?.displayName || user?.username}
                                        {user?.role === 'admin' && <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/50 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 dark:text-amber-300 px-1.5 py-0.5 rounded">{t('nav.adminLabel')}</span>}
                                    </div>
                                    <button
                                        onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                                        className="flex items-center w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800"
                                    >
                                        <ArrowRightEndOnRectangleIcon className="w-4 h-4 mr-1" /> {t('nav.logoutTitle')}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/login"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-primary-600 dark:text-primary-400 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800"
                                    >
                                        <ArrowRightStartOnRectangleIcon className="w-4 h-4 mr-1" /> {t('nav.login')}
                                    </Link>
                                    <Link
                                        to="/register"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-primary-600 dark:text-primary-400 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:bg-gray-800"
                                    >
                                        <PencilSquareIcon className="w-4 h-4 mr-1" /> {t('nav.register')}
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {/* Main content */}
            <main className="flex-1">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Outlet />
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white dark:bg-gray-900 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 dark:border-gray-800 py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                            <DocumentTextIcon className="w-4 h-4 mr-1" /> ScriptShare
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span>{t('app.footer')}</span>
                        </div>
                        <div className="text-sm text-gray-400 dark:text-gray-500">
                            {t('app.devBy')}
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

