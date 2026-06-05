import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info' | 'success';
}

interface DialogTask {
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
}

type ShowFn = (opts: ConfirmOptions) => Promise<boolean>;
let _show: ShowFn | null = null;

export function confirm(options: string | ConfirmOptions): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options;
    return _show ? _show(opts) : Promise.resolve(false);
}

export function alert(message: string): Promise<void> {
    return confirm({ message, confirmText: '确认', cancelText: '' }).then(() => { });
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const [task, setTask] = useState<DialogTask | null>(null);
    const queueRef = useRef<DialogTask[]>([]);

    const show: ShowFn = (options) => {
        return new Promise((resolve) => {
            queueRef.current.push({ options, resolve });
            if (!task) processQueue();
        });
    };

    useEffect(() => {
        _show = show;
        return () => { _show = null; };
    }, [show]);

    function processQueue() {
        const next = queueRef.current.shift();
        if (next) setTask(next);
    }

    function done(value: boolean) {
        task?.resolve(value);
        setTask(null);
        requestAnimationFrame(() => processQueue());
    }

    useEffect(() => {
        if (!task) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') done(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [task]);

    const { options } = task || { options: {} as ConfirmOptions };
    const {
        title, message = '',
        confirmText = t('common.confirm'), cancelText = t('common.cancel'),
        type = 'danger',
    } = options;
    const hasCancel = cancelText !== '';

    return (
        <>
            {children}
            {task && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => done(false)} />
                    <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                        {title && <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>}
                        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
                        <div className="flex justify-end gap-3 mt-6">
                            {hasCancel && (
                                <button className="btn-secondary" onClick={() => done(false)}>
                                    {cancelText}
                                </button>
                            )}
                            <button
                                className={'text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors ' + (type === 'danger' ? 'bg-red-600 hover:bg-red-700' : type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-primary-600 hover:bg-primary-700')}
                                onClick={() => done(true)}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
