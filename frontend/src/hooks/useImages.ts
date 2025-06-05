import { useState, useEffect, useCallback } from 'react';
import { Image, ApiResponse } from '../types/docker';
import { config } from '../config';

// Global event system for triggering image refreshes across all hook instances
const imageRefreshEventTarget = new EventTarget();
export const triggerImagesRefresh = () => {
    imageRefreshEventTarget.dispatchEvent(new CustomEvent('refresh'));
};

export const useImages = () => {
    const [images, setImages] = useState<Image[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);

    const fetchImages = useCallback(async () => {
        try {
            console.log('Fetching images...');
            setIsLoading(true);
            const response = await fetch(`${config.API_URL}/api/images`);
            const result: ApiResponse<Image[]> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch images');
            }

            if (result.status === 'error') {
                throw new Error(result.error || 'Failed to fetch images');
            }

            console.log('Images fetched successfully:', result.data.length);
            setImages(result.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching images:', err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const deleteImage = useCallback(async (imageId: string, force: boolean = false) => {
        try {
            console.log(`Attempting to delete image with ID: ${imageId}, force: ${force}`);
            setActionInProgress(imageId);
            setError(null); // Clear any previous errors

            // Make sure we're dealing with the proper image ID format
            // Docker image IDs typically start with 'sha256:', but the backend might expect it without this prefix
            const sanitizedImageId = imageId.startsWith('sha256:') ? imageId : `sha256:${imageId}`;
            console.log(`Sanitized image ID: ${sanitizedImageId}`);

            const url = `${config.API_URL}/api/images/${sanitizedImageId}?force=${force}`;
            console.log(`DELETE request URL: ${url}`);

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            console.log(`DELETE response status: ${response.status} ${response.statusText}`);

            const responseText = await response.text();
            console.log(`DELETE response body: ${responseText}`);

            let result;
            try {
                result = JSON.parse(responseText) as ApiResponse<{ message: string }>;
            } catch (e) {
                console.error('Failed to parse response JSON:', e);
                throw new Error(`Failed to parse response: ${responseText}`);
            }

            if (!response.ok) {
                throw new Error(result.error || `Failed to delete image: ${response.status} ${response.statusText}`);
            }

            if (result.status === 'error') {
                throw new Error(result.error || 'API returned error status');
            }

            console.log('Image deleted successfully, refreshing image list');

            // Optimistically update the UI immediately to remove the deleted image
            setImages(prevImages => prevImages.filter(img => img.id !== imageId));

            // Then refresh from the server to ensure consistency
            await fetchImages();
            return true;
        } catch (err) {
            console.error('Error deleting image:', err);
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            setError(errorMessage);
            return false;
        } finally {
            setActionInProgress(null);
        }
    }, [fetchImages]);

    useEffect(() => {
        fetchImages();
    }, [fetchImages]);

    // Listen for global refresh events
    useEffect(() => {
        const handleRefresh = () => {
            fetchImages();
        };
        
        imageRefreshEventTarget.addEventListener('refresh', handleRefresh);
        
        return () => {
            imageRefreshEventTarget.removeEventListener('refresh', handleRefresh);
        };
    }, [fetchImages]);

    return {
        images,
        isLoading,
        error,
        actionInProgress,
        refresh: fetchImages,
        deleteImage,
    };
};
