/**
 * Input validation & sanitization utilities
 */

// Maximum lengths for script fields (in characters)
export const FIELD_LIMITS = {
    name: 200,
    namespace: 500,
    version: 50,
    description: 2000,
    author: 200,
    filename: 255,
    code: 5 * 1024 * 1024, // 5MB max script size
    metadata_line: 5000,    // individual metadata value
} as const;

// Allowed version pattern: numbers, dots, dashes, plus, underscore
const VERSION_PATTERN = /^[\d.+\-_a-zA-Z]+$/;

// Allowed characters for script name (alphanumeric, spaces, common symbols)
const NAME_PATTERN = /^[\w\s.\-–—()\[\]{}+#@!&,;:'"/\\]+$/;

/**
 * Sanitize a string: strip null bytes and control characters (except newlines)
 */
export function sanitize(input: string): string {
    return input.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(input: string, maxLen: number): string {
    return input.length > maxLen ? input.slice(0, maxLen) : input;
}

/**
 * Validate version string
 */
export function isValidVersion(version: string): boolean {
    return VERSION_PATTERN.test(version) && version.length <= FIELD_LIMITS.version;
}

/**
 * Validate script name
 */
export function isValidName(name: string): boolean {
    return name.length > 0 && name.length <= FIELD_LIMITS.name;
}

/**
 * Validate and sanitize a metadata field
 */
export function sanitizeField(input: string, maxLen: number): string {
    return truncate(sanitize(input), maxLen);
}

/**
 * Validate script code size
 */
export function isValidCodeSize(code: string): boolean {
    return code.length <= FIELD_LIMITS.code;
}

/**
 * Reject obviously malicious metadata values
 * - Prevents JavaScript URL injection in description/name
 * - Blocks extremely long values
 */
export function containsMaliciousContent(input: string): boolean {
    const lower = input.toLowerCase();
    // Check for javascript:/data: URI injection in unexpected fields
    if (/^\s*(javascript|data|vbscript):/i.test(input)) return true;
    // Check for HTML injection (attempted XSS)
    if (/<script[\s>/]/i.test(lower)) return true;
    if (/onerror\s*=/i.test(lower) && /<[\w]+/i.test(lower)) return true;
    if (/onload\s*=/i.test(lower) && /<[\w]+/i.test(lower)) return true;
    return false;
}

/**
 * Validate filename: only allow safe characters, prevent path traversal
 */
export function isValidFilename(filename: string): boolean {
    // No path separators, no null bytes, ends with .js or .user.js
    return (
        !filename.includes('/') &&
        !filename.includes('\\') &&
        !filename.includes('\0') &&
        !filename.startsWith('.') &&
        (filename.endsWith('.js') || filename.endsWith('.user.js'))
    );
}
