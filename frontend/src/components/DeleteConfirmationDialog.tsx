import React, { useState } from 'react';
import { HiTrash } from 'react-icons/hi';
import { useTheme } from '../context/ThemeContext';
import ModalPortal from './ModalPortal';

interface DeleteConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    itemToDelete: {
        id: string;
        name: string;
        type: 'image' | 'container';
    } | null;
    onConfirm: (force: boolean) => Promise<void>;
    isDeleting: boolean;
    error: string | null;
}

const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
    isOpen,
    onClose,
    itemToDelete,
    onConfirm,
    isDeleting,
    error
}) => {
    const { theme } = useTheme();
    const [isForceDelete, setIsForceDelete] = useState(false);

    if (!itemToDelete) return null;

    const title = `Delete ${itemToDelete.type === 'image' ? 'Image' : 'Container'}`;
    const forceDeleteLabel = itemToDelete.type === 'image'
        ? 'Force delete (remove even if used by containers)'
        : 'Force delete (remove even if running)';

    return (
        <ModalPortal isOpen={isOpen} onClose={onClose}>
            <div
                className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden shadow-xl max-w-md w-full`}
                style={{
                    boxShadow: theme === 'dark'
                        ? '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 2px 5px 0 rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.1)'
                        : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 2px 5px 0 rgba(0, 0, 0, 0.08), 0 1px 1px 0 rgba(0, 0, 0, 0.05)'
                }}
            >
                <div className={`flex items-center px-4 py-3 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} border-b ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{title}</h3>
                </div>

                <div className="p-5">
                    <div className="mb-4">
                        <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-2`}>
                            Are you sure you want to delete the {itemToDelete.type}:
                        </p>
                        <div className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-3 py-2 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono mb-2 w-full overflow-hidden`}>
                            <span className="truncate">{itemToDelete.name}</span>
                        </div>
                        <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} text-sm`}>
                            This action cannot be undone.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-900 bg-opacity-75 text-white p-3 rounded mb-4 text-sm">
                            Error: {error}
                        </div>
                    )}

                    <div className="flex items-center mb-4">
                        <input
                            type="checkbox"
                            id="force-delete"
                            checked={isForceDelete}
                            onChange={() => setIsForceDelete(!isForceDelete)}
                            className={`mr-2 h-4 w-4 rounded border-gray-300 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-100'}`}
                        />
                        <label htmlFor="force-delete" className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} text-sm`}>
                            {forceDeleteLabel}
                        </label>
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={onClose}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(isForceDelete)}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors ${isDeleting ? 'opacity-75' : ''}`}
                            disabled={isDeleting}
                        >
                            <HiTrash className={`w-4 h-4 mr-1.5 text-red-400 ${isDeleting ? 'animate-pulse' : ''}`} />
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};

export default DeleteConfirmationDialog;
