import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../context/ThemeContext';
import { HiClipboardCheck, HiClipboardCopy, HiExclamation } from 'react-icons/hi';

interface CopyFeedbackProps {
    text: string;
    position: { top: number; left: number };
    visible: boolean;
    elementRect?: DOMRect | null;
    cursorPosition?: { x: number; y: number } | null;
}

/**
 * Component that displays a subtle feedback when text is copied
 */
export const CopyFeedback: React.FC<CopyFeedbackProps> = ({
    text,
    position,
    visible,
    elementRect,
    cursorPosition
}) => {
    const { theme } = useTheme();
    const [scale, setScale] = useState(0.8);
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    // Ensure the feedback is always visible within the viewport
    useEffect(() => {
        // Adjust position to ensure it's visible in the viewport
        const adjustPosition = () => {
            const padding = 10; // Minimum distance from viewport edge
            let { top, left } = position;

            // Prioritize cursor position if available
            if (cursorPosition) {
                top = cursorPosition.y - 40; // Position above the cursor
                left = cursorPosition.x;

                // If too close to the top, position below the cursor
                if (top < padding) {
                    top = cursorPosition.y + 20;
                }
            }
            // Fall back to element position if cursor position is not available
            else if (elementRect) {
                // Position above the element with appropriate spacing
                top = elementRect.top - 30; // Position above with spacing
                left = elementRect.left + (elementRect.width / 2); // Center horizontally

                // If too close to the top, position below the element instead
                if (top < padding) {
                    top = elementRect.bottom + 10;
                }
            }

            // Ensure top is within viewport
            if (top < padding) {
                top = padding;
            } else if (top > window.innerHeight - padding) {
                top = window.innerHeight - padding;
            }

            // Ensure left is within viewport
            if (left < padding) {
                left = padding;
            } else if (left > window.innerWidth - padding) {
                left = window.innerWidth - padding;
            }

            setAdjustedPosition({ top, left });
        };

        adjustPosition();

        // Adjust position on window resize
        window.addEventListener('resize', adjustPosition);
        return () => window.removeEventListener('resize', adjustPosition);
    }, [position, elementRect, cursorPosition]);

    // Add a subtle pop animation when the feedback appears
    useEffect(() => {
        if (visible) {
            // Start with a smaller scale
            setScale(0.8);

            // Animate to a slightly larger scale
            const timer1 = setTimeout(() => setScale(1.1), 50);

            // Then settle back to normal scale
            const timer2 = setTimeout(() => setScale(1), 150);

            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
            };
        }
    }, [visible]);

    // Determine icon based on text content
    const getIcon = () => {
        if (text.toLowerCase().includes('fail')) {
            return <HiExclamation className="text-base text-red-500 animate-pulse" />;
        } else if (text.toLowerCase().includes('copied')) {
            return <HiClipboardCheck className="text-base text-green-500 animate-pulse" />;
        } else {
            return <HiClipboardCopy className="text-base animate-pulse" />;
        }
    };

    // Portal the feedback to the body to avoid positioning issues
    return ReactDOM.createPortal(
        <div
            className={`fixed z-[1001] transform -translate-x-1/2 pointer-events-none
                flex items-center gap-1 px-2 py-1 rounded-md
                transition-all duration-300 ease-in-out
                ${visible ? 'opacity-100' : 'opacity-0'}
                ${theme === 'dark'
                    ? 'bg-gray-800 border border-gray-700 shadow-lg'
                    : 'bg-white border border-gray-200 shadow-md'}`}
            style={{
                top: `${adjustedPosition.top}px`,
                left: `${adjustedPosition.left}px`,
                transform: `translateX(-50%) scale(${scale})`,
            }}
        >
            {getIcon()}
            <span className={`text-xs font-medium ${text.toLowerCase().includes('fail')
                    ? theme === 'dark' ? 'text-red-300' : 'text-red-600'
                    : theme === 'dark' ? 'text-green-300' : 'text-green-600'
                }`}>
                {text}
            </span>
        </div>,
        document.body
    );
};
