import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { detectEnvironment } from '../utils/environment';
import { solveCapChallenge } from '../utils/cap-solver';
import { FileEdit, AlertTriangle, CheckCircle, Search, Clock, RefreshCw, LogIn, ChevronLeft } from 'lucide-react';
const API_BASE = '/api';

/** Internal: check if any user exists (only false when DB is empty). */
async function checkIsFirstUser(): Promise<boolean> {
    const res = await fetch(`${API_BASE}/auth/status`);
    const data = await res.json();
    // Server only includes hasUsers: false when no users exist
    return data.hasUsers === false;
}

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

    // First-user setup warning
    const [isFirstUser, setIsFirstUser] = useState(false);
    const [setupChecked, setSetupChecked] = useState(false);

    // Captcha state
    const [capSolving, setCapSolving] = useState(false);
    const [capDone, setCapDone] = useState(false);
    const [capDetecting, setCapDetecting] = useState(false);
    const [capProgress, setCapProgress] = useState(0);
    const [capToken, setCapToken] = useState('');
    const [capElapsed, setCapElapsed] = useState(0);
    const envResultRef = useRef<{ score: number; label: string; isBot: boolean; visitorId?: string; fpConfidence?: number } | null>(null);
    const startTimeRef = useRef(0);
    const elapsedTimerRef = useRef<number | null>(null);
    const initRef = useRef(false);

    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        checkIsFirstUser().then((firstUser) => {
            setIsFirstUser(firstUser);
            setSetupChecked(true);
            if (firstUser) {
                // 首次注册：无需 PoW 验证码（服务端跳过验证）
                setCapDone(true);
                setCapSolving(false);
            } else {
                solveCaptcha();
            }
        }).catch(() => {
            setSetupChecked(true);
            solveCaptcha();
        });
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
            // Run environment detection
            setCapDetecting(true);
            const env = await detectEnvironment();
            envResultRef.current = env;
            setCapDetecting(false);

            // Start elapsed timer
            startTimeRef.current = Date.now();
            elapsedTimerRef.current = window.setInterval(() => {
                setCapElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);

            // Solve Cap challenge using our direct solver
            const token = await solveCapChallenge(env.score, (pct) => {
                setCapProgress(pct);
            }, env.visitorId, env.fpConfidence);

            setCapToken(token);
            setCapProgress(100);
            setCapDone(true);
            setCapSolving(false);

            if (elapsedTimerRef.current !== null) {
                clearInterval(elapsedTimerRef.current);
                elapsedTimerRef.current = null;
            }
        } catch (err: any) {
            console.error('[cap] Solving failed:', err);
            setServerMsg({ type: 'error', text: t('register.cap.failed', { msg: err.message || t('common.error') }) });
            setCapSolving(false);
            setCapDetecting(false);
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
        if (!isFirstUser && (!capDone || !capToken)) { setServerMsg({ type: 'error', text: t('register.error.waitCaptcha') }); return; }

        setLoading(true);
        try {
            const result = await register(username.trim(), password, displayName.trim() || undefined, isFirstUser ? undefined : capToken, undefined, envResultRef.current ?? undefined);
            navigate('/', { replace: true });
        } catch (err: any) {
            if (err.message === '验证码错误' || err.message === '请完成验证码') solveCaptcha();
            setServerMsg({ type: 'error', text: t('register.error.failed', { msg: err.message }) });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="card w-full max-w-md">
                <div className="text-center mb-6">
                    <FileEdit className="w-10 h-10 inline-block text-primary-600 dark:text-primary-400" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{t('register.title')}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('register.desc')}</p>
                </div>

                {/* First-user security warning */}
                {isFirstUser && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-8 h-8 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="text-sm text-amber-800">
                                <p className="font-bold mb-1">{t('register.firstUserWarning.title')}</p>
                                <p>{t('register.firstUserWarning.desc1')}</p>
                                <p className="mt-1">{t('register.firstUserWarning.desc2')}</p>
                            </div>
                        </div>
                    </div>
                )}

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

                    {/* Cap CAPTCHA — skipped for first user */}
                    {!isFirstUser && (
                        <div className={`rounded-lg p-4 border ${capDone ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    {capDone ? <><CheckCircle className="w-4 h-4 inline-block mr-1" />{t('register.cap.verified')}</> : capDetecting ? <><Search className="w-4 h-4 inline-block mr-1" />{t('register.cap.detecting')}</> : <><Clock className="w-4 h-4 inline-block mr-1" />{t('register.cap.calculating')}</>}
                                </label>
                                {!capSolving && !capDetecting && !capDone && (
                                    <button type="button" className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300" onClick={solveCaptcha}>
                                        <RefreshCw className="w-3 h-3 inline-block mr-1" />{t('register.cap.retry')}
                                    </button>
                                )}
                            </div>
                            {capDetecting && (
                                <div className="space-y-2">
                                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary-300 rounded-full animate-pulse" style={{ width: '100%' }} />
                                    </div>
                                    <p className="text-xs text-gray-400"><Search className="w-3 h-3 inline-block mr-1" />{t('register.cap.detectingEnv')}</p>
                                </div>
                            )}
                            {capSolving && !capDetecting && (
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
                                <p className="text-xs text-green-600 dark:text-green-400"><CheckCircle className="w-3 h-3 inline-block mr-1" />{t('register.cap.passed')}</p>
                            )}
                            {!capSolving && !capDetecting && !capDone && (
                                <p className="text-xs text-gray-400">{t('register.cap.retryHint')}</p>
                            )}
                        </div>
                    )}

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
                            <><LogIn className="w-5 h-5 inline-block mr-2" />{t('register.submit')}</>
                        )}
                    </button>
                </form>

                <div className="mt-4 text-center space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('register.hasAccount')}<Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium">{t('register.login')}</Link>
                    </p>
                    <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-300 block"><ChevronLeft className="w-4 h-4 inline-block" /> {t('register.backHome')}</Link>
                </div>
            </div>
        </div>
    );
}
