import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '../services/logging';
import { useTheme } from '../context/ThemeContext';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

const ErrorDisplay: React.FC<{ error?: Error }> = ({ error }) => {
    const { theme } = useTheme();

    return (
        <div className={`p-6 rounded-lg shadow-md ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className={`${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>{error?.message}</p>
        </div>
    );
};

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error
        };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logError(error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return this.props.fallback || <ErrorDisplay error={this.state.error} />;
        }

        return this.props.children;
    }
}
