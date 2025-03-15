import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { HiSun, HiMoon } from 'react-icons/hi';

interface ThemeToggleProps {
    className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <div className={`flex items-center ${className}`}>
            <button
                onClick={toggleTheme}
                className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg"
                style={{
                    backgroundColor: isDark ? 'rgb(31 41 55 / var(--tw-bg-opacity, 1))' : '#d1d5db'
                }}
                aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
                title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            >
                <span
                    className={`flex items-center justify-center h-7 w-7 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${isDark ? 'translate-x-6' : 'translate-x-1'
                        }`}
                >
                    {isDark ? (
                        <HiSun className="h-5 w-5 text-blue-400" />
                    ) : (
                        <HiMoon className="h-5 w-5 text-gray-700" />
                    )}
                </span>
            </button>
        </div>
    );
};

export default ThemeToggle;
