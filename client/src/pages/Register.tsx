import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { solveCapChallenge } from '../utils/cap-solver';
import { PencilSquareIcon, CheckCircleIcon, ClockIcon, ArrowPathIcon, ArrowRightStartOnRectangleIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';

export default function Register() {
    const { t } = useTranslation();
    const { register, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [serverMsg, setServerMsg] = useState<{ type: 'error' | 'success' | 'warning'; text: string } | null>(null);
    const [loading, setLoading] = useState(false);

    // 验证码状态
    const [capSolving, setCapSolving] = useState(false);
    const [capDone, setCapDone] = useState(false);
    const [capProgress, setCapProgress] = useState(0);
    const [capToken, setCapToken] = useState('');
    const [capElapsed, setCapElapsed] = useState(0);
    const startTimeRef = useRef(0);
    const elapsedTimerRef = useRef<number | null>(null);

    useEffect(() => {
        solveCaptcha();
        return () => {
            if (elapsedTimerRef.current !== null) {
                clearInterval(elapsedTimerRef.current);
            }
        };
    }, []);

    async function solveCaptcha() {
        setCapSolving(true);
        setCapDone(false);
        setCapToken('');
        setCapProgress(0);
        setCapElapsed(0);

        try {
            // 启动计时器
            startTimeRef.current = Date.now();
            elapsedTimerRef.current = window.setInterval(() => {
                setCapElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);

            // 使用直接求解器处理 Cap 挑战
            const token = await solveCapChallenge((pct) => {
                setCapProgress(pct);
            });

            setCapToken(token);
            setCapProgress(100);
            setCapDone(true);
            setCapSolving(false);

            if (elapsedTimerRef.current !== null) {
                clearInterval(elapsedTimerRef.current);
                elapsedTimerRef.current = null;
            }
        } catch (err: unknown) {
            console.error('[cap] Solving failed:', err);
            const msg = err instanceof Error ? err.message : String(err);
            setServerMsg({ type: 'error', text: t('register.cap.failed', { msg: msg || t('common.error') }) });
            setCapSolving(false);
            if (elapsedTimerRef.current !== null) {
                clearInterval(elapsedTimerRef.current);
                elapsedTimerRef.current = null;
            }
        }
    }

    if (isAuthenticated) {
        navigate('/', { replace: true });
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerMsg(null);

        if (!username.trim()) { setServerMsg({ type: 'error', text: t('register.error.username') }); return; }
        if (password.length < 6) { setServerMsg({ type: 'error', text: t('register.error.passwordLength') }); return; }
        if (password !== confirm) { setServerMsg({ type: 'error', text: t('register.error.passwordMismatch') }); return; }
        if (!capDone || !capToken) { setServerMsg({ type: 'error', text: t('register.error.waitCaptcha') }); return; }

        setLoading(true);
        try {
            const result = await register(username.trim(), password, displayName.trim() || undefined, capToken);
            navigate('/', { replace: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === '验证码错误' || msg === '请完成验证码') solveCaptcha();
            setServerMsg({ type: 'error', text: t('register.error.failed', { msg }) });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="card w-full max-w-md">
                <div className="text-center mb-6">
                    <PencilSquareIcon className="w-10 h-10 inline-block text-primary-600 dark:text-primary-400" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{t('register.title')}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('register.desc')}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('register.username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="input-field"
                            placeholder={t('register.usernamePlaceholder')}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('register.displayName')}</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="input-field"
                            placeholder={t('register.displayNamePlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('register.password')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder={t('register.passwordPlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('register.confirmPassword')}</label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="input-field"
                            placeholder={t('register.confirmPlaceholder')}
                        />
                    </div>

                    {/* Cap CAPTCHA */}
                    <div className={`rounded-lg p-4 border ${capDone ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                {capDone ? <span className="inline-flex items-center gap-1"><CheckCircleIcon className="w-4 h-4" />{t('register.cap.verified')}</span> : <span className="inline-flex items-center gap-1"><ClockIcon className="w-4 h-4" />{t('register.cap.calculating')}</span>}
                            </label>
                            {!capSolving && !capDone && (
                                <button type="button" className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300" onClick={solveCaptcha}>
                                    <ArrowPathIcon className="w-3 h-3" />{t('register.cap.retry')}
                                </button>
                            )}
                        </div>
                        {capSolving && (
                            <div className="space-y-2">
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary-500 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${capProgress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400">
                                    {capElapsed > 0
                                        ? t('register.cap.progress', { seconds: capElapsed, percent: capProgress })
                                        : t('register.cap.progressSimple', { percent: capProgress })}
                                </p>
                            </div>
                        )}
                        {capDone && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircleIcon className="w-3 h-3" />{t('register.cap.passed')}</p>
                        )}
                        {!capSolving && !capDone && (
                            <p className="text-xs text-gray-400">{t('register.cap.retryHint')}</p>
                        )}
                    </div>

                    {/* Server response message */}
                    {serverMsg && (
                        <div className={`px-4 py-3 rounded-lg text-sm border ${{
                            error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
                            success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400',
                            warning: 'bg-amber-50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
                        }[serverMsg.type]}`}
                        >
                            {serverMsg.text}
                        </div>
                    )}

                    <button type="submit" className="btn-primary w-full justify-center" disabled={loading || !capDone}>
                        {loading ? (
                            <>
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                {t('register.submitting')}
                            </>
                        ) : (
                            <><ArrowRightStartOnRectangleIcon className="w-5 h-5 mr-2" />{t('register.submit')}</>
                        )}
                    </button>
                </form>

                <div className="mt-4 text-center space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('register.hasAccount')}<Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium">{t('register.login')}</Link>
                    </p>
                    <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-300 flex items-center gap-1"><ChevronLeftIcon className="w-4 h-4" /> {t('register.backHome')}</Link>
                </div>
            </div>
        </div>
    );
}
