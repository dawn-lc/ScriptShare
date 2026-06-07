import { useState } from 'react';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

interface ScriptIconProps {
    /** 图标的 URL 或 data URI（来自 @icon 元数据） */
    icon?: string | null;
    /** 图标大小（像素）。默认 40（w-10 h-10）。 */
    size?: number;
    /** 容器的额外类名 */
    className?: string;
}

/**
 * 从 @icon 元数据 URL 渲染脚本图标。
 * 未提供图标或图片加载失败时回退到占位符。
 */
export default function ScriptIcon({ icon, size = 40, className = '' }: ScriptIconProps) {
    const [imgError, setImgError] = useState(false);
    const hasValidIcon = icon && icon.trim().length > 0 && !imgError;

    const containerClass = `rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${className || ''}`;
    const containerStyle = { width: size, height: size };

    if (hasValidIcon) {
        return (
            <div className={containerClass} style={containerStyle}>
                <img
                    src={icon}
                    alt=""
                    className="w-full h-full object-contain"
                    onError={() => setImgError(true)}
                    referrerPolicy="no-referrer"
                />
            </div>
        );
    }

    // 回退：带文件图标的彩色占位符
    const iconSize = Math.round(size * 0.5);
    return (
        <div
            className={`${containerClass} bg-primary-100 dark:bg-primary-900/30`}
            style={containerStyle}
        >
            <DocumentTextIcon
                className="text-primary-600 dark:text-primary-400"
                style={{ width: iconSize, height: iconSize }}
            />
        </div>
    );
}
