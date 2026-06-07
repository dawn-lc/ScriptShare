import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getScripts, ScriptListItem, Pagination } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getLocalizedText, formatCount } from '../utils/localize';
import { DocumentTextIcon, ArrowUpTrayIcon, InboxIcon, UserIcon, ArrowDownTrayIcon, ArrowPathIcon, ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, StarIcon } from '@heroicons/react/24/outline';
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

    // 搜索防抖：用户停止输入 300ms 后再更新 URL 参数
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [localSearch, setLocalSearch] = useState(search);

    // 同步外部 search 参数变化到本地状态
    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    function handleSearchChange(value: string) {
        setLocalSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateParams({ search: value });
        }, 300);
    }

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const data = await getScripts({ page, limit: 12, search, sort, order });
                setScripts(data.scripts);
                setPagination(data.pagination);
            } catch (err: unknown) {
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
        // 筛选条件变化时重置到第 1 页
        if (!updates.page) newParams.set('page', '1');
        setSearchParams(newParams);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><DocumentTextIcon className="w-6 h-6" />{t('scripts.title')}</h1>
                {isAuthenticated && (
                    <Link to="/upload" className="btn-primary">
                        <ArrowUpTrayIcon className="w-4 h-4 mr-1" />{t('scripts.upload')}
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
                        value={localSearch}
                        onChange={(e) => handleSearchChange(e.target.value)}
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
                    {order === 'desc' ? <span className="inline-flex items-center gap-1"><ArrowDownIcon className="w-3 h-3" />{t('scripts.order.desc')}</span> : <span className="inline-flex items-center gap-1"><ArrowUpIcon className="w-3 h-3" />{t('scripts.order.asc')}</span>}
                </button>
            </div>

            {/* Script grid */}
            {loading ? (
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="card animate-pulse">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                                    <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-full" />
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-4">
                                <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-16" />
                                <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-20" />
                                <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-12" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : scripts.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <p className="text-5xl mb-4"><InboxIcon className="w-12 h-12 inline-block text-gray-300 dark:text-gray-600" /></p>
                    <p className="text-lg">{t('scripts.empty')}</p>
                    {search && <p className="text-sm mt-1">{t('scripts.emptySearch', { query: search })}</p>}
                </div>
            ) : (
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {scripts.map((script) => (
                        <Link
                            key={script.id}
                            to={`/scripts/${script.id}`}
                            className="card flex flex-col h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-600 group"
                        >
                            <div className="flex items-start gap-3.5 flex-1">
                                <ScriptIcon icon={script.icon} />
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                        {getLocalizedText(script.i18n, 'name', i18n.language, script.name)}
                                    </h3>
                                    {script.description && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed line-clamp-2">
                                            {getLocalizedText(script.i18n, 'description', i18n.language, script.description)}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-400">
                                <span className="font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-md text-xs font-semibold leading-5">v{script.version}</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" title={t('scriptDetail.installs', { count: script.installs })}>
                                    <ArrowDownTrayIcon className="w-3 h-3" />{formatCount(script.installs, i18n.language)}
                                </span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" title={t('scriptDetail.updateChecks', { count: script.updateChecks })}>
                                    <ArrowPathIcon className="w-3 h-3" />{formatCount(script.updateChecks, i18n.language)}
                                </span>
                                {script.rating !== undefined && script.rating > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" title={`${script.rating?.toFixed(1)} (${script.ratingCount})`}>
                                        <StarRating value={script.rating} size={12} />
                                        <span className="text-gray-400 text-xs">{script.rating?.toFixed(1)}</span>
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-gray-400/60">
                                        <span className="text-xs">{t('scriptDetail.rating.noRatings')}</span>
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center text-xs text-gray-400 mt-2">
                                {script.author ? (
                                    <span className="inline-flex items-center gap-1">
                                        <UserIcon className="w-3 h-3" />{script.author}
                                    </span>
                                ) : <span />}
                                <span className="ml-auto text-gray-400/70 dark:text-gray-500/70 whitespace-nowrap" title={new Date(script.updatedAt).toLocaleString('zh-CN')}>
                                    {new Date(script.updatedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                        <ChevronLeftIcon className="w-4 h-4 mr-1" />{t('scripts.prev')}
                    </button>
                    <div className="flex items-center gap-1">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                            .filter((p) => {
                                // 显示首页、末页和当前页附近的页码
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
                        {t('scripts.next')} <ChevronRightIcon className="w-4 h-4 ml-1" />
                    </button>
                </div>
            )}
        </div>
    );
}

