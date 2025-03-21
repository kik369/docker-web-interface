import React, { forwardRef } from 'react';
import { useTheme } from '../context/ThemeContext';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
    ({ value, onChange, placeholder = "Search..." }, ref) => {
        const { theme } = useTheme();

        return (
            <div className="relative flex-1 max-w-md">
                <input
                    ref={ref}
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark'
                            ? 'bg-gray-700 text-white'
                            : 'bg-gray-100 text-gray-900 border border-gray-300'
                        }`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg
                        className={`h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path
                            fillRule="evenodd"
                            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                            clipRule="evenodd"
                        />
                    </svg>
                </div>
            </div>
        );
    }
);
