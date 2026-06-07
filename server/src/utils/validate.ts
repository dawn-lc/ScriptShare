/**
 * 输入验证和清理工具函数
 */
import crypto from 'crypto';
import { MAX_CODE_SIZE } from '../config';

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

// 允许的版本号字符：数字、点、短横、加号、下划线
const VERSION_PATTERN = /^[\d.+\-_a-zA-Z]+$/;

// 脚本名称允许的字符（字母数字、空格、常见符号）
const NAME_PATTERN = /^[\w\s.\-–—()\[\]{}+#@!&,;:'"/\\]+$/;

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
 * 验证版本号格式
 */
export function isValidVersion(version: string): boolean {
    return VERSION_PATTERN.test(version) && version.length <= FIELD_LIMITS.version;
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
 * 生成密码学安全的随机十六进制令牌（用于 Webhook Secret 等场景）
 * @param bytes 字节数（默认 24，生成 48 字符十六进制字符串）
 */
export function generateSecret(bytes: number = 24): string {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * 验证文件名：仅允许安全字符，防止路径遍历
 */
export function isValidFilename(filename: string): boolean {
    // 不能含路径分隔符、空字节，必须以 .js 或 .user.js 结尾
    return (
        !filename.includes('/') &&
        !filename.includes('\\') &&
        !filename.includes('\0') &&
        !filename.startsWith('.') &&
        (filename.endsWith('.js') || filename.endsWith('.user.js'))
    );
}
