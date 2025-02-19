import { config } from '../config';

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

interface LogEvent {
    level: LogLevel;
    message: string;
    timestamp: string;
    context?: Record<string, any>;
    requestId?: string;
}

class LoggingService {
    private static instance: LoggingService;
    private logLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        // Set log level from environment or config
        const configLevel = config.LOG_LEVEL?.toLowerCase();
        if (configLevel && Object.values(LogLevel).includes(configLevel as LogLevel)) {
            this.logLevel = configLevel as LogLevel;
        }
    }

    public static getInstance(): LoggingService {
        if (!LoggingService.instance) {
            LoggingService.instance = new LoggingService();
        }
        return LoggingService.instance;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = Object.values(LogLevel);
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }

    private formatLogEvent(level: LogLevel, message: string, context?: Record<string, any>): LogEvent {
        return {
            level,
            message,
            timestamp: new Date().toISOString(),
            context,
            requestId: this.getRequestId()
        };
    }

    private getRequestId(): string {
        // Try to get request ID from headers or generate a new one
        return window.requestId || crypto.randomUUID();
    }

    private async sendToBackend(event: LogEvent): Promise<void> {
        if (config.SEND_LOGS_TO_BACKEND) {
            try {
                await fetch(`${config.API_URL}/api/logs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Request-ID': event.requestId || ''
                    },
                    body: JSON.stringify(event)
                });
            } catch (error) {
                console.error('Failed to send log to backend:', error);
            }
        }
    }

    public debug(message: string, context?: Record<string, any>): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            const event = this.formatLogEvent(LogLevel.DEBUG, message, context);
            console.debug(message, context);
            this.sendToBackend(event);
        }
    }

    public info(message: string, context?: Record<string, any>): void {
        if (this.shouldLog(LogLevel.INFO)) {
            const event = this.formatLogEvent(LogLevel.INFO, message, context);
            console.info(message, context);
            this.sendToBackend(event);
        }
    }

    public warn(message: string, context?: Record<string, any>): void {
        if (this.shouldLog(LogLevel.WARN)) {
            const event = this.formatLogEvent(LogLevel.WARN, message, context);
            console.warn(message, context);
            this.sendToBackend(event);
        }
    }

    public error(message: string, error?: Error, context?: Record<string, any>): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            const errorContext = {
                ...context,
                error: error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                } : undefined
            };
            const event = this.formatLogEvent(LogLevel.ERROR, message, errorContext);
            console.error(message, errorContext);
            this.sendToBackend(event);
        }
    }

    // Performance monitoring
    public logPerformance(label: string, duration: number): void {
        const event = this.formatLogEvent(LogLevel.INFO, `Performance: ${label}`, {
            duration,
            metric: 'performance',
            label
        });
        this.sendToBackend(event);
    }
}

// Create and export singleton instance
export const logger = LoggingService.getInstance();

// Performance monitoring utility
export const measurePerformance = (label: string) => {
    const start = performance.now();
    return () => {
        const duration = performance.now() - start;
        logger.logPerformance(label, duration);
    };
};

// Error boundary helper
export const logError = (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error('React Error Boundary caught an error', error, {
        componentStack: errorInfo.componentStack
    });
};
