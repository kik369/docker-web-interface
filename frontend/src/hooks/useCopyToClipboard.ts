import { useState, useCallback } from 'react';

/**
 * Custom hook for copying text to clipboard with feedback
 * @returns Object with copy function and feedback state
 */
export const useCopyToClipboard = () => {
    const [copyFeedback, setCopyFeedback] = useState<{
        text: string;
        position: { top: number; left: number };
        visible: boolean;
        elementRect?: DOMRect | null;
        cursorPosition?: { x: number; y: number } | null;
    } | null>(null);

    /**
     * Copy text to clipboard and show feedback
     * @param text - Text to copy
     * @param event - Click event to position feedback
     */
    const copyToClipboard = useCallback(
        async (text: string, event: React.MouseEvent<HTMLElement> | null = null) => {
            try {
                await navigator.clipboard.writeText(text);

                // Default position in the middle of the viewport if no event is provided
                let position = {
                    top: window.innerHeight / 2 - 20,
                    left: window.innerWidth / 2,
                };

                let elementRect = null;
                let cursorPosition = null;

                // Calculate position for feedback if event is available
                if (event) {
                    // Get cursor position from the event
                    cursorPosition = {
                        x: event.clientX,
                        y: event.clientY
                    };

                    // Position the feedback near the cursor
                    position = {
                        top: event.clientY - 40, // Position above the cursor
                        left: event.clientX,
                    };

                    // Also store element rect for fallback positioning
                    if (event.currentTarget) {
                        elementRect = event.currentTarget.getBoundingClientRect();
                    }
                }

                setCopyFeedback({
                    text: 'Copied!',
                    position,
                    visible: true,
                    elementRect,
                    cursorPosition
                });

                // Hide feedback after animation
                setTimeout(() => {
                    setCopyFeedback((prev) =>
                        prev ? { ...prev, visible: false } : null
                    );

                    // Remove from DOM after fade out
                    setTimeout(() => {
                        setCopyFeedback(null);
                    }, 300);
                }, 1500); // Increased duration for better visibility
            } catch (error) {
                console.error('Failed to copy text:', error);

                // Default position in the middle of the viewport if no event is provided
                let position = {
                    top: window.innerHeight / 2 - 20,
                    left: window.innerWidth / 2,
                };

                let elementRect = null;
                let cursorPosition = null;

                // Calculate position for error feedback if event is available
                if (event) {
                    // Get cursor position from the event
                    cursorPosition = {
                        x: event.clientX,
                        y: event.clientY
                    };

                    // Position the feedback near the cursor
                    position = {
                        top: event.clientY - 40, // Position above the cursor
                        left: event.clientX,
                    };

                    // Also store element rect for fallback positioning
                    if (event.currentTarget) {
                        elementRect = event.currentTarget.getBoundingClientRect();
                    }
                }

                // Show error feedback if copy fails
                setCopyFeedback({
                    text: 'Copy failed',
                    position,
                    visible: true,
                    elementRect,
                    cursorPosition
                });

                // Hide error feedback
                setTimeout(() => {
                    setCopyFeedback((prev) =>
                        prev ? { ...prev, visible: false } : null
                    );
                    setTimeout(() => setCopyFeedback(null), 300);
                }, 1500);
            }
        },
        []
    );

    return { copyToClipboard, copyFeedback };
};
