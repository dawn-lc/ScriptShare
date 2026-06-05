import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { getAdminUsers, getAdminWebhookLogs, getAdminAuditLogs, getAdminSystem, type AdminUserRow, type WebhookLogEntry, type AuditLogEntry, type AdminSystemInfo } from '../api';
import { Bot, Monitor, BarChart3, Users, Link2, ClipboardList, Settings, Database, Package, Sparkles, Download, Trash2 } from 'lucide-react';

function renderEnvInfo(envInfo?: string): React.ReactNode {
    if (!envInfo) return <span className="text-xs text-gray-400">—</span>;
    try {
        const info = JSON.parse(envInfo);
        const { score, label, isBot } = info;
        const isSuspicious = isBot || (typeof score === 'number' && score >= 3);
        return (
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${isSuspicious ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                {isSuspicious ? <Bot className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />} {label || (score != null ? `score ${score}` : '—')}
            </span>
        );
    } catch {
        return <span className="text-xs text-gray-400">—</span>;
    }
}

export default function Admin() {
    const { t } = useTranslation();
    const { user } = useAuth();

    if (user?.role !== 'admin') {
        return <Navigate to="/scripts" replace />;
    }

    const [users, setUsers] = useState<AdminUserRow[]>([]);
    const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [sys, setSys] = useState<AdminSystemInfo | null>(null);
    const [tab, setTab] = useState<'overview' | 'users' | 'webhook' | 'audit'>('overview');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const [sysData, usersData, logsData, auditData] = await Promise.all([
                    getAdminSystem(),
                    getAdminUsers(),
                    getAdminWebhookLogs(30),
                    getAdminAuditLogs(50),
                ]);
                setSys(sysData);
                setUsers(usersData.users);
                setLogs(logsData.logs);
                setAuditLogs(auditData.logs);
            } catch (err) {
                console.error(t('common.error'), err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    const tabs = [
        { key: 'overview' as const, label: <><BarChart3 className="w-4 h-4 inline-block mr-1" />{t('admin.tabs.overview')}</> },
        { key: 'users' as const, label: <><Users className="w-4 h-4 inline-block mr-1" />{t('admin.tabs.users')}</> },
        { key: 'webhook' as const, label: <><Link2 className="w-4 h-4 inline-block mr-1" />{t('admin.tabs.webhook')}</> },
        { key: 'audit' as const, label: <><ClipboardList className="w-4 h-4 inline-block mr-1" />{t('admin.tabs.audit')}</> },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><Settings className="w-6 h-6 inline-block mr-2" />{t('admin.title')}</h1>
                <span className="text-sm text-gray-400">{t('admin.adminLabel', { name: user?.displayName || user?.username })}</span>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key
                            ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Overview tab */}
            {tab === 'overview' && sys && (
                <div className="space-y-6">
                    {/* System info */}
                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><Monitor className="w-5 h-5 inline-block mr-1" />{t('admin.overview.system')}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span className="text-gray-400">Node.js</span>
                                <p className="font-medium">{sys.system.nodeVersion}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">{t('admin.overview.platform')}</span>
                                <p className="font-medium">{sys.system.platform}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">{t('admin.overview.uptime')}</span>
                                <p className="font-medium">{Math.floor(sys.system.uptimeSeconds / 60 / 60)}h</p>
                            </div>
                            <div>
                                <span className="text-gray-400">{t('admin.overview.database')}</span>
                                <p className="font-medium">{sys.database.sizeMb} MB</p>
                            </div>
                        </div>
                    </div>

                    {/* Database counts */}
                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><Database className="w-5 h-5 inline-block mr-1" />{t('admin.overview.dataOverview')}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: t('admin.overview.totalScripts'), value: sys.database.scripts, color: 'text-primary-600 dark:text-primary-400' },
                                { label: t('admin.overview.totalUsers'), value: sys.database.users, color: 'text-green-600 dark:text-green-400' },
                                { label: t('admin.overview.installRecords'), value: sys.database.installs, color: 'text-blue-600' },
                                { label: t('admin.overview.updateRecords'), value: sys.database.updates, color: 'text-amber-600 dark:text-amber-400' },
                                { label: t('admin.overview.webhookRecords'), value: sys.database.webhookLogs, color: 'text-purple-600' },
                            ].map((item) => (
                                <div key={item.label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                    <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Per-user scripts */}
                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><Package className="w-5 h-5 inline-block mr-1" />{t('admin.overview.scriptDist')}</h3>
                        <div className="space-y-2">
                            {sys.scriptsPerUser.map((u) => (
                                <div key={u.username} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800">
                                    <span className="text-sm text-gray-900 dark:text-gray-100">{u.displayName || u.username}</span>
                                    <span className="text-sm font-medium text-primary-600 dark:text-primary-400">{u.scriptCount} {t('admin.overview.scripts')}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent scripts */}
                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><Sparkles className="w-5 h-5 inline-block mr-1" />{t('admin.overview.recentScripts')}</h3>
                        <div className="space-y-2">
                            {sys.recentScripts.map((s) => (
                                <Link
                                    key={s.id}
                                    to={`/scripts/${s.id}`}
                                    className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                                        <span className="text-xs font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full font-semibold">v{s.version}</span>
                                        {s.owner && <span className="text-xs text-gray-400">by {s.owner}</span>}
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        <Download className="w-3 h-3 inline-block mr-0.5" />{s.installs} · {new Date(s.createdAt).toLocaleDateString('zh-CN')}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Users tab */}
            {tab === 'users' && (
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><Users className="w-5 h-5 inline-block mr-1" />{t('admin.users.title', { count: users.length })}</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                                    <th className="pb-2 pr-4 font-medium">{t('admin.users.username')}</th>
                                    <th className="pb-2 pr-4 font-medium">{t('admin.users.displayName')}</th>
                                    <th className="pb-2 pr-4 font-medium">{t('admin.users.role')}</th>
                                    <th className="pb-2 pr-4 font-medium">{t('admin.users.scriptCount')}</th>
                                    <th className="pb-2 pr-4 font-medium">{t('admin.users.envInfo')}</th>
                                    <th className="pb-2 font-medium">{t('admin.users.regTime')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800">
                                        <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-gray-100">{u.username}</td>
                                        <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300">{u.displayName || '—'}</td>
                                        <td className="py-2.5 pr-4">
                                            {u.role === 'admin' ? (
                                                <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">{t('admin.users.admin')}</span>
                                            ) : (
                                                <span className="text-xs bg-gray-100 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">{t('admin.users.user')}</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-4">{u.scriptCount}</td>
                                        <td className="py-2.5 pr-4">
                                            {renderEnvInfo(u.envInfo)}
                                        </td>
                                        <td className="py-2.5 text-gray-500 dark:text-gray-400">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Webhook logs tab */}
            {tab === 'webhook' && (
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><Link2 className="w-5 h-5 inline-block mr-1" />{t('admin.webhook.title')}</h3>
                    {logs.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">{t('admin.webhook.empty')}</p>
                    ) : (
                        <div className="space-y-2">
                            {logs.map((log) => (
                                <div key={log.id} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800 text-sm">
                                    <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${log.event === 'release' ? 'bg-green-100 text-green-700 dark:text-green-400' :
                                        log.event === 'ping' ? 'bg-blue-100 text-blue-700' :
                                            log.event === 'ignored' ? 'bg-gray-100 text-gray-500 dark:text-gray-400' :
                                                log.action?.includes('fail') || log.action?.includes('error') ? 'bg-red-100 text-red-700 dark:text-red-400' :
                                                    'bg-gray-100 text-gray-600 dark:text-gray-300'
                                        }`}>
                                        {log.event}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-gray-900 dark:text-gray-100 truncate">{log.summary}</div>
                                        <div className="text-xs text-gray-400 truncate mt-0.5">
                                            {log.detail && <span>{log.detail} · </span>}
                                            {log.scriptName && <span>{t('admin.webhook.script', { name: log.scriptName })} · </span>}
                                            {new Date(log.createdAt).toLocaleString('zh-CN')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Audit logs tab */}
            {tab === 'audit' && (
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3"><ClipboardList className="w-5 h-5 inline-block mr-1" />{t('admin.audit.title', { count: auditLogs.length })}</h3>
                    {auditLogs.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">{t('admin.audit.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                                        <th className="pb-2 pr-4 font-medium">{t('admin.audit.time')}</th>
                                        <th className="pb-2 pr-4 font-medium">{t('admin.audit.user')}</th>
                                        <th className="pb-2 pr-4 font-medium">{t('admin.audit.action')}</th>
                                        <th className="pb-2 font-medium">{t('admin.audit.detail')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map((entry) => {
                                        const actionColor =
                                            entry.action.startsWith('user.') ? 'bg-blue-100 text-blue-700' :
                                                entry.action.startsWith('script.') ? 'bg-green-100 text-green-700 dark:text-green-400' :
                                                    entry.action.startsWith('admin.') ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' :
                                                        entry.action.startsWith('webhook.') ? 'bg-purple-100 text-purple-700' :
                                                            'bg-gray-100 text-gray-600 dark:text-gray-300';
                                        return (
                                            <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800">
                                                <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                                                    {new Date(entry.createdAt).toLocaleString('zh-CN')}
                                                </td>
                                                <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">
                                                    {entry.userName || <span className="text-gray-400">—</span>}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${actionColor}`}>
                                                        {entry.action}
                                                    </span>
                                                </td>
                                                <td className="py-2 text-gray-600 dark:text-gray-300 text-xs max-w-xs truncate" title={entry.detail}>
                                                    {entry.detail}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

