import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getScript, updateScript, type Script, ApiError, type MetadataWarning } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { FaceFrownIcon, PencilIcon, BookOpenIcon, XMarkIcon, DocumentArrowDownIcon, ChevronLeftIcon, ArrowUpOnSquareIcon, FolderOpenIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

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
    const [updateWarnings, setUpdateWarnings] = useState<MetadataWarning[] | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    function readFileContent(file: File) {
        const reader = new FileReader();
        reader.onload = (event) => {
            // FileReader.result 类型为 string | ArrayBuffer | null
            const content = typeof event.target?.result === 'string' ? event.target.result : '';
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
                // 加载脚本元数据（含 readme）
                const data = await getScript(scriptId);
                setScript(data.script);
                setReadme(data.script.readme || '');

                // 所有权检查：仅所有者或管理员可编辑
                const scriptOwnerId = data.script.userId;
                if (scriptOwnerId && user?.id !== scriptOwnerId && user?.role !== 'admin') {
                    setAccessDenied(true);
                    setLoading(false);
                    return;
                }

                // 单独加载原始代码
                const res = await fetch(`/api/scripts/${id}/code`);
                if (res.ok) {
                    const text = await res.text();
                    setCode(text);
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg || t('edit.loadFail', { msg }));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

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
            if (result.warnings && result.warnings.length > 0) {
                setUpdateWarnings(result.warnings);
                setSaving(false);
            } else {
                navigate(`/scripts/${id}`, { replace: true });
            }
        } catch (err: unknown) {
            if (err instanceof ApiError && err.details && err.details.length > 0) {
                setError(`${t('upload.error.metaIncomplete')}\n${err.details.join('\n')}`);
            } else {
                const msg = err instanceof Error ? err.message : String(err);
                setError(t('edit.error.fail', { msg }));
            }
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
                <p className="text-5xl mb-4"><FaceFrownIcon className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{t('edit.accessDenied')}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-flex items-center gap-1">
                    <ChevronLeftIcon className="w-4 h-4" /> {t('edit.backToList')}
                </Link>
            </div>
        );
    }

    if (error && !script) {
        return (
            <div className="text-center py-20">
                <p className="text-5xl mb-4"><FaceFrownIcon className="w-12 h-12 inline-block text-gray-300" /></p>
                <p className="text-lg text-gray-500 dark:text-gray-400">{error}</p>
                <Link to="/scripts" className="btn-primary mt-4 inline-flex items-center gap-1">
                    <ChevronLeftIcon className="w-4 h-4" /> {t('edit.backToList')}
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
                <Link to={`/scripts/${id}`} className="hover:text-primary-600 dark:hover:text-primary-400">{script?.name || ''}</Link>
                <span className="mx-2">/</span>
                <span className="text-gray-900 dark:text-gray-100">{t('edit.title')}</span>
            </nav>

            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><PencilIcon className="w-6 h-6" />{t('edit.title')}</h1>
                <Link to={`/scripts/${id}`} className="btn-secondary">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> {t('edit.backToDetail')}
                </Link>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                            <FolderOpenIcon className="w-4 h-4 mr-1" />{t('upload.fileBtn')}
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
                                    <ArrowUpOnSquareIcon className="w-8 h-8 mx-auto text-primary-500 mb-1" />
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

                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5"><BookOpenIcon className="w-4 h-4" />{t('edit.readme.title')}</h3>
                    </div>
                    <textarea
                        value={readme}
                        onChange={(e) => setReadme(e.target.value)}
                        rows={8}
                        className="w-full font-mono text-sm bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y"
                        spellCheck={false}
                    />
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
                        <XMarkIcon className="w-4 h-4 mr-1" />{error}
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
                            <><DocumentArrowDownIcon className="w-5 h-5 mr-2" />{t('edit.submit')}</>
                        )}
                    </button>
                </div>
            </form>

            {/* 元数据检测警告 */}
            {updateWarnings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ marginTop: 0 }}>
                    <div className="absolute inset-0 bg-black/40" onClick={() => { setUpdateWarnings(null); navigate(`/scripts/${id}`, { replace: true }); }} />
                    <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center gap-2 mb-4">
                            <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {t('upload.warnings.title')}
                            </h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {t('upload.warnings.desc')}
                        </p>
                        <div className="space-y-2 mb-6">
                            {updateWarnings.map((w, i) => (
                                <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-sm ${w.type === 'security'
                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                    : w.type === 'missing'
                                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                    }`}>
                                    <InformationCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <span className="font-medium">@{w.field}: </span>
                                        {w.message}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => { setUpdateWarnings(null); navigate(`/scripts/${id}`, { replace: true }); }}
                            >
                                {t('edit.warnings.viewDetail')}
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => setUpdateWarnings(null)}
                            >
                                {t('edit.warnings.backToEdit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
