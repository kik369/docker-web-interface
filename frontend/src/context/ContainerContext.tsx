import React, { createContext, useReducer, useContext, ReactNode } from 'react';
import { Container } from '../types/docker';
import { logger } from '../services/logging';

interface ContainerState {
    containers: Container[];
    isLoading: boolean;
    error: string | null;
}

type ContainerAction =
    | { type: 'SET_CONTAINERS'; payload: Container[] }
    | { type: 'UPDATE_CONTAINER'; payload: Container }
    | { type: 'DELETE_CONTAINER'; payload: string }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_ERROR'; payload: string | null };

const initialState: ContainerState = {
    containers: [],
    isLoading: false,
    error: null,
};

const ContainerContext = createContext<{
    state: ContainerState;
    dispatch: React.Dispatch<ContainerAction>;
}>({
    state: initialState,
    dispatch: () => null,
});

const containerReducer = (state: ContainerState, action: ContainerAction): ContainerState => {
    switch (action.type) {
        case 'SET_CONTAINERS':
            return {
                ...state,
                containers: action.payload,
                isLoading: false,
            };

        case 'UPDATE_CONTAINER': {
            const updatedContainers = state.containers.map(container =>
                container.id === action.payload.id ? action.payload : container
            );

            // If container doesn't exist and it's not a deletion, add it
            if (!updatedContainers.some(c => c.id === action.payload.id)) {
                updatedContainers.push(action.payload);
            }

            return {
                ...state,
                containers: updatedContainers,
            };
        }

        case 'DELETE_CONTAINER':
            return {
                ...state,
                containers: state.containers.filter(container => container.id !== action.payload),
            };

        case 'SET_LOADING':
            return {
                ...state,
                isLoading: action.payload,
            };

        case 'SET_ERROR':
            return {
                ...state,
                error: action.payload,
                isLoading: false,
            };

        default:
            return state;
    }
};

export const ContainerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(containerReducer, initialState);

    return (
        <ContainerContext.Provider value={{ state, dispatch }}>
            {children}
        </ContainerContext.Provider>
    );
};

export const useContainerContext = () => {
    const context = useContext(ContainerContext);
    if (!context) {
        throw new Error('useContainerContext must be used within a ContainerProvider');
    }
    return context;
};

// Helper hooks for common container operations
export const useContainerOperations = () => {
    const { dispatch } = useContainerContext();

    const setContainers = (containers: Container[]) => {
        logger.info('Setting containers:', { containers });
        dispatch({ type: 'SET_CONTAINERS', payload: containers });
    };

    const updateContainer = (container: Container) => {
        logger.info('Updating container:', { container });
        dispatch({ type: 'UPDATE_CONTAINER', payload: container });
    };

    const deleteContainer = (containerId: string) => {
        logger.info('Deleting container:', { containerId });
        dispatch({ type: 'DELETE_CONTAINER', payload: containerId });
    };

    const setLoading = (isLoading: boolean) => {
        dispatch({ type: 'SET_LOADING', payload: isLoading });
    };

    const setError = (error: string | null) => {
        if (error) {
            logger.error('Container error:', new Error(error));
        }
        dispatch({ type: 'SET_ERROR', payload: error });
    };

    return {
        setContainers,
        updateContainer,
        deleteContainer,
        setLoading,
        setError,
    };
};
