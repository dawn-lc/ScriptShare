import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getScript, getWebhookInfo, generateWebhookSecret, updateGithubConfig, getScriptStats, Script, WebhookInfo, ScriptStats } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowPathIcon, BeakerIcon, ChevronLeftIcon, ClipboardIcon, Cog6ToothIcon, DocumentArrowDownIcon, KeyIcon, LinkIcon, ArrowsRightLeftIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { alert } from '../components/ConfirmDialog';

export default function ScriptSettings() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [script, setScript] = useState<Script | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Webhook 状态
    const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
    const [stats, setStats] = useState<ScriptStats | null>(null);
    const [webhookLoading, setWebhookLoading] = useState(false);
    const [githubRepo, setGithubRepo] = useState('');
    const [githubPath, setGithubPath] = useState('');
    const [githubSaving, setGithubSaving] = useState(false);
    const [githubMsg, setGithubMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!id) return;
        const scriptId = parseInt(id);
        if (isNaN(scriptId)) { setNotFound(true); setLoading(false); return; }

        async function load() {
            try {
                const data = await getScript(scriptId);
                const s = data.script;
                // 仅所有者或管理员
                if (s.userId && user?.id !== s.userId && user?.role !== 'admin') {
                    navigate(`/scripts/${id}`, { replace: true });
                    return;
                }
                setScript(s);

                try {
                    const w = await getWebhookInfo(scriptId);
                    setWebhook(w);
                    setGithubRepo(w.githubRepo);
                    setGithubPath(w.githubPath);
                } catch {
                    // webhook 信息可选
                }

                try {
                    const st = await getScriptStats(scriptId);
                    setStats(st);
                } catch {
                    // 统计信息可选
                }
            } catch {
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id, user, navigate]);

    async function handleGenerateToken() {
        if (!script) return;
        setWebhookLoading(true);
        try {
            await generateWebhookSecret(script.id);
            const w = await getWebhookInfo(script.id);
            setWebhook(w);
        } catch {
            // 忽略错误
        } finally {
            setWebhookLoading(false);
        }
    }

    async function handleSaveGithubConfig() {
        if (!script) return;
        setGithubMsg(null);
        setGithubSaving(true);
        try {
            await updateGithubConfig(script.id, { githubRepo, githubPath });
            setGithubMsg({ type: 'success', text: t('scriptDetail.webhook.saveSuccess') });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setGithubMsg({ type: 'error', text: msg || t('common.error') });
        } finally {
            setGithubSaving(false);
        }
    }

    function copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text).then(() => {
            alert(t('scriptDetail.copySuccess', { label }));
        });
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (notFound || !script) {
        return (
            <div className="text-center py-20">
                <p className="text-5xl mb-4"><Cog6ToothIcon className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{t('settings.notFound')}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-flex items-center gap-1">
                    <ChevronLeftIcon className="w-4 h-4" /> {t('settings.backToScripts')}
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="text-sm text-gray-500 dark:text-gray-400">
                <Link to="/scripts" className="hover:text-primary-600 dark:hover:text-primary-400">{t('scriptDetail.breadcrumb')}</Link>
                <span className="mx-2">/</span>
                <Link to={`/scripts/${id}`} className="hover:text-primary-600 dark:hover:text-primary-400">{script.name}</Link>
                <span className="mx-2">/</span>
                <span className="text-gray-900 dark:text-gray-100">{t('settings.pageTitle')}</span>
            </nav>

            {/* Page header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Cog6ToothIcon className="w-6 h-6" />{t('settings.pageTitle')}
                </h1>
                <Link to={`/scripts/${id}`} className="btn-secondary">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> {t('scriptStats.backToDetail')}
                </Link>
            </div>

            {/* Webhook / GitHub config */}
            <div className="card">
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                            <LinkIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('scriptDetail.webhook.title')}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('scriptDetail.webhook.desc')}</p>
                        </div>
                    </div>
                    <button type="button" className="btn-primary flex-shrink-0" onClick={handleSaveGithubConfig} disabled={githubSaving}>
                        {githubSaving ? t('scriptDetail.webhook.savingConfig') : <><DocumentArrowDownIcon className="w-4 h-4 mr-1" />{t('scriptDetail.webhook.saveConfig')}</>}
                    </button>
                </div>

                {/* Webhook Endpoint */}
                <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 space-y-3 mb-4">
                    <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">① {t('scriptDetail.webhook.urlLabel')}</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={webhook?.webhookUrl || t('scriptDetail.webhook.generateFirst')}
                                className="input-field flex-1 text-sm font-mono"
                                onClick={(e) => e.currentTarget.select()}
                            />
                            {webhook?.webhookUrl && (
                                <button type="button" className="btn-primary flex-shrink-0" onClick={() => copyToClipboard(webhook!.webhookUrl, 'Webhook URL')}>
                                    <ClipboardIcon className="w-4 h-4 mr-1" />{t('scriptDetail.webhook.copy')}
                                </button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">② {t('scriptDetail.webhook.secret')}</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={webhook?.webhookSecret || t('scriptDetail.webhook.clickGenerate')}
                                className="input-field flex-1 text-sm font-mono"
                                onClick={(e) => e.currentTarget.select()}
                            />
                            {webhook?.webhookSecret ? (
                                <button type="button" className="btn-primary flex-shrink-0" onClick={() => copyToClipboard(webhook!.webhookSecret, 'Secret')}>
                                    <ClipboardIcon className="w-4 h-4 mr-1" />{t('scriptDetail.webhook.copy')}
                                </button>
                            ) : (
                                <button type="button" className="btn-primary flex-shrink-0" onClick={handleGenerateToken} disabled={webhookLoading}>
                                    {webhookLoading ? t('scriptDetail.webhook.generating') : <><KeyIcon className="w-4 h-4 mr-1" />{t('scriptDetail.webhook.generateBtn')}</>}
                                </button>
                            )}
                        </div>
                        {webhook?.webhookSecret && (
                            <div className="flex items-center gap-2 mt-2">
                                <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors" onClick={handleGenerateToken} disabled={webhookLoading}>
                                    <ArrowPathIcon className="w-3 h-3" />{t('scriptDetail.webhook.regenerate')}
                                </button>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{t('scriptDetail.webhook.regenerateHint')}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Release Config */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-primary-500 rounded-full" />
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{t('scriptDetail.webhook.releaseLabel')}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        {t('scriptDetail.webhook.releaseDesc')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{t('scriptDetail.webhook.repoLabel')}</label>
                            <input
                                type="text"
                                className="input-field text-sm"
                                placeholder={t('scriptDetail.webhook.repoPlaceholder')}
                                value={githubRepo}
                                onChange={(e) => setGithubRepo(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{t('scriptDetail.webhook.pathLabel')}</label>
                            <input
                                type="text"
                                className="input-field text-sm"
                                placeholder={t('scriptDetail.webhook.pathPlaceholder')}
                                value={githubPath}
                                onChange={(e) => setGithubPath(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                            {t('scriptDetail.webhook.stable')}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <BeakerIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            {t('scriptDetail.webhook.canary')}
                        </span>
                    </div>
                    {githubMsg && (
                        <p className={`text-xs ${githubMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
                            {githubMsg.text}
                        </p>
                    )}
                </div>

                {/* Webhook 日志 */}
                {stats?.webhookLogs && stats.webhookLogs.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mt-6">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
                            <ArrowsRightLeftIcon className="w-5 h-5" />{t('scriptStats.webhookLogs')}
                        </h3>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {stats.webhookLogs.map((log) => (
                                <div key={log.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                                    {log.action === 'updated' ? (
                                        <CheckCircleIcon className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
                                    ) : log.action === 'meta_rejected' || log.action === 'error' ? (
                                        <XCircleIcon className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
                                    ) : (
                                        <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                                {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                                            </span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${log.action === 'updated' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                : log.action === 'meta_rejected' || log.action === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                }`}>
                                                {log.action}
                                            </span>
                                        </div>
                                        <p className="text-gray-600 dark:text-gray-300 mt-0.5">{log.summary || log.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
