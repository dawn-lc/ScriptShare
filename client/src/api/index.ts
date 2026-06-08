const API_BASE = '/api';

export interface Script {
    id: number;
    name: string;
    namespace: string;
    version: string;
    canaryVersion?: string;
    description: string;
    author: string;
    icon: string;
    icon64: string;
    grant: string[];
    match: string[];
    exclude: string[];
    require: string[];
    resource: string[];
    connect: string[];
    code?: string;
    filename: string;
    userId?: number | null;
    readme?: string;
    supportURL?: string;
    installs: number;
    updateChecks: number;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    i18n?: Record<string, Record<string, string>>;
}

export interface ScriptListItem {
    id: number;
    name: string;
    namespace: string;
    version: string;
    description: string;
    author: string;
    icon: string;
    installs: number;
    updateChecks: number;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    i18n?: Record<string, Record<string, string>>;
    rating?: number;
    ratingCount?: number;
}

export interface RatingData {
    average: number;
    count: number;
    userRating: number | null;
}

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export interface ScriptListResponse {
    scripts: ScriptListItem[];
    pagination: Pagination;
}

export interface OverviewStats {
    totalScripts: number;
    totalInstalls: number;
    totalUpdateChecks: number;
    totalUpdateLogs: number;
    todayInstalls: number;
    todayUpdates: number;
    topInstalled: { id: number; name: string; installs: number; updateChecks: number }[];
    topChecked: { id: number; name: string; installs: number; updateChecks: number }[];
}

export interface ScriptStats {
    script: { id: number; name: string; version: string };
    totalInstalls: number;
    totalUpdateChecks: number;
    dailyInstalls: { date: string; count: number }[];
    dailyUpdates: { date: string; count: number }[];
    browserStats: { browser: string; count: number }[];
    osStats: { os: string; count: number }[];
    webhookLogs?: { id: number; event: string; action: string; summary?: string; detail?: string; createdAt?: string }[];
    auditLogs?: { id: number; action: string; detail?: string; metadata?: string; createdAt?: string }[];
}

export interface TrendsData {
    period: number;
    installTrend: { date: string; count: number }[];
    updateTrend: { date: string; count: number }[];
    browserDistribution: { browser: string; count: number }[];
    osDistribution: { os: string; count: number }[];
}

/** API 错误响应，可能包含详细的字段级错误信息 */
export class ApiError extends Error {
    details?: string[];
    constructor(message: string, details?: string[]) {
        super(message);
        this.name = 'ApiError';
        this.details = details;
    }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'request_failed' }));
        throw new ApiError(body.error || `HTTP ${res.status}`, body.details);
    }

    return res.json();
}

// ── 脚本 API ──
export function getScripts(params?: { page?: number; limit?: number; search?: string; sort?: string; order?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.order) searchParams.set('order', params.order);
    const qs = searchParams.toString();
    return request<ScriptListResponse>(`/scripts${qs ? `?${qs}` : ''}`);
}

export function getScript(id: number) {
    return request<{ script: Script }>(`/scripts/${id}`);
}

export function getScriptCode(id: number, channel?: string) {
    const prefix = channel && channel !== 'stable' ? '/canary' : '/stable';
    return `${API_BASE}/scripts/${id}${prefix}/code`;
}

// ── 用户 / 认证类型 ──

export interface UserInfo {
    id: number;
    username: string;
    displayName: string;
    role: string;
    avatarUrl?: string;
    scriptCount?: number;
    createdAt?: string;
}

export interface AuthStatus {
    authenticated: boolean;
    user: UserInfo | null;
}

// ── 认证 API ──


export async function register(data: {
    username: string; password: string; displayName?: string;
    captchaToken?: string;
}): Promise<{ message: string; user: UserInfo }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'register_failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export async function login(data: { username: string; password: string }): Promise<{ message: string; user: UserInfo }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'login_failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export async function logout(): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    return res.json();
}

export async function checkAuthStatus(): Promise<AuthStatus> {
    const res = await fetch(`${API_BASE}/auth/status`);
    return res.json();
}

export async function getMyProfile(): Promise<{ user: UserInfo }> {
    return request('/auth/me');
}


export function getInstallUrl(id: number, channel?: string) {
    const prefix = channel && channel !== 'stable' ? '/canary' : '/stable';
    return `${API_BASE}/scripts/${id}${prefix}/script.user.js`;
}

export function getUpdateUrl(id: number, channel?: string) {
    const prefix = channel && channel !== 'stable' ? '/canary' : '/stable';
    return `${API_BASE}/scripts/${id}${prefix}/update`;
}



// ── 评分 ──

export function getScriptRatings(id: number): Promise<RatingData> {
    return request(`/scripts/${id}/ratings`);
}

export function rateScript(id: number, score: number): Promise<{ message: string; average: number; count: number; userRating: number }> {
    return request(`/scripts/${id}/rate`, {
        method: 'POST',
        body: JSON.stringify({ score }),
    });
}

export function checkUpdate(id: number, version: string) {
    return request<{
        hasUpdate: boolean;
        latestVersion: string;
        currentVersion: string;
        scriptUrl: string;
        updateUrl: string;
        downloadUrl: string;
        scriptContentUrl: string;
    }>(`/scripts/${id}/check-update?version=${encodeURIComponent(version)}`);
}

export interface MetadataWarning {
    field: string;
    type: 'missing' | 'security' | 'consistency' | 'best-practice';
    message: string;
}

export function createScript(code: string, filename?: string, readme?: string) {
    return request<{ message: string; script: Script; warnings?: MetadataWarning[] }>('/scripts', {
        method: 'POST',
        body: JSON.stringify({ code, filename, readme }),
    });
}

export function updateScript(id: number, code: string, readme?: string) {
    return request<{ message: string; script: Script; warnings?: MetadataWarning[] }>(`/scripts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ code, readme }),
    });
}

export function deleteScript(id: number) {
    return request<{ message: string }>(`/scripts/${id}`, { method: 'DELETE' });
}

export function hardDeleteScript(id: number) {
    return request<{ message: string }>(`/scripts/${id}/hard`, { method: 'DELETE' });
}

export interface WebhookInfo {
    scriptId: number;
    scriptName: string;
    webhookSecret: string;
    webhookUrl: string;
    githubRepo: string;
    githubPath: string;
    canaryVersion: string;
}

export function getWebhookInfo(id: number) {
    return request<WebhookInfo>(`/scripts/${id}/webhook-info`);
}

export function generateWebhookSecret(id: number) {
    return request<{ message: string; webhookSecret: string; webhookUrl: string }>(`/scripts/${id}/webhook-secret`, {
        method: 'POST',
    });
}

export function updateGithubConfig(id: number, config: { githubRepo?: string; githubPath?: string }) {
    return request<{ message: string }>(`/scripts/${id}/github-config`, {
        method: 'PUT',
        body: JSON.stringify(config),
    });
}

// ── 统计 API ──
export function getOverviewStats() {
    return request<OverviewStats>('/stats/overview');
}

export function getScriptStats(id: number) {
    return request<ScriptStats>(`/stats/scripts/${id}`);
}

export function getTrends(days: number = 30) {
    return request<TrendsData>(`/stats/trends?days=${days}`);
}

// ── 我的统计（脚本所有者） ──

export interface MyStatsResponse {
    totalScripts: number;
    totalInstalls: number;
    totalUpdateChecks: number;
    dailyInstalls: { date: string; count: number }[];
    scripts: { id: number; name: string; version: string; installs: number; updateChecks: number; i18n?: Record<string, Record<string, string>> }[];
    topScripts: { id: number; name: string; version: string; installs: number }[];
}

export function getMyStats() {
    return request<MyStatsResponse>('/stats/my');
}

// ── 管理员 API ──

export interface AdminUserRow {
    id: number;
    username: string;
    displayName: string;
    role: string;
    avatarUrl: string;
    createdAt: string;
    scriptCount: number;
}

export interface AuditLogEntry {
    id: number;
    action: string;
    userId: number | null;
    userName: string | null;
    detail: string;
    metadata: string | null;
    createdAt: string;
}

export interface WebhookLogEntry {
    id: number;
    event: string;
    action: string;
    summary: string;
    detail: string;
    createdAt: string;
    scriptName: string | null;
}

export interface AdminSystemInfo {
    system: { nodeVersion: string; platform: string; uptimeSeconds: number };
    database: {
        sizeBytes: number;
        sizeMb: string;
        scripts: number;
        users: number;
        installs: number;
        updates: number;
        webhookLogs: number;
        auditLogs: number;
    };
    scriptsPerUser: { username: string; displayName: string; scriptCount: number }[];
    recentScripts: { id: number; name: string; version: string; installs: number; createdAt: string; owner: string | null }[];
}

export function getAdminUsers() {
    return request<{ users: AdminUserRow[] }>('/stats/admin/users');
}

export function getAdminWebhookLogs(limit?: number) {
    return request<{ logs: WebhookLogEntry[] }>(`/stats/admin/webhook-logs${limit ? `?limit=${limit}` : ''}`);
}

export function getAdminAuditLogs(limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    return request<{ logs: AuditLogEntry[]; total: number; hasMore: boolean }>(`/stats/admin/audit-logs${qs ? `?${qs}` : ''}`);
}

export function getAdminSystem() {
    return request<AdminSystemInfo>('/stats/admin/system');
}

// ── CAPTCHA API ──

export async function createCapChallenge(): Promise<{ challenge: { count: number; saltLen: number; difficulty: number; argon2: { memorySize: number; iterations: number; parallelism: number } }; token: string; expires: number }> {
    const res = await fetch(`${API_BASE}/captcha/challenge`, { method: 'POST' });
    return res.json();
}

export async function redeemCapChallenge(token: string, solutions: string[]): Promise<{ success: boolean; token?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/captcha/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, solutions }),
    });
    return res.json();
}

// ── 用户设置 API ──

export async function updateProfile(data: { displayName?: string }): Promise<{ user: UserInfo }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'update_failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export async function changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'change_password_failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}
