import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { checkAuthStatus, login as apiLogin, register as apiRegister, logout as apiLogout, type UserInfo } from '../api';

interface AuthContextType {
    isAuthenticated: boolean;
    user: UserInfo | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string, displayName?: string, captchaToken?: string, captchaAnswer?: string, env?: { score: number; label: string; isBot: boolean; visitorId?: string; fpConfidence?: number }) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    isAuthenticated: false,
    user: null,
    loading: true,
    login: async () => { },
    register: async () => { },
    logout: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!user;

    // Check auth status on mount
    useEffect(() => {
        async function check() {
            try {
                const status = await checkAuthStatus();
                setUser(status.user);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        }
        check();
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const result = await apiLogin({ username, password });
        setUser(result.user);
    }, []);

    const register = useCallback(async (username: string, password: string, displayName?: string, captchaToken?: string, captchaAnswer?: string, env?: { score: number; label: string; isBot: boolean; visitorId?: string; fpConfidence?: number }) => {
        const result = await apiRegister({ username, password, displayName, captchaToken, captchaAnswer, envScore: env?.score, envLabel: env?.label, isBot: env?.isBot, visitorId: env?.visitorId, fpConfidence: env?.fpConfidence });
        setUser(result.user);
    }, []);

    const logout = useCallback(async () => {
        await apiLogout();
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

