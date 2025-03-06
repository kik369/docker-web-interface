import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { SearchBar } from './SearchBar';
import { IconBaseProps } from 'react-icons';
import { HiTrash, HiExternalLink, HiOutlineTemplate } from 'react-icons/hi';
import { useImages } from '../hooks/useImages';
import { Image } from '../types/docker';

// Create wrapper components for icons
const TrashIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiTrash {...props} />
);

const ExternalLinkIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiExternalLink {...props} />
);

const TemplateIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiOutlineTemplate {...props} />
);

// Tooltip component that uses ReactDOM.createPortal to avoid positioning issues
interface TooltipProps {
    children: React.ReactNode;
    text: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ children, text }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);

    const updateTooltipPosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.top - 5,
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
                    className="fixed bg-gray-800 text-white p-2 rounded shadow-lg z-[1000] text-xs whitespace-nowrap min-w-min"
                    style={{
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className="relative">
                        {text}
                        <div
                            className="absolute w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-800"
                            style={{ bottom: '-8px', left: '50%', transform: 'translateX(-50%)' }}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

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
}> = ({ image, onDelete, actionInProgress }) => {
    // Get Docker Hub URL from image tag
    const getDockerHubUrl = (tag: string): string | null => {
        // Example tag: nginx:latest or library/nginx:latest
        try {
            if (!tag.includes('/')) {
                // Official image
                const name = tag.split(':')[0];
                return `https://hub.docker.com/_/${name}`;
            } else {
                // User repository or organization
                const parts = tag.split(':')[0].split('/');
                if (parts.length === 2) {
                    // user/repo format
                    return `https://hub.docker.com/r/${parts[0]}/${parts[1]}`;
                } else if (parts.length === 3 && parts[0].includes('.')) {
                    // registry.example.com/user/repo format - not Docker Hub
                    return `https://${parts[0]}`;
                }
            }
        } catch (e) {
            console.error('Error parsing image tag:', e);
        }
        return null;
    };

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
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div>
                            <div className="flex items-center space-x-2">
                                <Tooltip text="Docker Image">
                                    <h3 className="text-lg font-semibold text-white">{displayName}</h3>
                                </Tooltip>

                                {image.tags.length > 1 && (
                                    <Tooltip text="Additional Tags">
                                        <span className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white">
                                            +{image.tags.length - 1}
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {mainTag && getDockerHubUrl(mainTag) && (
                            <a
                                href={getDockerHubUrl(mainTag) || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                                title={`Open ${mainTag} in Docker Hub or registry`}
                            >
                                <ExternalLinkIcon className="w-4 h-4 mr-1 text-blue-400" />
                                Docker Hub
                            </a>
                        )}
                        <button
                            onClick={() => onDelete(image.id, displayName)}
                            className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                            disabled={isActionLoading}
                            title="Delete image"
                        >
                            <TrashIcon className={`w-4 h-4 mr-1 text-red-500 ${isActionLoading ? 'animate-pulse' : ''}`} />
                            Delete
                        </button>
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-[80px_auto] gap-y-1">
                        <p className="text-sm text-gray-400">ID:</p>
                        <p><span className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                            <TemplateIcon className="mr-1 text-purple-400" />
                            {shortId}
                        </span></p>

                        <p className="text-sm text-gray-400">Size:</p>
                        <p>
                            <Tooltip text={exactSizeInBytes}>
                                <span className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                                    {formattedSize}
                                </span>
                            </Tooltip>
                        </p>

                        <p className="text-sm text-gray-400">Created:</p>
                        <p>
                            <Tooltip text={fullDateTime}>
                                <span className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                                    {relativeTime}
                                </span>
                            </Tooltip>
                        </p>

                        {image.tags.length > 1 && (
                            <>
                                <p className="text-sm text-gray-400">Tags:</p>
                                <div className="flex flex-wrap gap-1">
                                    {image.tags.slice(1).map(tag => (
                                        <span key={tag} className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                                            {tag}
                                        </span>
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
}

export const ImageList: React.FC<ImageListProps> = ({ searchTerm = '', onSearchChange }) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [imageToDelete, setImageToDelete] = useState<{ id: string, tag: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isForceDelete, setIsForceDelete] = useState(false);

    // Use the hook for all image-related functionality
    const {
        images,
        isLoading,
        error,
        deleteImage,
        actionInProgress
    } = useImages();

    if (isLoading) {
        return <div className="flex justify-center items-center p-8 text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
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
        setImageToDelete({ id, tag });
        setShowDeleteModal(true);
        setIsForceDelete(false);
    };

    const handleDeleteConfirm = async () => {
        if (imageToDelete) {
            setDeleteError(null);
            const success = await deleteImage(imageToDelete.id, isForceDelete);
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
        <div className="container-list">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold text-white mb-2 sm:mb-0">Docker Images</h2>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                            <TemplateIcon className="w-4 h-4 mr-1 text-purple-400" />
                            <span>{filteredImages.length}</span>
                        </div>
                    </div>
                </div>
                {/* Search bar has been moved to the navbar */}
            </div>

            <div className="space-y-4">
                {filteredImages.length === 0 ? (
                    <div className="bg-gray-800 p-6 rounded-lg text-center text-gray-400">
                        {searchTerm ? `No images found matching "${searchTerm}"` : "No images found"}
                    </div>
                ) : (
                    filteredImages.map(image => (
                        <ImageRow
                            key={image.id}
                            image={image}
                            onDelete={handleDeleteClick}
                            actionInProgress={actionInProgress}
                        />
                    ))
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl">
                        <h3 className="text-xl font-semibold text-white mb-4">Delete Image</h3>
                        <p className="text-gray-300 mb-4">
                            Are you sure you want to delete the image <span className="font-semibold">{imageToDelete?.tag}</span>?
                            This action cannot be undone.
                        </p>

                        {deleteError && (
                            <div className="bg-red-900 text-white p-3 rounded mb-4">
                                Error: {deleteError}
                            </div>
                        )}

                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="force-delete"
                                checked={isForceDelete}
                                onChange={() => setIsForceDelete(!isForceDelete)}
                                className="mr-2"
                            />
                            <label htmlFor="force-delete" className="text-gray-300 text-sm">
                                Force delete (remove even if used by containers)
                            </label>
                        </div>

                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={handleDeleteCancel}
                                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                disabled={actionInProgress === imageToDelete?.id}
                            >
                                {actionInProgress === imageToDelete?.id ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
