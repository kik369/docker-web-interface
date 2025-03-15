import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { HiX } from 'react-icons/hi';
import { useTheme } from '../context/ThemeContext';

interface ShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const shortcuts = [
        { keys: 'Ctrl + Shift + C', description: 'Switch to Containers tab' },
        { keys: 'Ctrl + Shift + I', description: 'Switch to Images tab' },
        { keys: 'Ctrl + Shift + S', description: 'Focus on search box' },
        { keys: 'Ctrl + /', description: 'Show keyboard shortcuts' },
        { keys: 'Ctrl + D', description: 'Toggle dark/light mode' },
    ];

    const modalContent = (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
                ref={modalRef}
                className={`rounded-lg p-6 max-w-xl w-full shadow-xl ${theme === 'dark'
                        ? 'bg-gray-800 text-white'
                        : 'bg-white text-gray-900'
                    }`}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">Keyboard Shortcuts</h3>
                    <button
                        onClick={onClose}
                        className={`${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        title="Close"
                    >
                        <HiX className="w-5 h-5" />
                    </button>
                </div>

                <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} pt-4`}>
                    <table className="w-full">
                        <tbody>
                            {shortcuts.map((shortcut, index) => (
                                <tr key={index} className={index === 0 ? "" : `border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                                    <td className="py-2 w-1/3">
                                        <span className={`inline-flex items-center rounded px-2 py-1 text-sm font-mono ${theme === 'dark'
                                                ? 'bg-gray-700 text-white'
                                                : 'bg-gray-200 text-gray-800'
                                            }`}>
                                            {shortcut.keys}
                                        </span>
                                    </td>
                                    <td className={`py-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                        {shortcut.description}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};
