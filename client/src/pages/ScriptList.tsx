import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getScripts, ScriptListItem, Pagination } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getLocalizedText } from '../utils/localize';
import { FileText, Upload, Inbox, User, Download, RefreshCw, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import ScriptIcon from '../components/ScriptIcon';
import StarRating from '../components/StarRating';

const SORT_OPTIONS = [
    { value: 'updatedAt', label: 'scripts.sort.updated' },
    { value: 'createdAt', label: 'scripts.sort.created' },
    { value: 'installs', label: 'scripts.sort.installs' },
    { value: 'updateChecks', label: 'scripts.sort.checks' },
    { value: 'name', label: 'scripts.sort.name' },
];

export default function ScriptList() {
    const { t, i18n } = useTranslation();
    const { isAuthenticated } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [scripts, setScripts] = useState<ScriptListItem[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);

    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'updatedAt';
    const order = searchParams.get('order') || 'desc';

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const data = await getScripts({ page, limit: 12, search, sort, order });
                setScripts(data.scripts);
                setPagination(data.pagination);
            } catch (err) {
                console.error('Failed to load scripts:', err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [page, search, sort, order]);

    function updateParams(updates: Record<string, string>) {
        const newParams = new URLSearchParams(searchParams);
        Object.entries(updates).forEach(([key, value]) => {
            if (value) newParams.set(key, value);
            else newParams.delete(key);
        });
        // Reset to page 1 when filters change
        if (!updates.page) newParams.set('page', '1');
        setSearchParams(newParams);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><FileText className="w-6 h-6 inline-block mr-2" />{t('scripts.title')}</h1>
                {isAuthenticated && (
                    <Link to="/upload" className="btn-primary">
                        <Upload className="w-4 h-4 inline-block mr-1" />{t('scripts.upload')}
                    </Link>
                )}
            </div>

            {/* Search & filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder={t('scripts.searchPlaceholder')}
                        className="input-field"
                        value={search}
                        onChange={(e) => updateParams({ search: e.target.value })}
                    />
                </div>
                <select
                    className="input-field sm:w-40"
                    value={sort}
                    onChange={(e) => updateParams({ sort: e.target.value })}
                >
                    {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {t(opt.label)}
                        </option>
                    ))}
                </select>
                <button
                    className="btn-secondary"
                    onClick={() => updateParams({ order: order === 'desc' ? 'asc' : 'desc' })}
                >
                    {order === 'desc' ? <><ArrowDown className="w-3 h-3 inline-block mr-1" />{t('scripts.order.desc')}</> : <><ArrowUp className="w-3 h-3 inline-block mr-1" />{t('scripts.order.asc')}</>}
                </button>
            </div>

            {/* Script grid */}
            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
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
            ) : scripts.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <p className="text-5xl mb-4"><Inbox className="w-12 h-12 inline-block text-gray-300" /></p>
                    <p className="text-lg">{t('scripts.empty')}</p>
                    {search && <p className="text-sm mt-1">{t('scripts.emptySearch', { query: search })}</p>}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {scripts.map((script) => (
                        <Link
                            key={script.id}
                            to={`/scripts/${script.id}`}
                            className="card hover:shadow-md transition-all hover:border-primary-200 group"
                        >
                            <div className="flex items-start gap-3">
                                <ScriptIcon icon={script.icon} />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:text-primary-400 transition-colors">
                                        {getLocalizedText(script.i18n, 'name', i18n.language, script.name)}
                                    </h3>
                                    {script.description && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{getLocalizedText(script.i18n, 'description', i18n.language, script.description)}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-400">
                                <span className="font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full text-xs font-semibold">v{script.version}</span>
                                {script.author && <span><User className="w-3 h-3 inline-block mr-0.5" />{script.author}</span>}
                                <span><Download className="w-3 h-3 inline-block mr-0.5" />{script.installs}</span>
                                <span><RefreshCw className="w-3 h-3 inline-block mr-0.5" />{script.updateChecks}</span>
                                {script.rating !== undefined && script.rating > 0 && (
                                    <span className="inline-flex items-center gap-1" title={`${script.rating?.toFixed(1)} (${script.ratingCount})`}>
                                        <StarRating value={script.rating} size={12} />
                                        <span className="text-gray-400 text-xs">{script.rating?.toFixed(1)}</span>
                                    </span>
                                )}
                                <span className="text-gray-300">
                                    {new Date(script.updatedAt).toLocaleDateString('zh-CN')}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        className="btn-secondary"
                        disabled={!pagination.hasPrev}
                        onClick={() => updateParams({ page: String(page - 1) })}
                    >
                        <ChevronLeft className="w-4 h-4 inline-block mr-1" />{t('scripts.prev')}
                    </button>
                    <div className="flex items-center gap-1">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                            .filter((p) => {
                                // Show first, last, and pages around current
                                return p === 1 || p === pagination.totalPages || Math.abs(p - page) <= 2;
                            })
                            .map((p, idx, arr) => (
                                <span key={p} className="flex items-center">
                                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                                        <span className="px-1 text-gray-400">...</span>
                                    )}
                                    <button
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }`}
                                        onClick={() => updateParams({ page: String(p) })}
                                    >
                                        {p}
                                    </button>
                                </span>
                            ))}
                    </div>
                    <button
                        className="btn-secondary"
                        disabled={!pagination.hasNext}
                        onClick={() => updateParams({ page: String(page + 1) })}
                    >
                        {t('scripts.next')} <ChevronRight className="w-4 h-4 inline-block ml-1" />
                    </button>
                </div>
            )}
        </div>
    );
}

