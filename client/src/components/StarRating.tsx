import { useState } from 'react';
import { StarIcon } from '@heroicons/react/24/outline';

interface StarRatingProps {
    /** 当前评分值（0-5，支持 0.5 步进的半星） */
    value: number;
    /** 评分总数 */
    count?: number;
    /** 设置后启用交互评分（用户可点击评分） */
    onChange?: (score: number) => void;
    /** 用户是否已评过分（禁用交互） */
    disabled?: boolean;
    /** 每颗星的大小（像素） */
    size?: number;
}

export default function StarRating({ value, count, onChange, disabled, size = 16 }: StarRatingProps) {
    const [hovered, setHovered] = useState(0);

    const showValue = hovered || value || 0;
    const fullStars = Math.floor(showValue);
    const hasHalf = showValue - fullStars >= 0.5;

    return (
        <span
            className="inline-flex items-center"
            title={`${showValue.toFixed(1)}${count !== undefined ? ` (${count})` : ''}`}
        >
            <span className="inline-flex items-center" role="img" aria-label={`${showValue.toFixed(1)} 星`}>
                {[1, 2, 3, 4, 5].map((star) => {
                    const isFull = star <= fullStars;
                    const isHalf = !isFull && star === fullStars + 1 && hasHalf;

                    return (
                        <button
                            key={star}
                            type="button"
                            disabled={disabled || !onChange}
                            onMouseEnter={() => onChange && setHovered(star)}
                            onMouseLeave={() => onChange && setHovered(0)}
                            onClick={() => onChange?.(star)}
                            className={`${onChange && !disabled ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
                            aria-label={`${star} 星`}
                        >
                            <StarIcon
                                style={{ width: size, height: size, ...(isHalf ? { clipPath: 'inset(0 50% 0 0)' } : {}) }}
                                className={`
                                    ${isFull ? 'fill-amber-400 text-amber-400' : ''}
                                    ${isHalf ? 'fill-amber-400/50 text-amber-400' : ''}
                                    ${!isFull && !isHalf ? 'fill-none text-gray-300 dark:text-gray-600' : ''}
                                    ${onChange && !disabled ? 'hover:text-amber-400' : ''}
                                `}
                            />
                        </button>
                    );
                })}
            </span>
        </span>
    );
}
