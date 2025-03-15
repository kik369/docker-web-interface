import React, { useState, useRef, useEffect } from 'react';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { CopyFeedback } from './CopyFeedback';

interface CopyableTextProps {
    text: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Component that makes its children clickable to copy text to clipboard
 */
export const CopyableText: React.FC<CopyableTextProps> = ({
    text,
    children,
    className = ''
}) => {
    const { copyToClipboard, copyFeedback } = useCopyToClipboard();
    const [isActive, setIsActive] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    // Ensure we have a stable reference to the element
    useEffect(() => {
        // This is just to ensure the ref is properly attached
        return () => { };
    }, []);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation(); // Prevent event bubbling

        // Add a subtle active state effect
        setIsActive(true);
        setTimeout(() => setIsActive(false), 200);

        // Use the event if available, otherwise null will trigger the fallback in the hook
        try {
            copyToClipboard(text, e);
        } catch (error) {
            console.error("Error in click handler:", error);
            // Fallback to copying without event positioning
            copyToClipboard(text, null);
        }
    };

    // Alternative method to copy text if the click handler fails
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsActive(true);
            setTimeout(() => setIsActive(false), 200);
            copyToClipboard(text, null);
        }
    };

    return (
        <>
            <div
                ref={elementRef}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                className={`cursor-pointer ${className}`}
                title="Click to copy"
                tabIndex={0}
                role="button"
                aria-label={`Copy ${text}`}
                style={{
                    // Apply transform only for the active state
                    transform: isActive ? 'translateY(2px)' : 'none',
                    transition: 'transform 0.1s ease-in-out'
                }}
            >
                {children}
            </div>

            {copyFeedback && (
                <CopyFeedback
                    text={copyFeedback.text}
                    position={copyFeedback.position}
                    visible={copyFeedback.visible}
                    elementRect={copyFeedback.elementRect}
                    cursorPosition={copyFeedback.cursorPosition}
                />
            )}
        </>
    );
};
