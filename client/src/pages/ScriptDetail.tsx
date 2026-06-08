import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    getScript,
    getInstallUrl,
    getUpdateUrl,
    getScriptCode,
    deleteScript,
    hardDeleteScript,
    getScriptRatings,
    rateScript,
    Script,
    RatingData,
} from '../api';
import { confirm, alert } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { getLocalizedText } from '../utils/localize';
import { FaceFrownIcon, DocumentTextIcon, ChartBarIcon, PencilIcon, TrashIcon, UserIcon, ArrowDownTrayIcon, ArrowPathIcon, CalendarDaysIcon, ClipboardIcon, GlobeAltIcon, KeyIcon, CubeIcon, BeakerIcon, ChevronLeftIcon, ChevronRightIcon, StarIcon, ChatBubbleLeftRightIcon, ShareIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import ScriptIcon from '../components/ScriptIcon';
import StarRating from '../components/StarRating';

export default function ScriptDetail() {
    const { t, i18n } = useTranslation();
    const { isAuthenticated, user } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [script, setScript] = useState<Script | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [sourceCode, setSourceCode] = useState<string | null>(null);
    const [sourceLoading, setSourceLoading] = useState(false);
    const [ratingData, setRatingData] = useState<RatingData | null>(null);
    const [showRatingDialog, setShowRatingDialog] = useState(false);
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const [channel, setChannel] = useState<'stable' | 'canary'>('stable');

    useEffect(() => {
        if (!id) return;
        const scriptId = parseInt(id);
        if (isNaN(scriptId)) return;
        async function load() {
            try {
                const data = await getScript(scriptId);
                setScript(data.script);
                // 并行加载评分数据
                getScriptRatings(scriptId).then(setRatingData).catch(() => { });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg || t('common.error'));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    async function handleDelete() {
        if (!script || !(await confirm(t('scriptDetail.deleteConfirm', { name: script.name })))) return;
        setDeleting(true);
        try {
            await deleteScript(script.id);
            alert(t('scriptDetail.deleteSuccess', { defaultValue: '脚本已删除' }), 'success');
            navigate('/scripts', { replace: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(t('scriptDetail.deleteFail', { msg: msg || t('common.error') }));
            setDeleting(false);
        }
    }

    async function handleHardDelete() {
        if (!script || !(await confirm({ message: t('scriptDetail.hardDeleteConfirm', { name: script.name }), type: 'danger', confirmText: t('scriptDetail.hardDelete') }))) return;
        setDeleting(true);
        try {
            await hardDeleteScript(script.id);
            alert(t('scriptDetail.hardDeleteSuccess', { defaultValue: '脚本已永久删除' }), 'info');
            navigate('/scripts', { replace: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(t('scriptDetail.deleteFail', { msg: msg || t('common.error') }));
            setDeleting(false);
        }
    }

    function copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text).then(() => {
            alert(t('scriptDetail.copySuccess', { label }), 'success');
        });
    }

    async function loadSourceCode(targetChannel?: string) {
        if (!script) return;
        const ch = targetChannel || channel;
        setSourceLoading(true);
        try {
            const url = ch === 'canary'
                ? `/api/scripts/${script.id}/canary/code`
                : `/api/scripts/${script.id}/code`;
            const res = await fetch(url);
            const text = await res.text();
            setSourceCode(text);
        } catch {
            setSourceCode(null);
        } finally {
            setSourceLoading(false);
        }
        setShowSource(true);
    }

    // 切换频道时自动更新已显示的源码
    useEffect(() => {
        if (showSource && script) {
            loadSourceCode(channel);
        }
    }, [channel]);

    async function handleLoadSource() {
        await loadSourceCode();
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (error || !script) {
        return (
            <div className="text-center py-20">
                <p className="text-5xl mb-4"><FaceFrownIcon className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{error || t('scriptDetail.notFound')}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-flex items-center gap-1">
                    <ChevronLeftIcon className="w-4 h-4" /> {t('scriptDetail.backToList')}
                </Link>
            </div>
        );
    }

    const matchPatterns = script.match ?? [];
    const grantList = script.grant ?? [];
    const requireList = script.require ?? [];

    const installUrl = getInstallUrl(script.id, channel);
    const updateUrl = getUpdateUrl(script.id, channel);
    const codeUrl = getScriptCode(script.id);

    // 生成供用户复制的安装代码
    const installCode = `// ==UserScript==
// @name         ${script.name}
// @namespace    ${script.namespace || `http://localhost/`}
// @version      ${script.version}
// @description  ${script.description || ''}
// @author       ${script.author || ''}
// @match        ${matchPatterns.join('\n// @match        ')}
// @grant        ${grantList.join('\n// @grant        ')}
// @updateURL    ${window.location.origin}${updateUrl}
// @downloadURL  ${window.location.origin}${installUrl}
// ==/UserScript==`;

    const isDeleted = !!script.deletedAt;

    return (
        <>
            <div className="space-y-6">
                {/* Breadcrumb */}
                <nav className="text-sm text-gray-500 dark:text-gray-400">
                    <Link to="/scripts" className="hover:text-primary-600 dark:hover:text-primary-400">
                        {t('scriptDetail.breadcrumb')}
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="text-gray-900 dark:text-gray-100">{script.name}</span>
                </nav>

                {/* Header */}
                <div className="card">
                    <div className="flex items-start gap-4">
                        <ScriptIcon icon={script.icon} size={56} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{getLocalizedText(script.i18n, 'name', i18n.language, script.name)}</h1>
                                    {script.description && <p className="text-gray-500 dark:text-gray-400 mt-1 line-clamp-3" title={getLocalizedText(script.i18n, 'description', i18n.language, script.description)}>{getLocalizedText(script.i18n, 'description', i18n.language, script.description)}</p>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
                                    <button
                                        className="btn-secondary text-xs sm:text-sm"
                                        onClick={() => {
                                            const url = window.location.href;
                                            navigator.clipboard.writeText(url).then(() => {
                                                alert(t('scriptDetail.shareCopied'), 'success');
                                            });
                                        }}
                                    >
                                        <ShareIcon className="w-4 h-4 mr-1" />{t('scriptDetail.share')}
                                    </button>
                                    {isAuthenticated && (user?.role === 'admin' || user?.id === script.userId) && (
                                        <>
                                            <Link to={`/scripts/${script.id}/stats`} className="btn-secondary text-xs sm:text-sm">
                                                <ChartBarIcon className="w-4 h-4 mr-1" />{t('scriptDetail.stats')}
                                            </Link>
                                            <Link to={`/scripts/${script.id}/edit`} className="btn-secondary text-xs sm:text-sm">
                                                <PencilIcon className="w-4 h-4 mr-1" />{t('scriptDetail.edit')}
                                            </Link>
                                            <Link to={`/scripts/${script.id}/settings`} className="btn-secondary text-xs sm:text-sm">
                                                <Cog6ToothIcon className="w-4 h-4 mr-1" />{t('scriptDetail.settings')}
                                            </Link>
                                            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                                            {!isDeleted && (
                                                <button className="btn-danger text-xs sm:text-sm" onClick={handleDelete} disabled={deleting}>
                                                    {deleting ? t('scriptDetail.deleting') : <><TrashIcon className="w-4 h-4 mr-1" />{t('scriptDetail.delete')}</>}
                                                </button>
                                            )}
                                            {user?.role === 'admin' && (
                                                <button className="btn-danger text-xs sm:text-sm" onClick={handleHardDelete} disabled={deleting}>
                                                    {deleting ? t('scriptDetail.deleting') : <><TrashIcon className="w-4 h-4 mr-1" />{t('scriptDetail.hardDelete')}</>}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-gray-500 dark:text-gray-400">
                                {isDeleted && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-full text-xs text-red-700 dark:text-red-400 font-medium">
                                        <TrashIcon className="w-3 h-3" />
                                        {t('scriptDetail.deletedBadge', { defaultValue: '脚本已被删除' })}
                                    </span>
                                )}
                                <span className="font-mono bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                    v{script.version}
                                </span>
                                {script.canaryVersion && (
                                    <span className="font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                        <BeakerIcon className="w-3 h-3 mr-0.5" />v{script.canaryVersion}
                                    </span>
                                )}
                                {script.author && <span className="inline-flex items-center gap-1"><UserIcon className="w-3 h-3" />{script.author}</span>}
                                <span className="inline-flex items-center gap-1"><ArrowDownTrayIcon className="w-3 h-3" />{t('scriptDetail.installs', { count: script.installs })}</span>
                                <span className="inline-flex items-center gap-1"><ArrowPathIcon className="w-3 h-3" />{t('scriptDetail.updateChecks', { count: script.updateChecks })}</span>
                                <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="w-3 h-3" />{t('scriptDetail.updatedOn', { date: new Date(script.updatedAt).toLocaleDateString('zh-CN') })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Install & Update */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="card h-full flex flex-col">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5"><ArrowDownTrayIcon className="w-5 h-5" />{t('scriptDetail.install.title')}</h3>

                        {/* Channel toggle */}
                        {script.canaryVersion && (
                            <div className="flex items-center gap-2 mb-3">
                                <button
                                    type="button"
                                    onClick={() => setChannel('stable')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${channel === 'stable'
                                        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-600'
                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    🟢 {t('scriptDetail.install.stable')} v{script.version}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChannel('canary')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${channel === 'canary'
                                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-600'
                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    🧪 {t('scriptDetail.install.canary')} v{script.canaryVersion}
                                </button>
                            </div>
                        )}

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                            {t('scriptDetail.install.desc')}
                        </p>
                        <div className="flex-1 flex items-center">
                            <div className="flex flex-col sm:flex-row gap-2 w-full">
                                <a href={installUrl} className="btn-primary flex-1 justify-center">
                                    <ArrowDownTrayIcon className="w-4 h-4 mr-2" />{t('scriptDetail.install.btn')}
                                </a>
                                <button
                                    className="btn-secondary flex-1 justify-center"
                                    onClick={() => copyToClipboard(`${window.location.origin}${installUrl}`, t('scriptDetail.install.copy'))}
                                >
                                    <ClipboardIcon className="w-4 h-4 mr-2" />{t('scriptDetail.install.copy')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card h-full flex flex-col">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5"><StarIcon className="w-5 h-5" />{t('scriptDetail.rating.title')}</h3>

                        {/* Average rating display — clickable to open rating dialog */}
                        {ratingData && (
                            <div
                                className={`flex-1 flex flex-col items-center justify-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center ${isAuthenticated ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors' : ''}`}
                                onClick={() => isAuthenticated && setShowRatingDialog(true)}
                            >
                                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                    {ratingData.average > 0 ? ratingData.average : '-'}
                                </div>
                                <StarRating value={ratingData.average} count={ratingData.count} size={18} />
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    {ratingData.count > 0
                                        ? t('scriptDetail.rating.count', { count: ratingData.count })
                                        : t('scriptDetail.rating.noRatings')}
                                </div>
                                {isAuthenticated && (
                                    <div className="mt-2 text-xs text-primary-600 dark:text-primary-400 font-medium">
                                        {ratingData?.userRating
                                            ? t('scriptDetail.rating.changeRating')
                                            : t('scriptDetail.rating.rateThis')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>


                {/* Rating dialog */}
                {showRatingDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ marginTop: 0 }}>
                        <div className="absolute inset-0 bg-black/40" onClick={() => setShowRatingDialog(false)} />
                        <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 text-center">
                                {ratingData?.userRating
                                    ? t('scriptDetail.rating.changeRating')
                                    : t('scriptDetail.rating.rateThis')}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
                                {t('scriptDetail.rating.dialogDesc')}
                            </p>
                            <div className="flex justify-center mb-6">
                                <StarRating
                                    value={0}
                                    onChange={async (score) => {
                                        if (ratingSubmitting) return;
                                        setRatingSubmitting(true);
                                        try {
                                            const result = await rateScript(script!.id, score);
                                            setRatingData({
                                                average: result.average,
                                                count: result.count,
                                                userRating: result.userRating,
                                            });
                                            setShowRatingDialog(false);
                                        } catch (err: unknown) {
                                            const msg = err instanceof Error ? err.message : String(err);
                                            alert(msg || t('common.error'));
                                        } finally {
                                            setRatingSubmitting(false);
                                        }
                                    }}
                                    size={36}
                                />
                            </div>
                            {ratingSubmitting && (
                                <p className="text-sm text-gray-400 text-center">
                                    <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full mr-2" />
                                    {t('common.loading')}
                                </p>
                            )}
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setShowRatingDialog(false)}
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Metadata */}
                <div className="grid md:grid-cols-2 gap-4">
                    {/* Match patterns */}
                    {matchPatterns.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5"><GlobeAltIcon className="w-5 h-5" />{t('scriptDetail.metadata.match')}</h3>
                            <div className="space-y-1">
                                {matchPatterns.map((pattern, i) => (
                                    <code
                                        key={i}
                                        className="block text-sm bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded text-gray-700 dark:text-gray-200 font-mono"
                                    >
                                        {pattern}
                                    </code>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Grants */}
                    {grantList.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5"><KeyIcon className="w-5 h-5" />{t('scriptDetail.metadata.grant')}</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {grantList.map((g, i) => (
                                    <span
                                        key={i}
                                        className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-1 rounded font-mono font-medium border border-amber-300 dark:border-amber-700"
                                    >
                                        {g}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Requires */}
                    {requireList.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5"><CubeIcon className="w-5 h-5" />{t('scriptDetail.metadata.require')}</h3>
                            <div className="space-y-1">
                                {requireList.map((req, i) => (
                                    <code
                                        key={i}
                                        className="block text-sm bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded text-gray-700 dark:text-gray-200 font-mono truncate"
                                    >
                                        {req}
                                    </code>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Script description — pure user Markdown */}
                {script.readme && (
                    <div className="card">
                        <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {script.readme}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}

                {/* Support URL — feedback link */}
                {script.supportURL && (
                    <div className="card">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                                <ChatBubbleLeftRightIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('scriptDetail.support.title')}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    {t('scriptDetail.support.desc')}
                                </p>
                            </div>
                            <a
                                href={script.supportURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary flex-shrink-0"
                            >
                                <ChatBubbleLeftRightIcon className="w-4 h-4 mr-2" />
                                {t('scriptDetail.support.btn')}
                            </a>
                        </div>
                    </div>
                )}

                {/* Script code preview — click to load */}
                <div className="card">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5"><DocumentTextIcon className="w-5 h-5" />{t('scriptDetail.source.title')}</h3>
                    </div>
                    {showSource ? (
                        <pre className="text-sm bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-96">
                            <code>{sourceCode || installCode}</code>
                        </pre>
                    ) : (
                        <div className="text-center py-8">
                            <button
                                className="btn-secondary"
                                onClick={handleLoadSource}
                                disabled={sourceLoading}
                            >
                                {sourceLoading ? t('common.loading') : <><DocumentTextIcon className="w-4 h-4 mr-2" />{t('scriptDetail.source.view')}</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

