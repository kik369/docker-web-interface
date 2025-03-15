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
        <button
            onClick={toggleTheme}
            className={`px-4 py-2 rounded-md transition-colors font-mono text-sm flex items-center bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
            {isDark ? (
                <>
                    <HiSun className="w-4 h-4 mr-2 text-yellow-400" />
                    <span className="font-mono">light</span>
                </>
            ) : (
                <>
                    <HiMoon className="w-4 h-4 mr-2 text-blue-400" />
                    <span className="font-mono">dark</span>
                </>
            )}
        </button>
    );
};

export default ThemeToggle;
