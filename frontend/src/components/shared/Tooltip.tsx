import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../../context/ThemeContext';

interface TooltipProps {
    children: React.ReactNode;
    text: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ children, text }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    const updateTooltipPosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.top - 10,
                left: rect.left + rect.width / 2
            });
        }
    };

    const handleMouseEnter = () => {
        updateTooltipPosition();
        setShowTooltip(true);
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    useEffect(() => {
        if (showTooltip) {
            window.addEventListener('scroll', updateTooltipPosition);
            window.addEventListener('resize', updateTooltipPosition);
        }

        return () => {
            window.removeEventListener('scroll', updateTooltipPosition);
            window.removeEventListener('resize', updateTooltipPosition);
        };
    }, [showTooltip]);

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className="cursor-help inline-flex"
            >
                {children}
            </div>

            {showTooltip && document.body && ReactDOM.createPortal(
                <div
                    className={`fixed ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-500'} text-white p-2 rounded
                    shadow-xl z-[1000] text-xs whitespace-nowrap min-w-min
                    ${theme === 'dark' ? 'shadow-black/50 border border-gray-700' : 'shadow-gray-700/50'}
                    backdrop-blur-sm backdrop-filter`}
                    style={{
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        transform: 'translate(-50%, -100%)',
                        boxShadow: theme === 'dark'
                            ? '0 4px 8px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)'
                            : '0 4px 8px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)'
                    }}
                >
                    <div className="relative">
                        {text}
                        <div
                            className={`absolute w-0 h-0 border-l-6 border-r-6 border-t-6 border-transparent
                            ${theme === 'dark' ? 'border-t-gray-800' : 'border-t-gray-500'}`}
                            style={{
                                bottom: '-12px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                filter: theme === 'dark' ? 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5))' : 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25))'
                            }}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default Tooltip;
