import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ConfirmOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info' | 'success';
}

interface PromptOptions extends ConfirmOptions {
    defaultValue?: string;
    placeholder?: string;
}

type DialogResolve = (value: boolean | string | null) => void;

interface DialogTask {
    kind: 'confirm' | 'prompt';
    options: ConfirmOptions | PromptOptions;
    resolve: DialogResolve;
}

type ShowConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
type ShowPromptFn = (opts: PromptOptions) => Promise<string | null>;

let _confirm: ShowConfirmFn | null = null;
let _prompt: ShowPromptFn | null = null;

export function confirm(options: string | ConfirmOptions): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options;
    return _confirm ? _confirm(opts) : Promise.resolve(false);
}

export function alert(message: string, type?: ConfirmOptions['type']): Promise<void> {
    return confirm({ message, confirmText: '', cancelText: '', type }).then(() => { });
}

export function prompt(options: string | PromptOptions): Promise<string | null> {
    const opts = typeof options === 'string' ? { message: options } : options;
    return _prompt ? _prompt(opts) : Promise.resolve(null);
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const [task, setTask] = useState<DialogTask | null>(null);
    const [promptValue, setPromptValue] = useState('');
    const queueRef = useRef<DialogTask[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const showConfirm: ShowConfirmFn = (options) => {
        return new Promise((resolve) => {
            queueRef.current.push({ kind: 'confirm', options, resolve: resolve as (v: boolean | string | null) => void });
            if (!task) processQueue();
        });
    };

    const showPrompt: ShowPromptFn = (options) => {
        return new Promise<string | null>((resolve) => {
            // as 断言：Promise<string|null> 的 resolve 签名含 PromiseLike，与通用 DialogResolve 不兼容
            queueRef.current.push({ kind: 'prompt', options, resolve: resolve as DialogResolve });
            if (!task) processQueue();
        });
    };

    useEffect(() => {
        _confirm = showConfirm;
        _prompt = showPrompt;
        return () => { _confirm = null; _prompt = null; };
    }, [showConfirm, showPrompt]);

    function processQueue() {
        const next = queueRef.current.shift();
        if (next) {
            setTask(next);
            if (next.kind === 'prompt') {
                setPromptValue((next.options as PromptOptions).defaultValue ?? '');
            }
        }
    }

    function done(value: boolean | string | null) {
        task?.resolve(value);
        setTask(null);
        setPromptValue('');
        requestAnimationFrame(() => processQueue());
    }

    useEffect(() => {
        if (!task) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') done(false);
            if (e.key === 'Enter' && task.kind === 'prompt') {
                e.preventDefault();
                done(promptValue);
            }
        };
        window.addEventListener('keydown', handler);
        if (task.kind === 'prompt') {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
        return () => window.removeEventListener('keydown', handler);
    }, [task, promptValue]);

    if (!task) return <>{children}</>;

    const isPrompt = task.kind === 'prompt';
    const opts = task.options;
    const {
        title, message = '',
        confirmText = t('common.confirm'),
        cancelText = isPrompt ? t('common.cancel') : '',
        type = 'danger',
    } = opts;
    const hasCancel = cancelText !== '';
    const promptOpts = isPrompt ? (opts as PromptOptions) : null;

    // 根据类型选择图标
    const TypeIcon = type === 'danger' ? (
        <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth="{1.5}" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
    ) : type === 'success' ? (
        <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth="{1.5}" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
    ) : (
        <svg className="w-12 h-12 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth="{1.5}" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
    );

    // 是否为纯提示（无操作按钮）
    const isAlert = !hasCancel && confirmText === '';

    return (
        <>
            {children}
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => done(false)} />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={title ? 'dialog-title' : undefined}
                    className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-200"
                >
                    {/* 关闭按钮 — 绝对定位在右上角，不占文档流 */}
                    {!isAlert && (
                        <button
                            className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            onClick={() => done(false)}
                            aria-label={t('common.cancel')}
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    )}

                    {/* 图标 */}
                    {TypeIcon && (
                        <div className="flex justify-center mb-4">
                            {TypeIcon}
                        </div>
                    )}

                    {/* 标题 */}
                    {title && (
                        <h3 id="dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-3">
                            {title}
                        </h3>
                    )}

                    {/* 消息内容 */}
                    {message && (
                        <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed text-center">{message}</p>
                    )}

                    {/* Prompt 输入框 */}
                    {isPrompt && (
                        <input
                            ref={inputRef}
                            type="text"
                            className="input-field mt-4 w-full"
                            placeholder={promptOpts?.placeholder ?? ''}
                            value={promptValue}
                            onChange={(e) => setPromptValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); done(promptValue); }
                            }}
                        />
                    )}

                    {/* 底部按钮 */}
                    <div className={`flex ${isAlert ? 'justify-center' : 'justify-end'} gap-4 mt-8`}>
                        {isAlert ? (
                            <button
                                className="px-6 py-2.5 text-base font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                onClick={() => done(false)}
                            >
                                {t('common.close')}
                            </button>
                        ) : (
                            <>
                                {hasCancel && (
                                    <button className="btn-secondary text-base" onClick={() => done(false)}>
                                        {cancelText}
                                    </button>
                                )}
                                {confirmText && (
                                    <button
                                        className={'px-6 py-2.5 rounded-lg text-base font-medium text-white transition-colors ' + (
                                            type === 'danger' ? 'bg-red-600 hover:bg-red-700' :
                                                type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                                                    'bg-primary-600 hover:bg-primary-700'
                                        )}
                                        onClick={() => done(isPrompt ? promptValue : true)}
                                    >
                                        {confirmText}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
