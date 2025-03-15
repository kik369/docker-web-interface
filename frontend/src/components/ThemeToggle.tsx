import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { HiSun, HiMoon } from 'react-icons/hi';

interface ThemeToggleProps {
    className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className={`p-2 rounded-full transition-colors duration-200 ${theme === 'light'
                ? 'bg-gray-200 hover:bg-gray-300'
                : 'bg-gray-700 hover:bg-gray-600'
                } ${className}`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? (
                <HiMoon className="h-5 w-5 text-gray-800" />
            ) : (
                <HiSun className="h-5 w-5 text-yellow-300" />
            )}
        </button>
    );
};

export default ThemeToggle;
