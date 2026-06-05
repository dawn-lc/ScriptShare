import { useState, useRef, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { createScript } from '../api';
import { BookOpen, Clipboard, X, Upload as UploadIcon, FileUp, FileCheck } from 'lucide-react';

const ACCEPTED_EXTENSIONS = ['.js', '.user.js', '.txt'];

export default function Upload() {
    const { t } = useTranslation();
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: '/upload' }} replace />;
    }
    const [code, setCode] = useState('');
    const [filename, setFilename] = useState('');
    const [readme, setReadme] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [dragError, setDragError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const template = `// ==UserScript==
// @name         My New Script
// @namespace    http://localhost/
// @version      1.0.0
// @description  Script description
// @author       YourName
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Your code starts here

})();`;

    function isValidFile(file: File): boolean {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return ACCEPTED_EXTENSIONS.includes(ext) || ext === '.js' || file.name.endsWith('.user.js');
    }

    function readFileContent(file: File) {
        setFilename(file.name);
        setDragError('');
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setCode(content);
        };
        reader.onerror = () => {
            setDragError(t('upload.dragDropError'));
        };
        reader.readAsText(file);
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        readFileContent(file);
    }

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
            setDragError('');
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

        const file = files[0];
        if (!isValidFile(file)) {
            setDragError(t('upload.dragDropError'));
            return;
        }

        readFileContent(file);
    }, [t]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (!code.trim()) {
            setError(t('upload.error.empty'));
            return;
        }

        // Basic validation: check for @name
        if (!code.includes('// @name')) {
            setError(t('upload.error.noName'));
            return;
        }

        setUploading(true);
        try {
            const result = await createScript(code, filename || undefined, readme || undefined);
            navigate(`/scripts/${result.script.id}`, { replace: true });
        } catch (err: any) {
            setError(t('upload.error.fail', { msg: err.message }));
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><UploadIcon className="w-6 h-6 inline-block mr-2" />{t('upload.title')}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {t('upload.desc')}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* File upload with drag & drop */}
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('upload.fileUpload')}</h3>

                    {/* Drop zone */}
                    <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            relative flex flex-col items-center justify-center
                            border-2 border-dashed rounded-xl p-8
                            transition-all duration-200 ease-in-out cursor-pointer
                            ${isDragging
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 scale-[1.02] shadow-lg'
                                : filename
                                    ? 'border-green-300 bg-green-50 dark:bg-green-900/30'
                                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:border-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }
                        `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".js,.user.js,.txt"
                            onChange={handleFileUpload}
                            className="hidden"
                        />

                        {/* Icon */}
                        <div className={`mb-3 transition-transform duration-200 ${isDragging ? 'scale-110' : ''}`}>
                            {filename ? (
                                <FileCheck className="w-10 h-10 text-green-500" />
                            ) : (
                                <FileUp className={`w-10 h-10 ${isDragging ? 'text-primary-500' : 'text-gray-400'}`} />
                            )}
                        </div>

                        {/* Text */}
                        {filename ? (
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">
                                {t('upload.dragDropSuccess', { name: filename })}
                            </p>
                        ) : isDragging ? (
                            <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                                {t('upload.dragDropActive')}
                            </p>
                        ) : (
                            <>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                    {t('upload.dragDrop')}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {t('upload.dragDropHint')}
                                </p>
                            </>
                        )}

                        {/* Drag error */}
                        {dragError && (
                            <p className="mt-2 text-xs text-red-500">{dragError}</p>
                        )}
                    </div>
                </div>

                {/* Code editor */}
                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('upload.code.title')}</h3>
                        <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setCode(template)}
                        >
                            <Clipboard className="w-4 h-4 inline-block mr-1" />{t('upload.code.template')}
                        </button>
                    </div>
                    <textarea
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        rows={20}
                        className="w-full font-mono text-sm bg-gray-900 text-gray-100 p-4 rounded-lg
                       border border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500
                       placeholder-gray-500 resize-y"
                        placeholder={t('upload.code.placeholder')}
                        spellCheck={false}
                    />
                </div>

                {/* Readme (Markdown) */}
                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100"><BookOpen className="w-4 h-4 inline-block mr-1" />{t('upload.readme.title')}</h3>
                    </div>
                    <textarea
                        value={readme}
                        onChange={(e) => setReadme(e.target.value)}
                        rows={8}
                        className="w-full font-mono text-sm bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y"
                        placeholder={t('upload.readme.placeholder')}
                        spellCheck={false}
                    />
                </div>

                {/* Error message */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                        <X className="w-4 h-4 inline-block mr-1" />{error}
                    </div>
                )}

                {/* Submit */}
                <div className="flex items-center gap-3 justify-end">
                    <button type="button" className="btn-secondary" onClick={() => navigate('/scripts')}>
                        {t('upload.cancel')}
                    </button>
                    <button type="submit" className="btn-primary" disabled={uploading}>
                        {uploading ? (
                            <>
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                {t('upload.submitting')}
                            </>
                        ) : (
                            <><UploadIcon className="w-5 h-5 inline-block mr-2" />{t('upload.submit')}</>
                        )}
                    </button>
                </div>
            </form>

        </div>
    );
}
