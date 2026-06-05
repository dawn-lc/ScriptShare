import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, changePassword } from '../api';
import { changeLanguage, LANGUAGES } from '../locales/i18n';
import { getThemeMode, setThemeMode, type ThemeMode } from '../utils/theme';
import { Save, Lock, User, Globe, Sun, Moon, Monitor, CheckCircle, AlertCircle, LogOut } from 'lucide-react';

export default function Settings() {
    const { t, i18n } = useTranslation();
    const { isAuthenticated, user, logout } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: '/settings' }} replace />;
    }

    // Profile form
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Password form
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Theme
    const [themeMode, setThemeState] = useState<ThemeMode>(getThemeMode());
    function handleThemeChange(mode: ThemeMode) {
        setThemeMode(mode);
        setThemeState(mode);
    }

    async function handleProfileSubmit(e: React.FormEvent) {
        e.preventDefault();
        setProfileMsg(null);

        if (!displayName.trim()) {
            setProfileMsg({ type: 'error', text: t('settings.profile.nameRequired') });
            return;
        }

        setProfileSaving(true);
        try {
            const result = await updateProfile({ displayName: displayName.trim() });
            setProfileMsg({ type: 'success', text: t('settings.profile.saved') });
        } catch (err: any) {
            setProfileMsg({ type: 'error', text: err.message || t('common.error') });
        } finally {
            setProfileSaving(false);
        }
    }

    async function handlePasswordSubmit(e: React.FormEvent) {
        e.preventDefault();
        setPasswordMsg(null);

        if (!currentPassword) {
            setPasswordMsg({ type: 'error', text: t('settings.password.currentRequired') });
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMsg({ type: 'error', text: t('settings.password.lengthError') });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMsg({ type: 'error', text: t('settings.password.mismatch') });
            return;
        }

        setPasswordSaving(true);
        try {
            await changePassword({ currentPassword, newPassword });
            setPasswordMsg({ type: 'success', text: t('settings.password.saved') });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            // Force logout after short delay so user sees success message
            setTimeout(() => logout(), 1500);
        } catch (err: any) {
            setPasswordMsg({ type: 'error', text: err.message || t('common.error') });
        } finally {
            setPasswordSaving(false);
        }
    }

    return (
        <div className="space-y-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><User className="w-6 h-6 inline-block mr-2" />{t('settings.title')}</h1>

            {/* Account info */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('settings.account.title')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-gray-400 dark:text-gray-500">{t('login.username')}</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{user?.username}</p>
                    </div>
                    <div>
                        <span className="text-gray-400 dark:text-gray-500">{t('admin.users.role')}</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{user?.role === 'admin' ? t('admin.users.admin') : t('admin.users.user')}</p>
                    </div>
                </div>
            </div>

            {/* Display name */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><User className="w-5 h-5 inline-block mr-1" />{t('settings.profile.title')}</h3>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
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

                    {profileMsg && (
                        <div className={`px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${profileMsg.type === 'success'
                            ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                            : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                            }`}>
                            {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                            {profileMsg.text}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={profileSaving}>
                        {profileSaving ? t('common.loading') : <><Save className="w-4 h-4 inline-block mr-1" />{t('common.save')}</>}
                    </button>
                </form>
            </div>

            {/* Change password */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Lock className="w-5 h-5 inline-block mr-1" />{t('settings.password.title')}</h3>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('settings.password.current')}</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="input-field"
                            placeholder={t('settings.password.currentPlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('settings.password.new')}</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="input-field"
                            placeholder={t('settings.password.newPlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('settings.password.confirm')}</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="input-field"
                            placeholder={t('settings.password.confirmPlaceholder')}
                        />
                    </div>

                    {passwordMsg && (
                        <div className={`px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${passwordMsg.type === 'success'
                            ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                            : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                            }`}>
                            {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                            {passwordMsg.text}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={passwordSaving}>
                        {passwordSaving ? t('common.loading') : <><Lock className="w-4 h-4 inline-block mr-1" />{t('settings.password.submit')}</>}
                    </button>
                </form>
            </div>

            {/* Language selector */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Globe className="w-5 h-5 inline-block mr-1" />{t('settings.language.title')}</h3>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('settings.language.label')}</label>
                    <select
                        className="input-field sm:w-64"
                        value={i18n.language}
                        onChange={(e) => changeLanguage(e.target.value)}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Theme selector */}
            <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4"><Sun className="w-5 h-5 inline-block mr-1" />{t('settings.theme.title')}</h3>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">{t('settings.theme.label')}</label>
                    <div className="flex flex-wrap gap-3">
                        {([
                            { mode: 'light' as ThemeMode, icon: Sun, label: t('settings.theme.light') },
                            { mode: 'dark' as ThemeMode, icon: Moon, label: t('settings.theme.dark') },
                            { mode: 'system' as ThemeMode, icon: Monitor, label: t('settings.theme.system') },
                        ]).map(({ mode, icon: Icon, label }) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => handleThemeChange(mode)}
                                className={`
                                    flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors
                                    ${themeMode === mode
                                        ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }
                                `}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
