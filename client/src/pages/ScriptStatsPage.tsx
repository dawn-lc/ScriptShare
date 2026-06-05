import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getScriptStats, ScriptStats } from '../api';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { Frown, BarChart3, TrendingUp, RefreshCw, Globe, Monitor, ChevronLeft } from 'lucide-react';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function ScriptStatsPage() {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const [stats, setStats] = useState<ScriptStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id) return;
        const scriptId = parseInt(id);
        if (isNaN(scriptId)) return;
        async function load() {
            try {
                const data = await getScriptStats(scriptId);
                setStats(data);
            } catch (err: any) {
                setError(err.message || t('common.error'));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="text-center py-20">
                <p className="text-5xl mb-4"><Frown className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{error || t('scriptStats.noData')}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-block">
                    <ChevronLeft className="w-4 h-4 inline-block" /> {t('scriptStats.backToDetail')}
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="text-sm text-gray-500 dark:text-gray-400">
                <Link to="/scripts" className="hover:text-primary-600 dark:hover:text-primary-400 dark:text-primary-400">
                    {t('scriptDetail.breadcrumb')}
                </Link>
                <span className="mx-2">/</span>
                <Link to={`/scripts/${id}`} className="hover:text-primary-600 dark:hover:text-primary-400 dark:text-primary-400">
                    {stats.script.name}
                </Link>
                <span className="mx-2">/</span>
                <span className="text-gray-900 dark:text-gray-100">{t('scriptDetail.stats')}</span>
            </nav>

            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><BarChart3 className="w-6 h-6 inline-block mr-2" />{t('scriptStats.title', { name: stats.script.name })}</h1>
                <Link to={`/scripts/${id}`} className="btn-secondary">
                    <ChevronLeft className="w-4 h-4 inline-block" /> {t('scriptStats.backToDetail')}
                </Link>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.totalInstalls}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('scriptStats.totalInstalls')}</div>
                </div>
                <div className="card text-center">
                    <div className="text-3xl font-bold text-blue-600">{stats.totalUpdateChecks}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('scriptStats.totalChecks')}</div>
                </div>
                <div className="card text-center">
                    <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">{stats.script.version}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('scriptStats.currentVersion')}</div>
                </div>
                <div className="card text-center">
                    <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                        {stats.dailyInstalls.reduce((sum, d) => sum + d.count, 0)}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('scriptStats.last30d')}</div>
                </div>
            </div>

            {/* Daily installs chart */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><TrendingUp className="w-5 h-5 inline-block mr-1" />{t('scriptStats.dailyInstalls')}</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={
                                stats.dailyInstalls.length > 0
                                    ? stats.dailyInstalls
                                    : [{ date: t('scriptStats.noData'), count: 0 }]
                            }
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} name={t('scriptStats.installs')} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Daily update checks chart */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><RefreshCw className="w-5 h-5 inline-block mr-1" />{t('scriptStats.dailyUpdates')}</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={
                                stats.dailyUpdates.length > 0 ? stats.dailyUpdates : [{ date: t('scriptStats.noData'), count: 0 }]
                            }
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name={t('scriptStats.updateChecks')} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Browser & OS distribution */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Globe className="w-5 h-5 inline-block mr-1" />{t('scriptStats.browserDist')}</h3>
                    <div className="h-64">
                        {stats.browserStats.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.browserStats}
                                        dataKey="count"
                                        nameKey="browser"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        label={({ browser, percent }: any) =>
                                            `${browser} ${(percent * 100).toFixed(0)}%`
                                        }
                                    >
                                        {stats.browserStats.map((_, index) => (
                                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">{t('scriptStats.noData')}</div>
                        )}
                    </div>
                </div>
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Monitor className="w-5 h-5 inline-block mr-1" />{t('scriptStats.osDist')}</h3>
                    <div className="h-64">
                        {stats.osStats.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.osStats}
                                        dataKey="count"
                                        nameKey="os"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        label={({ os, percent }: any) => `${os} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {stats.osStats.map((_, index) => (
                                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">{t('scriptStats.noData')}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

