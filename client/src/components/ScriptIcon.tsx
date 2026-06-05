import { useState } from 'react';
import { FileText } from 'lucide-react';

interface ScriptIconProps {
    /** URL or data URI of the icon (from @icon metadata) */
    icon?: string | null;
    /** Icon size in pixels. Default 40 (w-10 h-10). */
    size?: number;
    /** Additional class names for the container */
    className?: string;
}

/**
 * Renders a script icon from its @icon metadata URL.
 * Falls back to a placeholder when no icon is provided or the image fails to load.
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

    // Fallback: colored placeholder with FileText icon
    const iconSize = Math.round(size * 0.5);
    return (
        <div
            className={`${containerClass} bg-primary-100 dark:bg-primary-900/30`}
            style={containerStyle}
        >
            <FileText
                className="text-primary-600 dark:text-primary-400"
                style={{ width: iconSize, height: iconSize }}
            />
        </div>
    );
}
