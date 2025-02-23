import React from 'react';
import { ImageListProps } from '../types/docker';
import { SearchBar } from './SearchBar';
import { BiCube } from 'react-icons/bi';
import { IconBaseProps } from 'react-icons';

const CubeIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <BiCube {...props} />
);

export const ImageList: React.FC<ImageListProps> = ({
    images = [],
    isLoading,
    error,
}) => {
    const [searchTerm, setSearchTerm] = React.useState('');

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
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
