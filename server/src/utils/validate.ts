/**
 * 输入验证和清理工具函数
 */
import crypto from 'crypto';
import { MAX_CODE_SIZE, README_MAX_LENGTH } from '../config';
import { remove as removeConfusables } from 'confusables';
import emojiRegex from 'emoji-regex-xs';
import { valid as semverValid } from 'semver';
import sanitizeFilename from 'sanitize-filename';
import { db } from '../db';
import { scripts } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { Script } from '../models/script';


// 脚本字段的最大长度（字符数）
export const FIELD_LIMITS = {
    name: 200,
    namespace: 500,
    version: 50,
    description: 2000,
    author: 200,
    filename: 255,
    code: 5 * 1024 * 1024, // 脚本最大 5MB
    metadata_line: 5000,    // 单个元数据值
} as const;

/**
 * 清理字符串：去除空字节和控制字符（保留换行符）
 */
export function sanitize(input: string): string {
    return input.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * 截断字符串至最大长度
 */
export function truncate(input: string, maxLen: number): string {
    return input.length > maxLen ? input.slice(0, maxLen) : input;
}

/**
 * 验证版本号格式（使用 semver 语义化版本规范）
 */
export function isValidVersion(version: string): boolean {
    return version.length <= FIELD_LIMITS.version && semverValid(version) !== null;
}

/**
 * 验证并清理元数据字段
 */
export function sanitizeField(input: string, maxLen: number): string {
    return truncate(sanitize(input), maxLen);
}

/**
 * 验证脚本代码大小（取 FIELD_LIMITS.code 与 MAX_CODE_SIZE 中的较小值）
 */
export function isValidCodeSize(code: string): boolean {
    const limit = Math.min(FIELD_LIMITS.code, MAX_CODE_SIZE);
    return code.length <= limit;
}

/**
 * 拒绝明显恶意的元数据值
 * - 防止 description/name 中的 JavaScript URL 注入
 * - 阻止超长值
 */
export function containsMaliciousContent(input: string): boolean {
    const lower = input.toLowerCase();
    // 检查非常规字段中的 javascript:/data: URI 注入
    if (/^\s*(javascript|data|vbscript):/i.test(input)) return true;
    // 检查 HTML 注入（XSS 攻击）
    if (/<script[\s>/]/i.test(lower)) return true;
    if (/onerror\s*=/i.test(lower) && /<[\w]+/i.test(lower)) return true;
    if (/onload\s*=/i.test(lower) && /<[\w]+/i.test(lower)) return true;
    return false;
}

/**
 * 检查字符串是否包含 emoji 字符
 * 使用 emoji-regex-xs（轻量、精准的 emoji 正则）
 */
export function containsEmoji(input: string): boolean {
    return emojiRegex().test(input);
}

/**
 * 生成密码学安全的随机十六进制令牌（用于 Webhook Secret 等场景）
 * @param bytes 字节数（默认 24，生成 48 字符十六进制字符串）
 */
export function generateSecret(bytes: number = 24): string {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * 用户名黑名单（分类管理，不区分大小写）
 * 最终均展开为扁平数组，通过 isUsernameBlacklisted() 检查。
 */
export const USERNAME_BLACKLIST: Record<string, string[]> = {
    // ── 系统保留 ──
    '系统保留': [
        'admin', 'root', 'system', 'guest', 'null', 'undefined',
        'administrator', 'owner', 'anonymous',
    ],
    // ── 内部路由/端点名（防止 URL 歧义） ──
    '内部路由': [
        'scriptshare', 'api', 'debug', 'login', 'register',
        'settings', 'adminpanel', 'dashboard', 'profile',
        'upload', 'scripts', 'stats', 'webhook', 'auth',
        'captcha', 'logout', 'status',
    ],
    // ── 防注入安全类（SQL / NoSQL / 模板注入风险名） ──
    '防注入安全': [
        // MongoDB 查询器注入
        '$ne', '$gt', '$lt', '$gte', '$lte', '$in', '$nin',
        '$or', '$and', '$not', '$nor', '$exists', '$regex',
        '$where', '$elemMatch', '$size', '$all',
        // SQL 注入关键词
        'select', 'union', 'insert', 'update', 'delete',
        'drop', 'alter', 'truncate', 'exec', 'execute',
        'sleep', 'benchmark', 'pg_sleep',
        // JavaScript 注入 / SSTI
        '__proto__', 'constructor', 'prototype',
        'eval', 'script', 'function', 'require',
    ],

};

/** 展开为扁平数组供 isUsernameBlacklisted 使用 */
const _flatBlacklist = Object.values(USERNAME_BLACKLIST).flat();

/**
 * 将用户名正规化后再检查是否在黑名单中。
 * 步骤：
 *   1. NFKC 正规化（分解变音符号：à → a, é → e, ü → u 等）
 *   2. confusables.remove() 剥离 Unicode 同形字（西里尔 а → 拉丁 a 等）
 *   3. 转小写后精确匹配黑名单
 */
export function isUsernameBlacklisted(username: string): boolean {
    // 先 NFKC 正规化（处理变音符号等）
    const normalized = username.normalize('NFKC');
    // 再剥离 Unicode 同形字（处理 homoglyph 攻击）
    const cleaned = removeConfusables(normalized);
    const lower = cleaned.toLowerCase().trim();
    return _flatBlacklist.some(bad => lower === bad);
}

/**
 * 验证文件名：使用 sanitize-filename 防止路径遍历，
 * 同时确保文件名以 .js 或 .user.js 结尾。
 */
export function isValidFilename(filename: string): boolean {
    // sanitize-filename 会剔除路径分隔符、控制字符、Windows 保留名等
    // 如果净化结果与原值不同，说明包含不安全字符
    if (sanitizeFilename(filename) !== filename) return false;
    // 必须以 .js 或 .user.js 结尾
    return filename.endsWith('.js') || filename.endsWith('.user.js');
}

// ── UserScript 元数据解析 ──

export type MetadataDict = Record<string, string | (string | null)[] | null>;

/**
 * 解析 UserScript 元数据块为键值对字典。
 * 多值键（如 @grant、@match）存储为数组。
 */
export function parseMetadata(content: string): MetadataDict {
    const startTag = '// ==UserScript==';
    const endTag = '// ==/UserScript==';

    const startIndex = content.indexOf(startTag);
    if (startIndex === -1) throw new Error('No metadata block found');

    const bodyStart = startIndex + startTag.length;
    const endIndex = content.indexOf(endTag, bodyStart);
    if (endIndex === -1) throw new Error('Unclosed metadata block');

    const block = content.slice(bodyStart, endIndex);

    const lines = block
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('// @'))
        .map(l => l.replace('// @', '').trim());

    if (lines.length === 0) throw new Error('No metadata entries found');

    const results: MetadataDict = {};

    for (const line of lines) {
        const spaceIdx = line.indexOf(' ');
        const key = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
        const value = spaceIdx === -1 ? null : line.slice(spaceIdx + 1).trim();

        if (!key) continue;

        const prev = results[key];
        if (prev === undefined) {
            results[key] = value;
        } else {
            const arr = Array.isArray(prev) ? prev : [prev];
            if (value !== null) arr.push(value);
            results[key] = arr;
        }
    }

    return results;
}

/**
 * 将元数据值连接为单行换行符分隔的字符串。
 */
function joinMeta(val: string | (string | null)[] | null): string {
    if (val == null) return '';
    if (Array.isArray(val)) return val.filter((x): x is string => x !== null).join('\n');
    return val;
}

/**
 * 将 MetadataDict 转换为 Partial<Script> 用于数据库插入/更新。
 * 多值字段（@grant、@match 等）保持数组格式，写入 PostgreSQL text[] 列。
 */
export function metaToScript(meta: MetadataDict): Partial<Script> {
    const script: Partial<Script> = {};
    const toStr = (key: string): string => joinMeta(meta[key] ?? null);
    const collect = (key: string): string[] => {
        const v = meta[key];
        if (v == null) return [];
        return Array.isArray(v) ? v.filter((x): x is string => x !== null) : [v];
    };

    script.name = toStr('name');
    script.namespace = toStr('namespace');
    script.version = toStr('version') || '1.0.0';
    script.description = toStr('description');
    script.author = toStr('author');
    script.icon = toStr('icon');
    script.icon64 = toStr('icon64');
    script.supportURL = toStr('supportURL') || toStr('homepageURL');

    // 多值字段 → 数组
    script.grant = collect('grant');
    script.match = [...collect('match'), ...collect('include')];
    script.exclude = collect('exclude');
    script.require = collect('require');
    script.resource = collect('resource');
    script.connect = collect('connect');

    // 提取本地化元数据
    const i18n: Record<string, Record<string, string>> = {};
    for (const key of Object.keys(meta)) {
        const localeMatch = key.match(/^(name|description):(.+)$/);
        if (localeMatch) {
            const [, field, locale] = localeMatch;
            const val = toStr(key);
            if (val) {
                if (!i18n[field]) i18n[field] = {};
                i18n[field][locale] = val;
            }
        }
    }
    if (Object.keys(i18n).length > 0) {
        script.i18n = i18n;
    }

    return script;
}

// ── 元数据完整性检测 ──

export interface MetadataWarning {
    field: string;
    type: 'missing' | 'security' | 'consistency' | 'best-practice';
    message: string;
}

interface MetadataCheckResult {
    errors: MetadataWarning[];
    warnings: MetadataWarning[];
}

/**
 * 对已解析的 UserScript 元数据进行完整性、安全性和最佳实践检测。
 */
export function checkMetadata(meta: MetadataDict, code: string): MetadataCheckResult {
    const errors: MetadataWarning[] = [];
    const warnings: MetadataWarning[] = [];
    const addError = (field: string, message: string) =>
        errors.push({ field, type: 'missing', message });
    const addWarning = (field: string, type: MetadataWarning['type'], message: string) =>
        warnings.push({ field, type, message });

    if (!meta.namespace) {
        addError('namespace', '缺少 @namespace，该字段是脚本的唯一标识符，必须提供');
    }
    if (!meta.match && !meta.include) {
        addError('match', '缺少 @match 或 @include，脚本需要指定运行的网址范围，必须提供');
    }
    if (!meta.grant) {
        addError('grant', '缺少 @grant，脚本必须声明所需的 API 权限，无特殊权限请设为 @grant none');
    }
    if (!meta.version) {
        addError('version', '缺少 @version，脚本需要版本号以支持更新管理');
    }

    if (errors.length > 0) return { errors, warnings };

    if (!meta.author) addWarning('author', 'best-practice', '建议添加 @author 以便用户了解脚本作者');
    if (!meta.description) addWarning('description', 'best-practice', '建议添加 @description 简要描述脚本功能');

    // 安全性检测
    const requireVal = meta.require;
    const requireUrls = requireVal
        ? (Array.isArray(requireVal) ? requireVal : [requireVal]).filter((x): x is string => x !== null)
        : [];
    for (const url of requireUrls) {
        if (/^http:\/\//i.test(url)) {
            addWarning('require', 'security', `@require 使用了 HTTP 而不是 HTTPS: ${url}，可能存在中间人攻击风险`);
        }
        if (/^\/\//.test(url)) {
            addWarning('require', 'security', `@require 使用了协议相对 URL: ${url}，建议使用完整 HTTPS 地址`);
        }
    }

    const resourceVal = meta.resource;
    const resourceUrls = resourceVal
        ? (Array.isArray(resourceVal) ? resourceVal : [resourceVal]).filter((x): x is string => x !== null)
        : [];
    for (const entry of resourceUrls) {
        const parts = entry.split(/\s+/);
        const url = parts.length > 1 ? parts[parts.length - 1] : entry;
        if (/^http:\/\//i.test(url)) {
            addWarning('resource', 'security', `@resource 使用了 HTTP: ${url}，建议使用 HTTPS`);
        }
    }

    const grantVal = meta.grant;
    const grantValues = grantVal
        ? (Array.isArray(grantVal) ? grantVal : [grantVal]).filter((x): x is string => x !== null)
        : [];
    const isGrantNone = grantValues.length === 1 && grantValues[0] === 'none';
    if (isGrantNone) {
        const gmUsage = code.match(/GM_\w+|GM\.\w+/g);
        if (gmUsage && gmUsage.length > 0) {
            const unique = [...new Set(gmUsage)];
            addWarning('grant', 'consistency', `声明了 @grant none 但代码中使用了 GM API: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '...' : ''}`);
        }
    }

    const dangerousGrants = ['GM_xmlhttpRequest', 'GM.xmlHttpRequest'];
    const hasXhrGrant = grantValues.some(g => dangerousGrants.includes(g));
    if (hasXhrGrant && !meta.connect) {
        addWarning('grant', 'security', '使用了 GM_xmlhttpRequest 权限但缺少 @connect，跨域请求可能受限');
    }

    return { errors, warnings };
}

// ── 共享的元数据校验 ──

export interface MetaValidationResult {
    ok: boolean;
    meta: Partial<Script>;
    safeFilename: string;
    safeReadme: string;
    rawMeta: MetadataDict;
    metaErrors: MetadataWarning[];
    warnings: MetadataWarning[];
    error?: { status: number; body: Record<string, unknown> };
}

/**
 * 验证脚本代码的元数据，返回校验结果。
 * 不直接发送响应，由调用方决定如何处理错误。
 */
export async function validateScriptMeta(
    code: string,
    filename: string | undefined,
    readme: string | undefined,
    opts: { excludeId?: number } = {},
): Promise<MetaValidationResult> {
    const result: MetaValidationResult = {
        ok: false,
        meta: {},
        safeFilename: '',
        safeReadme: '',
        rawMeta: {},
        metaErrors: [],
        warnings: [],
    };

    if (!isValidCodeSize(code)) {
        result.error = { status: 400, body: { error: `脚本代码超过大小限制 (${FIELD_LIMITS.code / 1024 / 1024}MB)` } };
        return result;
    }

    const meta = metaToScript(parseMetadata(code));

    if (!meta.name) {
        result.error = { status: 400, body: { error: '脚本缺少 @name 元数据' } };
        return result;
    }

    meta.name = sanitizeField(meta.name, FIELD_LIMITS.name);
    if (containsMaliciousContent(meta.name)) {
        result.error = { status: 400, body: { error: '脚本名称包含不安全内容' } };
        return result;
    }
    if (containsEmoji(meta.name)) {
        result.error = { status: 400, body: { error: '脚本名称不能包含 emoji' } };
        return result;
    }

    // 检查重名（含软删除）
    const dupCondition = opts.excludeId
        ? and(eq(scripts.name, meta.name), sql`${scripts.id} != ${opts.excludeId}`)
        : eq(scripts.name, meta.name);
    const [existing] = await db.select({ id: scripts.id }).from(scripts).where(dupCondition);
    if (existing) {
        result.error = { status: 409, body: { error: '此脚本名称已被占用' } };
        return result;
    }

    if (meta.version && !isValidVersion(meta.version)) {
        result.error = { status: 400, body: { error: '无效的版本号格式' } };
        return result;
    }

    if (filename && !isValidFilename(filename)) {
        result.error = { status: 400, body: { error: '无效的文件名' } };
        return result;
    }

    const safeFilename = filename && isValidFilename(filename)
        ? filename
        : `${meta.name.replace(/\s+/g, '-')}.user.js`;
    const safeReadme = readme ? sanitizeField(readme, README_MAX_LENGTH) : '';

    const rawMeta = parseMetadata(code);
    const { errors: metaErrors, warnings } = checkMetadata(rawMeta, code);
    if (metaErrors.length > 0) {
        result.error = {
            status: 400,
            body: {
                error: '脚本元数据不完整',
                details: metaErrors.map(e => `${e.field}: ${e.message}`),
            },
        };
        return result;
    }

    result.ok = true;
    result.meta = meta;
    result.safeFilename = safeFilename;
    result.safeReadme = safeReadme;
    result.rawMeta = rawMeta;
    result.metaErrors = metaErrors;
    result.warnings = warnings;
    return result;
}
