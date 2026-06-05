import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, ChevronLeft, Lock } from 'lucide-react';

export default function Login() {
    const { t } = useTranslation();
    const { isAuthenticated, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [serverMsg, setServerMsg] = useState<{ type: 'error' | 'success' | 'warning'; text: string } | null>(null);
    const [loading, setLoading] = useState(false);

    const from = (location.state as any)?.from || '/';

    if (isAuthenticated) {
        navigate(from, { replace: true });
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerMsg(null);

        if (!username || !password) {
            setServerMsg({ type: 'error', text: t('login.error.required') });
            return;
        }

        setLoading(true);
        try {
            await login(username, password);
            navigate(from, { replace: true });
        } catch (err: any) {
            const code = err.code || '';
            let type: 'error' | 'warning' = 'error';
            let text = err.message || t('login.error.failed');
            if (code === 'LOGIN_LOCKED') {
                type = 'warning';
            }
            setServerMsg({ type, text });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="card w-full max-w-md">
                <div className="text-center mb-6">
                    <Lock className="w-10 h-10 inline-block text-primary-600 dark:text-primary-400" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{t('login.title')}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('login.desc')}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('login.username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="input-field"
                            placeholder={t('login.usernamePlaceholder')}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('login.password')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder={t('login.passwordPlaceholder')}
                        />
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

                    <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                        {loading ? (
                            <>
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                {t('login.submitting')}
                            </>
                        ) : (
                            <><LogIn className="w-5 h-5 inline-block mr-2" />{t('login.submit')}</>
                        )}
                    </button>
                </form>

                <div className="mt-4 text-center space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('login.noAccount')}<Link to="/register" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium">{t('login.register')}</Link>
                    </p>
                    <Link to="/" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 block">
                        <ChevronLeft className="w-4 h-4 inline-block" /> {t('login.backHome')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
