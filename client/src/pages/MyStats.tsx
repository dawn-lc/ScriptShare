import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { getMyStats, type MyStatsResponse } from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getLocalizedText } from '../utils/localize';
import { InboxIcon, ChartBarIcon, DocumentTextIcon, ArrowDownTrayIcon, ArrowPathIcon, ChartBarSquareIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export default function MyStats() {
    const { t, i18n } = useTranslation();
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: '/my-stats' }} replace />;
    }
    const [stats, setStats] = useState<MyStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMyStats()
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="text-center py-20 text-gray-400">
                <p className="text-5xl mb-4"><InboxIcon className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg">{t('myStats.empty')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><ChartBarIcon className="w-6 h-6" />{t('myStats.title')}</h1>

            <div className="grid grid-cols-3 gap-4">
                <div className="card text-center">
                    <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">{stats.totalScripts}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('myStats.myScripts')}</div>
                </div>
                <div className="card text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.totalInstalls}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('myStats.totalInstalls')}</div>
                </div>
                <div className="card text-center">
                    <div className="text-3xl font-bold text-blue-600">{stats.totalUpdateChecks}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('myStats.updateChecks')}</div>
                </div>
            </div>

            {stats.dailyInstalls.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-1.5"><ChartBarSquareIcon className="w-5 h-5" />{t('myStats.trend.title')}</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.dailyInstalls}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} name={t('myStats.trend.installs')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5"><DocumentTextIcon className="w-5 h-5" />{t('myStats.scripts.title')}</h3>
                {stats.scripts.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">{t('myStats.scripts.empty')}</p>
                ) : (
                    <div className="space-y-2">
                        {stats.scripts.map((s) => (
                            <Link
                                key={s.id}
                                to={`/scripts/${s.id}`}
                                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800 transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{getLocalizedText(s.i18n, 'name', i18n.language, s.name)}</span>
                                    <span className="text-xs font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full font-semibold">v{s.version}</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                    <span className="inline-flex items-center gap-1"><ArrowDownTrayIcon className="w-3 h-3" />{s.installs}</span>
                                    <span className="inline-flex items-center gap-1"><ArrowPathIcon className="w-3 h-3" />{s.updateChecks}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); navigate(`/scripts/${s.id}/stats`); }}
                                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium cursor-pointer"
                                    >
                                        {t('myStats.scripts.stats')} <ChevronRightIcon className="w-3 h-3" />
                                    </button>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

