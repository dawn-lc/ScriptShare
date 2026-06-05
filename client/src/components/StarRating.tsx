import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
    /** Current rating value (0-5, supports half stars via 0.5 increments) */
    value: number;
    /** Total number of ratings */
    count?: number;
    /** If set, enables interactive rating (user can click to set) */
    onChange?: (score: number) => void;
    /** Whether the user has already rated (to disable interaction) */
    disabled?: boolean;
    /** Size of each star in pixels */
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
                            <Star
                                size={size}
                                className={`
                                    ${isFull ? 'fill-amber-400 text-amber-400' : ''}
                                    ${isHalf ? 'fill-amber-400/50 text-amber-400' : ''}
                                    ${!isFull && !isHalf ? 'fill-none text-gray-300 dark:text-gray-600' : ''}
                                    ${onChange && !disabled ? 'hover:text-amber-400' : ''}
                                `}
                                style={isHalf ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
                            />
                        </button>
                    );
                })}
            </span>
        </span>
    );
}
