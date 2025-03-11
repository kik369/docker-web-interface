import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { HiX } from 'react-icons/hi';

interface ShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
    const modalRef = useRef<HTMLDivElement>(null);

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
    ];

    const modalContent = (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div ref={modalRef} className="bg-gray-800 rounded-lg p-6 max-w-xl w-full shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-white">Keyboard Shortcuts</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white"
                        title="Close"
                    >
                        <HiX className="w-5 h-5" />
                    </button>
                </div>

                <div className="border-t border-gray-700 pt-4">
                    <table className="w-full">
                        <tbody>
                            {shortcuts.map((shortcut, index) => (
                                <tr key={index} className={index === 0 ? "" : "border-t border-gray-700"}>
                                    <td className="py-2 w-1/3">
                                        <span className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white">
                                            {shortcut.keys}
                                        </span>
                                    </td>
                                    <td className="py-2 text-gray-300">{shortcut.description}</td>
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
