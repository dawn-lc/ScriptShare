import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getOverviewStats, getScripts, OverviewStats, ScriptListItem } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getLocalizedText } from '../utils/localize';
import { FileText, Upload, Download, RefreshCw, Trophy, User, ChevronRight, BarChart3 } from 'lucide-react';
import ScriptIcon from '../components/ScriptIcon';
import StarRating from '../components/StarRating';

export default function Home() {
    const { t, i18n } = useTranslation();
    const { isAuthenticated, user } = useAuth();
    const isAdmin = isAuthenticated && user?.role === 'admin';
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [recentScripts, setRecentScripts] = useState<ScriptListItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const [statsData, scriptsData] = await Promise.all([
                    getOverviewStats(),
                    getScripts({ limit: 6, sort: 'createdAt', order: 'desc' }),
                ]);
                setStats(statsData);
                setRecentScripts(scriptsData.scripts);
            } catch (err) {
                console.error(t('common.error'), err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="space-y-12">
                {/* Hero section always shows immediately */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-blue-800 px-8 py-16 text-center text-white">
                    <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
                    <div className="relative">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                            <FileText className="w-10 h-10 inline-block mr-3 -mt-1" />
                            ScriptShare
                        </h1>
                        <p className="text-lg md:text-xl text-primary-100 max-w-2xl mx-auto">
                            {t('home.hero.desc')}
                        </p>
                        <div className="flex items-center justify-center gap-4 mt-10">
                            <Link to="/scripts" className="inline-flex items-center rounded-lg bg-white/15 px-6 py-3 text-base font-semibold text-white hover:bg-white/25 backdrop-blur-sm transition-colors">
                                <BarChart3 className="w-5 h-5 mr-2" />{t('home.hero.browse')}
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Skeleton for recent scripts */}
                <div>
                    <div className="h-7 bg-gray-200 rounded w-24 mb-4" />
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="card animate-pulse">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex-shrink-0" />
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="h-5 bg-gray-200 rounded w-3/4" />
                                        <div className="h-4 bg-gray-100 rounded w-full" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 mt-3">
                                    <div className="h-4 bg-gray-100 rounded w-16" />
                                    <div className="h-4 bg-gray-100 rounded w-20" />
                                    <div className="h-4 bg-gray-100 rounded w-12" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            {/* Hero section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-blue-800 px-8 py-16 text-center text-white">
                {/* Decorative background elements */}
                <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

                <div className="relative">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                        <FileText className="w-10 h-10 inline-block mr-3 -mt-1" />
                        ScriptShare
                    </h1>
                    <p className="text-lg md:text-xl text-primary-100 max-w-2xl mx-auto">
                        {t('home.hero.desc')}
                    </p>

                    {/* Quick stats for everyone */}
                    <div className="flex items-center justify-center gap-4 mt-10">
                        {isAuthenticated && (
                            <Link to="/upload" className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-primary-700 shadow-lg hover:bg-primary-50 transition-colors">
                                <Upload className="w-5 h-5 mr-2" />{t('home.hero.upload')}
                            </Link>
                        )}
                        <Link to="/scripts" className="inline-flex items-center rounded-lg bg-white/15 px-6 py-3 text-base font-semibold text-white hover:bg-white/25 backdrop-blur-sm transition-colors">
                            <BarChart3 className="w-5 h-5 mr-2" />{t('home.hero.browse')}
                        </Link>
                    </div>
                </div>
            </div>

            {/* Detailed admin stats */}
            {isAdmin && stats && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Stats cards - dark mode handled by .card component */}
                        <div className="card text-center">
                            <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">{stats.totalScripts}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('home.stats.totalScripts')}</div>
                        </div>
                        <div className="card text-center">
                            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.totalInstalls}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('home.stats.totalInstalls')}</div>
                        </div>
                        <div className="card text-center">
                            <div className="text-3xl font-bold text-blue-600">{stats.totalUpdateChecks}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('home.stats.totalChecks')}</div>
                        </div>
                        <div className="card text-center">
                            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.totalUpdateLogs}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('home.stats.totalUpdates')}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="card bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-primary-700 dark:text-primary-300 font-medium">{t('home.stats.todayInstalls')}</div>
                                    <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 mt-1">{stats.todayInstalls}</div>
                                </div>
                                <Download className="w-8 h-8 text-primary-400" />
                            </div>
                        </div>
                        <div className="card bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 dark:border-amber-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-amber-700 dark:text-amber-300 font-medium">{t('home.stats.todayChecks')}</div>
                                    <div className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.todayUpdates}</div>
                                </div>
                                <RefreshCw className="w-8 h-8 text-amber-400" />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Recent scripts */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('home.recent.title')}</h2>
                    <Link to="/scripts" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium">
                        {t('home.recent.viewAll')} <ChevronRight className="w-4 h-4 inline-block" />
                    </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {recentScripts.map((script) => (
                        <Link
                            key={script.id}
                            to={`/scripts/${script.id}`}
                            className="card hover:shadow-md transition-shadow group"
                        >
                            <div className="flex items-start gap-3">
                                <ScriptIcon icon={script.icon} />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:text-primary-400 transition-colors">
                                        {getLocalizedText(script.i18n, 'name', i18n.language, script.name)}
                                    </h3>
                                    {script.description && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                            {getLocalizedText(script.i18n, 'description', i18n.language, script.description)}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                                <span className="font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full text-xs font-semibold">v{script.version}</span>
                                {script.author && <span><User className="w-3 h-3 inline-block mr-0.5" />{script.author}</span>}
                                <span><Download className="w-3 h-3 inline-block mr-0.5" />{script.installs}</span>
                                {script.rating !== undefined && script.rating > 0 && (
                                    <span className="inline-flex items-center gap-1" title={`${script.rating?.toFixed(1)} (${script.ratingCount})`}>
                                        <StarRating value={script.rating} size={12} />
                                        <span className="text-gray-400 text-xs">{script.rating?.toFixed(1)}</span>
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
                {recentScripts.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        <p className="text-lg">{t('home.recent.empty')}</p>
                        <p className="text-sm mt-1">{t('home.recent.emptyHint')}</p>
                    </div>
                )}
            </div>

            {/* Top scripts - now visible to everyone */}
            {stats && stats.topInstalled.length > 0 && (
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="card">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3"><Trophy className="w-5 h-5 inline-block mr-1 text-amber-500" />{t('home.top.installed')}</h3>
                        <div className="space-y-2">
                            {stats.topInstalled.map((s, i) => (
                                <Link
                                    key={s.id}
                                    to={`/scripts/${s.id}`}
                                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span
                                            className={`text-sm font-bold w-6 ${i < 3 ? 'text-amber-500' : 'text-gray-400'}`}
                                        >
                                            #{i + 1}
                                        </span>
                                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                                    </div>
                                    <span className="text-sm font-medium text-primary-600 dark:text-primary-400">{s.installs} {t('home.top.installs')}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div className="card">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3"><RefreshCw className="w-5 h-5 inline-block mr-1 text-blue-500" />{t('home.top.checked')}</h3>
                        <div className="space-y-2">
                            {stats.topChecked.map((s, i) => (
                                <Link
                                    key={s.id}
                                    to={`/scripts/${s.id}`}
                                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span
                                            className={`text-sm font-bold w-6 ${i < 3 ? 'text-amber-500' : 'text-gray-400'}`}
                                        >
                                            #{i + 1}
                                        </span>
                                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                                    </div>
                                    <span className="text-sm font-medium text-blue-600">{s.updateChecks} {t('home.top.checks')}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

