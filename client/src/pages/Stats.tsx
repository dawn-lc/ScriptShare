import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { getOverviewStats, getTrends, getMyStats, OverviewStats, TrendsData, MyStatsResponse } from '../api';
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
    Legend,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { BarChart3, TrendingUp, RefreshCw, Globe, Monitor, FileText, Download } from 'lucide-react';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Stats() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [trends, setTrends] = useState<TrendsData | null>(null);
    const [period, setPeriod] = useState(30);
    const [myStats, setMyStats] = useState<MyStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                if (isAdmin) {
                    const [s, t] = await Promise.all([getOverviewStats(), getTrends(period)]);
                    setStats(s);
                    setTrends(t);
                } else {
                    const m = await getMyStats();
                    setMyStats(m);
                }
            } catch (err) {
                console.error(t('common.error'), err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [isAdmin, period]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    // ── Admin: full platform stats ──
    if (isAdmin) {
        return (
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><BarChart3 className="w-6 h-6 inline-block mr-2" />{t('stats.adminTitle')}</h1>
                    <div className="flex gap-2">
                        {[7, 30, 90].map((d) => (
                            <button key={d}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${period === d ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                                onClick={() => setPeriod(d)}>{d} {t('stats.days')}</button>
                        ))}
                    </div>
                </div>

                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="card text-center"><div className="text-3xl font-bold text-primary-600 dark:text-primary-400">{stats.totalScripts}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.totalScripts')}</div></div>
                        <div className="card text-center"><div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.totalInstalls}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.totalInstalls')}</div></div>
                        <div className="card text-center"><div className="text-3xl font-bold text-blue-600">{stats.totalUpdateChecks}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.updateChecks')}</div></div>
                        <div className="card text-center"><div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.totalUpdateLogs}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.updateRecords')}</div></div>
                    </div>
                )}

                {trends && (
                    <>
                        <div className="card">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><TrendingUp className="w-5 h-5 inline-block mr-1" />{t('stats.installTrend')}</h3>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trends.installTrend.length > 0 ? trends.installTrend : [{ date: t('stats.noData'), count: 0 }]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} name={t('stats.installs')} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="card">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><RefreshCw className="w-5 h-5 inline-block mr-1" />{t('stats.updateTrend')}</h3>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trends.updateTrend.length > 0 ? trends.updateTrend : [{ date: t('stats.noData'), count: 0 }]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name={t('stats.updateChecks')} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="card">
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Globe className="w-5 h-5 inline-block mr-1" />{t('stats.browserDist')}</h3>
                                <div className="h-64">
                                    {trends.browserDistribution.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={trends.browserDistribution} dataKey="count" nameKey="browser" cx="50%" cy="50%" outerRadius={80}
                                                    label={({ browser, percent }: any) => `${browser} ${(percent * 100).toFixed(0)}%`}>
                                                    {trends.browserDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-400">{t('stats.noData')}</div>
                                    )}
                                </div>
                            </div>
                            <div className="card">
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Monitor className="w-5 h-5 inline-block mr-1" />{t('stats.osDist')}</h3>
                                <div className="h-64">
                                    {trends.osDistribution.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={trends.osDistribution} dataKey="count" nameKey="os" cx="50%" cy="50%" outerRadius={80}
                                                    label={({ os, percent }: any) => `${os} ${(percent * 100).toFixed(0)}%`}>
                                                    {trends.osDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-400">{t('stats.noData')}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // ── Regular user: own stats ──
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><BarChart3 className="w-6 h-6 inline-block mr-2" />{t('stats.myTitle')}</h1>

            {!myStats ? (
                <p className="text-sm text-gray-400 py-4 text-center">{t('stats.noData')}</p>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="card text-center"><div className="text-3xl font-bold text-primary-600 dark:text-primary-400">{myStats.totalScripts}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.myScripts')}</div></div>
                        <div className="card text-center"><div className="text-3xl font-bold text-green-600 dark:text-green-400">{myStats.totalInstalls}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.totalInstalls')}</div></div>
                        <div className="card text-center"><div className="text-3xl font-bold text-blue-600">{myStats.totalUpdateChecks}</div><div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('stats.updateChecks')}</div></div>
                    </div>

                    {myStats.dailyInstalls.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><TrendingUp className="w-5 h-5 inline-block mr-1" />{t('stats.installTrend')}</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={myStats.dailyInstalls}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} name={t('stats.installs')} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><FileText className="w-5 h-5 inline-block mr-1" />{t('stats.myScripts')}</h3>
                        <div className="space-y-2">
                            {myStats.scripts.map((s) => (
                                <Link key={s.id} to={`/scripts/${s.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                                        <span className="text-xs font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full font-semibold">v{s.version}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-400">
                                        <span><Download className="w-3 h-3 inline-block mr-0.5" />{s.installs}</span>
                                        <span><RefreshCw className="w-3 h-3 inline-block mr-0.5" />{s.updateChecks}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

