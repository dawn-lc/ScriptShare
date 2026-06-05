import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getScript, updateScript, Script, getWebhookInfo, generateWebhookSecret, updateGithubConfig, type WebhookInfo } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Frown, Pencil, BookOpen, X, Save, ChevronLeft, Link2, Key, RefreshCw, Circle, FlaskConical, Clipboard, FileUp, FolderOpen } from 'lucide-react';

export default function EditScript() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [script, setScript] = useState<Script | null>(null);
    const [code, setCode] = useState('');
    const [readme, setReadme] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [accessDenied, setAccessDenied] = useState(false);

    // Webhook state
    const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
    const [webhookLoading, setWebhookLoading] = useState(false);
    const [githubRepo, setGithubRepo] = useState('');
    const [githubPath, setGithubPath] = useState('');
    const [githubSaving, setGithubSaving] = useState(false);
    const [githubMsg, setGithubMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    function readFileContent(file: File) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setCode(content);
        };
        reader.readAsText(file);
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        readFileContent(file);
        e.target.value = '';
    }

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        readFileContent(files[0]);
    }, []);

    useEffect(() => {
        if (!id) return;
        const scriptId = parseInt(id);
        if (isNaN(scriptId)) return;

        async function load() {
            try {
                // Load script metadata (including readme)
                const data = await getScript(scriptId);
                setScript(data.script);
                setReadme((data.script as any).readme || '');

                // Ownership check: only owner or admin can edit
                const scriptOwnerId = (data.script as any).userId;
                if (scriptOwnerId && user?.id !== scriptOwnerId && user?.role !== 'admin') {
                    setAccessDenied(true);
                    setLoading(false);
                    return;
                }

                // Load raw code separately
                const res = await fetch(`/api/scripts/${id}/code`);
                if (res.ok) {
                    const text = await res.text();
                    setCode(text);
                }

                // Load webhook info
                try {
                    const w = await getWebhookInfo(scriptId);
                    setWebhook(w);
                    setGithubRepo(w.githubRepo);
                    setGithubPath(w.githubPath);
                } catch {
                    // webhook info is optional
                }
            } catch (err: any) {
                setError(err.message || t('edit.loadFail', { msg: err.message }));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    async function handleGenerateToken() {
        if (!script) return;
        setWebhookLoading(true);
        try {
            await generateWebhookSecret(script.id);
            const w = await getWebhookInfo(script.id);
            setWebhook(w);
        } catch (err: any) {
            setError(err.message || t('common.error'));
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
        } catch (err: any) {
            setGithubMsg({ type: 'error', text: err.message || t('common.error') });
        } finally {
            setGithubSaving(false);
        }
    }

    function copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text).then(() => {
            alert(`${label} ${t('scriptDetail.copySuccess', { label: '' }).trim()}`);
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (!code.trim()) {
            setError(t('edit.error.empty'));
            return;
        }

        setSaving(true);
        try {
            const result = await updateScript(parseInt(id!), code, readme || undefined);
            navigate(`/scripts/${id}`, { replace: true });
        } catch (err: any) {
            setError(t('edit.error.fail', { msg: err.message }));
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (accessDenied) {
        return (
            <div className="text-center py-20">
                <p className="text-5xl mb-4"><Frown className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{t('edit.accessDenied')}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-block">
                    <ChevronLeft className="w-4 h-4 inline-block" /> {t('edit.backToList')}
                </Link>
            </div>
        );
    }

    if (error && !script) {
        return (
            <div className="text-center py-20">
                <p className="text-5xl mb-4"><Frown className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{error}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-block">
                    <ChevronLeft className="w-4 h-4 inline-block" /> {t('edit.backToList')}
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><Pencil className="w-6 h-6 inline-block mr-2" />{t('edit.title')}</h1>
                    {script && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {script.name} v{script.version}
                        </p>
                    )}
                </div>
                <Link to={`/scripts/${id}`} className="btn-secondary">
                    <ChevronLeft className="w-4 h-4 inline-block" /> {t('edit.backToDetail')}
                </Link>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100"><BookOpen className="w-4 h-4 inline-block mr-1" />{t('edit.readme.title')}</h3>
                    </div>
                    <textarea
                        value={readme}
                        onChange={(e) => setReadme(e.target.value)}
                        rows={8}
                        className="w-full font-mono text-sm bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y"
                        spellCheck={false}
                    />
                </div>
                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('edit.code.title')}</h3>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".js,.user.js,.txt"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <button type="button" className="btn-secondary text-sm" onClick={() => fileInputRef.current?.click()}>
                            <FolderOpen className="w-4 h-4 inline-block mr-1" />{t('upload.fileBtn')}
                        </button>
                    </div>

                    {/* Drop zone wrapper */}
                    <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={`relative transition-all duration-200 rounded-lg ${isDragging ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900' : ''}`}
                    >
                        {isDragging && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary-50/90 dark:bg-primary-900/80 rounded-lg border-2 border-dashed border-primary-400">
                                <div className="text-center">
                                    <FileUp className="w-8 h-8 mx-auto text-primary-500 mb-1" />
                                    <p className="text-sm font-medium text-primary-600 dark:text-primary-300">{t('upload.dragDropActive')}</p>
                                </div>
                            </div>
                        )}
                        <textarea
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            rows={24}
                            className="w-full font-mono text-sm bg-gray-900 text-gray-100 p-4 rounded-lg
                       border border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500
                       placeholder-gray-500 resize-y"
                            spellCheck={false}
                        />
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                        <X className="w-4 h-4 inline-block mr-1" />{error}
                    </div>
                )}

                {/* Webhook / GitHub config */}
                {script && (user?.role === 'admin' || user?.id === (script as any).userId) && (
                    <div className="card border-primary-200">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2"><Link2 className="w-5 h-5 inline-block mr-1" />{t('scriptDetail.webhook.title')}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {t('scriptDetail.webhook.desc')}
                        </p>

                        {/* Webhook URL + Secret */}
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">① Payload URL</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={webhook?.webhookUrl || t('scriptDetail.webhook.generateFirst')}
                                        className="input-field flex-1 text-sm font-mono"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                    {webhook?.webhookUrl && (
                                        <button type="button" className="btn-primary flex-shrink-0" onClick={() => copyToClipboard(webhook.webhookUrl!, 'Webhook URL')}>
                                            <Clipboard className="w-4 h-4 inline-block mr-1" />{t('scriptDetail.webhook.copy')}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{t('scriptDetail.webhook.secret')}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={webhook?.webhookSecret || t('scriptDetail.webhook.clickGenerate')}
                                        className="input-field flex-1 text-sm font-mono"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                    {webhook?.webhookSecret ? (
                                        <button type="button" className="btn-primary flex-shrink-0" onClick={() => copyToClipboard(webhook.webhookSecret!, 'Secret')}>
                                            <Clipboard className="w-4 h-4 inline-block mr-1" />{t('scriptDetail.webhook.copy')}
                                        </button>
                                    ) : (
                                        <button type="button" className="btn-primary flex-shrink-0" onClick={handleGenerateToken} disabled={webhookLoading}>
                                            {webhookLoading ? t('scriptDetail.webhook.generating') : <><Key className="w-4 h-4 inline-block mr-1" />{t('scriptDetail.webhook.generateBtn')}</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {webhook?.webhookSecret && (
                                <button type="button" className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-300" onClick={handleGenerateToken} disabled={webhookLoading}>
                                    <RefreshCw className="w-3 h-3 inline-block mr-1" />{t('scriptDetail.webhook.regenerate')}
                                </button>
                            )}
                        </div>

                        {/* GitHub config */}
                        <div className="space-y-3 border-t border-gray-100 pt-4">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block">{t('scriptDetail.webhook.releaseLabel')}</label>
                            <p className="text-xs text-gray-400 mb-2">
                                {t('scriptDetail.webhook.releaseDesc')}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-0.5">{t('scriptDetail.webhook.repoLabel')}</label>
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder={t('scriptDetail.webhook.repoPlaceholder')}
                                        value={githubRepo}
                                        onChange={(e) => setGithubRepo(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-0.5">{t('scriptDetail.webhook.pathLabel')}</label>
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder={t('scriptDetail.webhook.pathPlaceholder')}
                                        value={githubPath}
                                        onChange={(e) => setGithubPath(e.target.value)}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400">
                                <Circle className="w-3 h-3 inline-block mr-1 text-green-500" fill="currentColor" />{t('scriptDetail.webhook.stable')}<br />
                                <FlaskConical className="w-3 h-3 inline-block mr-1 text-amber-500" />{t('scriptDetail.webhook.canary')}
                            </p>
                            <button type="button" className="btn-secondary" onClick={handleSaveGithubConfig} disabled={githubSaving}>
                                {githubSaving ? t('scriptDetail.webhook.savingConfig') : <><Save className="w-4 h-4 inline-block mr-1" />{t('scriptDetail.webhook.saveConfig')}</>}
                            </button>
                            {githubMsg && (
                                <p className={`text-xs mt-2 ${githubMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
                                    {githubMsg.text}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 justify-end">
                    <button type="button" className="btn-secondary" onClick={() => navigate(`/scripts/${id}`)}>
                        {t('edit.cancel')}
                    </button>
                    <button type="submit" className="btn-primary" disabled={saving}>
                        {saving ? (
                            <>
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                {t('edit.saving')}
                            </>
                        ) : (
                            <><Save className="w-5 h-5 inline-block mr-2" />{t('edit.submit')}</>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
