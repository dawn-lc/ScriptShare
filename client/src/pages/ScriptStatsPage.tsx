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
import { FaceFrownIcon, ChartBarIcon, ChartBarSquareIcon, ArrowPathIcon, GlobeAltIcon, ComputerDesktopIcon, ChevronLeftIcon, ArrowsRightLeftIcon, ClipboardDocumentListIcon, ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

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
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg || t('common.error'));
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
                <p className="text-5xl mb-4"><FaceFrownIcon className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{error || t('scriptStats.noData')}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-flex items-center gap-1">
                    <ChevronLeftIcon className="w-4 h-4" /> {t('scriptStats.backToDetail')}
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="text-sm text-gray-500 dark:text-gray-400">
                <Link to="/scripts" className="hover:text-primary-600 dark:hover:text-primary-400">
                    {t('scriptDetail.breadcrumb')}
                </Link>
                <span className="mx-2">/</span>
                <Link to={`/scripts/${id}`} className="hover:text-primary-600 dark:hover:text-primary-400">
                    {stats.script.name}
                </Link>
                <span className="mx-2">/</span>
                <span className="text-gray-900 dark:text-gray-100">{t('scriptDetail.stats')}</span>
            </nav>

            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><ChartBarIcon className="w-6 h-6" />{t('scriptStats.title', { name: stats.script.name })}</h1>
                <Link to={`/scripts/${id}`} className="btn-secondary">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> {t('scriptStats.backToDetail')}
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
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-1.5"><ChartBarSquareIcon className="w-5 h-5" />{t('scriptStats.dailyInstalls')}</h3>
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
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-1.5"><ArrowPathIcon className="w-5 h-5" />{t('scriptStats.dailyUpdates')}</h3>
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
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-1.5"><GlobeAltIcon className="w-5 h-5" />{t('scriptStats.browserDist')}</h3>
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
                                        label={({ browser, percent }: { browser: string; percent: number }) =>
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
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-1.5"><ComputerDesktopIcon className="w-5 h-5" />{t('scriptStats.osDist')}</h3>
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
                                        label={({ os, percent }: { os: string; percent: number }) => `${os} ${(percent * 100).toFixed(0)}%`}
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

            {/* 审计日志 */}
            {stats.auditLogs && stats.auditLogs.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        <ClipboardDocumentListIcon className="w-5 h-5 mr-1" />{t('scriptStats.auditLogs')}
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {stats.auditLogs.map((log) => (
                            <div key={log.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                                <ClipboardDocumentListIcon className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                                        </span>
                                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                            {log.action}
                                        </span>
                                    </div>
                                    <p className="text-gray-600 dark:text-gray-300 mt-0.5">{log.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

