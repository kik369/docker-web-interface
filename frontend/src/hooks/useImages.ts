import { useState, useEffect, useCallback } from 'react';
import { Image, ApiResponse } from '../types/docker';
import { config } from '../config';

export const useImages = () => {
    const [images, setImages] = useState<Image[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        fetchImages();
    }, [fetchImages]);

    return {
        images,
        isLoading,
        error,
        refresh: fetchImages,
    };
};
