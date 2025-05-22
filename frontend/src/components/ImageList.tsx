import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { IconBaseProps } from 'react-icons';
import { HiTrash, HiOutlineTemplate, HiOutlineClock, HiOutlineScale } from 'react-icons/hi';
import { useImages } from '../hooks/useImages';
import { Image } from '../types/docker';
import { useTheme } from '../context/ThemeContext';
import { CopyableText } from './CopyableText';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import Tooltip from './shared/Tooltip'; // Added import

// Create wrapper components for icons
const TrashIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiTrash {...props} />
);

const TemplateIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiOutlineTemplate {...props} />
);

const ClockIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiOutlineClock {...props} />
);

const ScaleIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiOutlineScale {...props} />
);

// Function to format relative time
const formatRelativeTime = (timestamp: number): string => {
    const now = new Date().getTime();
    const diff = now - timestamp;

    // Convert milliseconds to seconds, minutes, hours, days
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return years === 1 ? '1 year ago' : `${years} years ago`;
    } else if (months > 0) {
        return months === 1 ? '1 month ago' : `${months} months ago`;
    } else if (days > 0) {
        return days === 1 ? '1 day ago' : `${days} days ago`;
    } else if (hours > 0) {
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (minutes > 0) {
        return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    } else {
        return seconds <= 1 ? 'just now' : `${seconds} seconds ago`;
    }
};

// Format full date and time in a human-readable format
const formatFullDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

// Format file size to appropriate units (KB, MB, GB, TB)
const formatFileSize = (sizeMB: number): string => {
    // Convert to KB for very small images (< 0.1 MB)
    if (sizeMB < 0.1) {
        const sizeKB = sizeMB * 1024;
        return `${sizeKB.toFixed(2)} KB`;
    }
    // Convert to TB for very large images (≥ 1000 GB = 1,024,000 MB)
    else if (sizeMB >= 1024000) {
        const sizeTB = sizeMB / 1024 / 1024;
        return `${sizeTB.toFixed(2)} TB`;
    }
    // Convert to GB for large images (≥ 1000 MB)
    else if (sizeMB >= 1000) {
        const sizeGB = sizeMB / 1024;
        return `${sizeGB.toFixed(2)} GB`;
    }
    // Keep as MB for medium images
    else {
        return `${sizeMB.toFixed(2)} MB`;
    }
};

// Convert MB to bytes and format with commas for readability
const formatSizeInBytes = (sizeMB: number): string => {
    const bytes = Math.round(sizeMB * 1024 * 1024);
    return bytes.toLocaleString() + ' bytes';
};

// ImageRow component displays a single image
const ImageRow: React.FC<{
    image: Image;
    onDelete: (id: string, tag: string) => void;
    actionInProgress: string | null;
    isHighlighted: boolean;
    highlightTimestamp?: number;
}> = ({ image, onDelete, actionInProgress, isHighlighted, highlightTimestamp }) => {
    const { theme } = useTheme();
    const [highlightActive, setHighlightActive] = useState(isHighlighted || false);

    // Handle highlight effect
    useEffect(() => {
        if (isHighlighted && highlightTimestamp) {
            // Activate highlight
            setHighlightActive(true);

            // Deactivate highlight after 2 seconds
            const timer = setTimeout(() => {
                setHighlightActive(false);
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [isHighlighted, highlightTimestamp]);

    const isActionLoading = actionInProgress === image.id;
    const formattedSize = formatFileSize(image.size);
    const exactSizeInBytes = formatSizeInBytes(image.size);
    const shortId = image.id.substring(7, 19);
    const mainTag = image.tags.length > 0 ? image.tags[0] : null;
    const displayName = mainTag || `<none>:<none>`;

    // Format the created time
    const createdTimestamp = typeof image.created === 'string'
        ? new Date(image.created).getTime()
        : image.created;
    const relativeTime = formatRelativeTime(createdTimestamp);
    const fullDateTime = formatFullDateTime(createdTimestamp);

    return (
        <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden transition-all duration-300 border border-opacity-10 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} ${highlightActive
            ? `${theme === 'dark' ? 'ring-2 ring-blue-500 ring-opacity-75' : 'ring-2 ring-blue-400 ring-opacity-75'} scale-[1.01] animate-glow-pulse`
            : ''
            }`}
            style={{
                boxShadow: theme === 'dark'
                    ? '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 2px 5px 0 rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.1)'
                    : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 2px 5px 0 rgba(0, 0, 0, 0.08), 0 1px 1px 0 rgba(0, 0, 0, 0.05)'
            }}
        >
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div>
                            <div className="flex items-center space-x-2">
                                <CopyableText text={displayName}>
                                    <Tooltip text="Docker Image">
                                        <h3 className={`text-lg font-semibold font-mono ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{displayName}</h3>
                                    </Tooltip>
                                </CopyableText>

                                {image.tags.length > 1 && (
                                    <Tooltip text="Additional Tags">
                                        <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                            +{image.tags.length - 1}
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => onDelete(image.id, displayName)}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={isActionLoading}
                            title="Delete image"
                        >
                            <TrashIcon className={`w-4 h-4 mr-1.5 text-red-400 ${isActionLoading ? 'animate-pulse' : ''}`} />
                            Delete
                        </button>
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-[80px_auto] gap-y-1">
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>ID:</p>
                        <p><CopyableText text={image.id}>
                            <Tooltip text={`${image.id} (click to copy full ID)`}>
                                <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                    <TemplateIcon className="mr-1 text-purple-300" />
                                    {shortId}
                                </span>
                            </Tooltip>
                        </CopyableText></p>

                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Size:</p>
                        <p><CopyableText text={Math.round(image.size * 1024 * 1024).toString()}>
                            <Tooltip text={`${exactSizeInBytes} (click to copy raw bytes)`}>
                                <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                    <ScaleIcon className="mr-1 text-blue-300" />
                                    {formattedSize}
                                </span>
                            </Tooltip>
                        </CopyableText></p>

                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Created:</p>
                        <p><CopyableText text={new Date(createdTimestamp).toISOString()}>
                            <Tooltip text={`${fullDateTime} (click to copy ISO format)`}>
                                <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                    <ClockIcon className="mr-1 text-green-300" />
                                    {relativeTime}
                                </span>
                            </Tooltip>
                        </CopyableText></p>

                        {image.tags.length > 1 && (
                            <>
                                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Tags:</p>
                                <div className="flex flex-wrap gap-2">
                                    {image.tags.slice(1).map((tag, index) => (
                                        <CopyableText key={index} text={tag}>
                                            <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                                {tag}
                                            </span>
                                        </CopyableText>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ImageList component displays all Docker images
interface ImageListProps {
    searchTerm?: string;
    onSearchChange?: (value: string) => void;
    highlightedItem?: { type: string; id: string; timestamp: number } | null;
}

export const ImageList: React.FC<ImageListProps> = ({ searchTerm = '', onSearchChange, highlightedItem }) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [imageToDelete, setImageToDelete] = useState<{ id: string; name: string; type: 'image' | 'container' } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const { theme } = useTheme();

    // Use the hook for all image-related functionality
    const {
        images,
        isLoading,
        error,
        deleteImage,
        actionInProgress
    } = useImages();

    if (isLoading) {
        return <div className={`flex justify-center items-center p-8 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2">Loading images...</span>
        </div>;
    }

    if (error) {
        return <div className="bg-red-800 text-white p-4 rounded-lg">Error: {error}</div>;
    }

    // Filter images based on search term
    const filteredImages = images.filter(image => {
        const searchLower = searchTerm.toLowerCase();
        return (
            image.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
            image.id.toLowerCase().includes(searchLower)
        );
    });

    const handleDeleteClick = (id: string, tag: string) => {
        setImageToDelete({
            id,
            name: tag,
            type: 'image'
        });
        setShowDeleteModal(true);
    };

    const handleDeleteConfirm = async (force: boolean) => {
        if (imageToDelete) {
            setDeleteError(null);
            const success = await deleteImage(imageToDelete.id, force);
            if (success) {
                setShowDeleteModal(false);
                setImageToDelete(null);
            } else {
                setDeleteError(error);
            }
        }
    };

    const handleDeleteCancel = () => {
        setShowDeleteModal(false);
        setImageToDelete(null);
        setDeleteError(null);
    };

    return (
        <div className="w-full">
            <div className="space-y-4">
                <div
                    className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg overflow-hidden border border-opacity-10 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                    style={{
                        boxShadow: theme === 'dark'
                            ? '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 2px 5px 0 rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.1)'
                            : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 2px 5px 0 rgba(0, 0, 0, 0.08), 0 1px 1px 0 rgba(0, 0, 0, 0.05)'
                    }}
                >
                    <div className={`flex items-center justify-between px-4 py-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                        <div className="flex items-center">
                            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Docker Images</h2>
                            <div className="flex items-center ml-4 gap-2">
                                <div className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 border border-gray-600' : 'bg-gray-200 border border-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                    <TemplateIcon className="w-4 h-4 mr-1 text-purple-300" />
                                    <span>{filteredImages.length}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4">
                        {filteredImages.length === 0 ? (
                            <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} p-4 rounded-lg text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                {searchTerm ? `No images found matching "${searchTerm}"` : "No images found"}
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {filteredImages.map(image => (
                                    <ImageRow
                                        key={image.id}
                                        image={image}
                                        onDelete={handleDeleteClick}
                                        actionInProgress={actionInProgress}
                                        isHighlighted={highlightedItem?.id === image.id}
                                        highlightTimestamp={highlightedItem?.id === image.id ? highlightedItem.timestamp : undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Use the new DeleteConfirmationDialog component */}
            <DeleteConfirmationDialog
                isOpen={showDeleteModal}
                onClose={handleDeleteCancel}
                itemToDelete={imageToDelete}
                onConfirm={handleDeleteConfirm}
                isDeleting={!!imageToDelete && actionInProgress === imageToDelete.id}
                error={deleteError}
            />
        </div>
    );
};
