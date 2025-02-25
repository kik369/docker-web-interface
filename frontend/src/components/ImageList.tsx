import React, { useState } from 'react';
import { SearchBar } from './SearchBar';
import { BiCube } from 'react-icons/bi';
import { IconBaseProps } from 'react-icons';
import { HiTrash, HiExternalLink } from 'react-icons/hi';
import { useImages } from '../hooks/useImages';

const CubeIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <BiCube {...props} />
);

const TrashIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiTrash {...props} />
);

const ExternalLinkIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiExternalLink {...props} />
);

export const ImageList: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [imageToDelete, setImageToDelete] = useState<{ id: string, tag: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Use the hook for all image-related functionality
    const {
        images,
        isLoading,
        error,
        deleteImage,
        actionInProgress
    } = useImages();

    if (isLoading) {
        return <div className="loading">Loading images...</div>;
    }

    if (error) {
        return <div className="error">Error: {error}</div>;
    }

    // Filter images based on search term
    const filteredImages = images.filter(image => {
        const searchLower = searchTerm.toLowerCase();
        return (
            image.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
            image.id.toLowerCase().includes(searchLower)
        );
    });

    // Get Docker Hub URL from image tag
    const getDockerHubUrl = (tag: string) => {
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

    const handleDeleteClick = (id: string, tag: string) => {
        console.log(`Delete clicked for image: ${id}, tag: ${tag}`);
        // Store the raw ID without any substring modifications
        setImageToDelete({ id, tag });
        setShowDeleteModal(true);
    };

    const handleDeleteConfirm = async (force: boolean = false) => {
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
        <div className="container-list">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold text-white mb-2 sm:mb-0">Docker Images</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                            <CubeIcon className="w-4 h-4 mr-1" />
                            <span>{filteredImages.length}</span>
                        </div>
                    </div>
                </div>
                <div className="mb-2 sm:mb-0 sm:ml-4">
                    <SearchBar value={searchTerm} onChange={setSearchTerm} />
                </div>
            </div>

            <div className="space-y-4">
                {filteredImages.map(image => (
                    <div key={image.id} className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                        <div className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {image.tags.map(tag => (
                                            <span key={tag} className="px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                        {image.tags.length === 0 && (
                                            <span className="text-gray-400 text-sm">
                                                &lt;none&gt;
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        <p>ID: {image.id.substring(7, 19)}</p>
                                        <p>Size: {image.size} MB</p>
                                        <p>Created: {new Date(image.created).toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {image.tags.length > 0 && image.tags.map(tag => {
                                        const dockerHubUrl = getDockerHubUrl(tag);
                                        if (dockerHubUrl) {
                                            return (
                                                <a
                                                    key={`link-${tag}`}
                                                    href={dockerHubUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                                                    title={`Open ${tag} in Docker Hub or registry`}
                                                >
                                                    <ExternalLinkIcon className="w-5 h-5" />
                                                </a>
                                            );
                                        }
                                        return null;
                                    })}

                                    <button
                                        onClick={() => image.tags.length > 0
                                            ? handleDeleteClick(image.id, image.tags[0])
                                            : handleDeleteClick(image.id, image.id.substring(7, 19))}
                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                        disabled={actionInProgress === image.id}
                                        title="Delete image"
                                    >
                                        <TrashIcon className={`w-5 h-5 ${actionInProgress === image.id ? 'animate-pulse' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl">
                        <h3 className="text-xl font-semibold text-white mb-4">Delete Image</h3>
                        <p className="text-gray-300 mb-4">
                            Are you sure you want to delete the image {imageToDelete?.tag}?
                            This action cannot be undone.
                        </p>

                        {deleteError && (
                            <div className="bg-red-900 text-white p-3 rounded mb-4">
                                Error: {deleteError}
                            </div>
                        )}

                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={handleDeleteCancel}
                                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteConfirm(false)}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                disabled={actionInProgress === imageToDelete?.id}
                            >
                                {actionInProgress === imageToDelete?.id ? 'Deleting...' : 'Delete'}
                            </button>
                            <button
                                onClick={() => handleDeleteConfirm(true)}
                                className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-900 transition-colors"
                                disabled={actionInProgress === imageToDelete?.id}
                                title="Force delete even if the image is used by containers"
                            >
                                Force Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
