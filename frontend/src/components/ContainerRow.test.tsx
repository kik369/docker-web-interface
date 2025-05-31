import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ContainerRow } from './ContainerRow';
import { useWebSocket } from '../hooks/useWebSocket';
import { ContainerContext } from '../context/ContainerContext';
import { ThemeContext } from '../context/ThemeContext'; // Import ThemeContext
import { Container } from '../types/docker';

// Mock the dependencies
jest.mock('../hooks/useWebSocket');
jest.mock('../services/logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));
jest.mock('./LogContainer', () => ({
  __esModule: true,
  default: jest.fn(({ logs, isLoading, onPauseToggle, isPaused, isStreamActive, onClose }) => (
    <div data-testid="log-container">
      {isLoading && <p>Loading logs...</p>}
      <pre>{logs}</pre>
      <button onClick={onPauseToggle}>{isPaused ? 'Resume' : 'Pause'}</button>
      <button onClick={onClose}>Close Logs</button>
      <p>Stream Active: {isStreamActive ? 'Yes' : 'No'}</p>
    </div>
  )),
}));

const mockStartLogStream = jest.fn();
const mockStopLogStream = jest.fn();
let mockOnLogUpdateCallback: ((containerId: string, log: string) => void) | null = null;
let mockOnErrorCallback: ((error: string) => void) | null = null;

const mockContainer: Container = {
  id: 'test-container-id',
  name: 'TestContainer',
  image: 'test-image',
  state: 'running',
  status: 'Up 2 hours',
  ports: '80:8080/tcp',
  created: new Date().toISOString(),
  compose_project: 'TestProject',
  compose_service: 'test-service',
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeContext.Provider value={{ theme: 'light', setTheme: jest.fn() }}>
      <ContainerContext.Provider value={{ state: { areAllLogsOpen: false }, dispatch: jest.fn() }}>
        {component}
      </ContainerContext.Provider>
    </ThemeContext.Provider>
  );
};

describe('ContainerRow Log Streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWebSocket as jest.Mock).mockImplementation(({ onLogUpdate, onError }) => {
      mockOnLogUpdateCallback = onLogUpdate;
      mockOnErrorCallback = onError;
      return {
        startLogStream: mockStartLogStream,
        stopLogStream: mockStopLogStream,
        isConnected: true,
      };
    });
    // Mock localStorage
    Storage.prototype.getItem = jest.fn(() => 'false'); // Default to logs not visible
    Storage.prototype.setItem = jest.fn();
  });

  test('1. Clicking "Show Logs" should call startLogStream and display LogContainer', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        actionInProgress={null}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    fireEvent.click(showLogsButton);

    await waitFor(() => {
      expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
      expect(screen.getByTestId('log-container')).toBeVisible();
      // Initial loading state
      expect(screen.getByText('Loading logs...')).toBeInTheDocument();
    });
  });

  test('2. When onLogUpdate is called, logs are passed to LogContainer', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        actionInProgress={null}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    fireEvent.click(showLogsButton);

    await waitFor(() => {
      expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
      expect(screen.getByTestId('log-container')).toBeVisible();
    });

    expect(mockOnLogUpdateCallback).not.toBeNull();
    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Log line 1\n');
    });

    await waitFor(() => {
        // LogContainer's mock directly renders the logs prop into <pre>
        expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('Log line 1');
    });

    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Log line 2\n');
    });

    await waitFor(() => {
      expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('Log line 1\nLog line 2');
    });
  });

  test('3. Clicking "Hide Logs" should call stopLogStream and hide LogContainer', async () => {
    // Set localStorage to initially show logs for this test
    Storage.prototype.getItem = jest.fn((key) => key === `dockerWebInterface_logsViewed_${mockContainer.id}` ? 'true' : 'false');

    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        actionInProgress={null}
      />
    );

    // Logs should be visible initially due to localStorage mock
    await waitFor(() => {
      expect(screen.getByTestId('log-container')).toBeVisible();
      expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
    });

    const hideLogsButton = screen.getByRole('button', { name: /hide logs/i });
    fireEvent.click(hideLogsButton);

    await waitFor(() => {
      expect(mockStopLogStream).toHaveBeenCalledWith(mockContainer.id);
      expect(screen.queryByTestId('log-container')).not.toBeInTheDocument();
    });

    // Test close button within LogContainer mock
    fireEvent.click(screen.getByRole('button', { name: /show logs/i })); // Show again
     await waitFor(() => {
      expect(screen.getByTestId('log-container')).toBeVisible();
    });
    const closeButtonInLogContainer = within(screen.getByTestId('log-container')).getByRole('button', { name: /close logs/i });
    fireEvent.click(closeButtonInLogContainer);

    await waitFor(() => {
      expect(mockStopLogStream).toHaveBeenCalledWith(mockContainer.id);
      expect(screen.queryByTestId('log-container')).not.toBeInTheDocument();
    });
  });

  test('4. Pause and Resume functionality', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        actionInProgress={null}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    fireEvent.click(showLogsButton);
    await waitFor(() => expect(screen.getByTestId('log-container')).toBeVisible());

    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Initial log\n');
    });
    await waitFor(() => expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('Initial log'));

    // Pause logs
    const pauseButton = within(screen.getByTestId('log-container')).getByRole('button', { name: /pause/i });
    fireEvent.click(pauseButton);

    await waitFor(() => {
      // LogContainer should still be visible
      expect(screen.getByTestId('log-container')).toBeVisible();
      // stopLogStream is called when pausing
      expect(mockStopLogStream).toHaveBeenCalledWith(mockContainer.id);
      expect(screen.getByText('Stream Active: No')).toBeInTheDocument(); // Check UI reflects paused stream
    });

    // Try sending more logs while paused
    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Log while paused\n');
    });

    // Logs should NOT update because isLogVisibleRef.current would be true, but onLogUpdate in ContainerRow
    // updates `logs` state. However, the stream is stopped, so new logs shouldn't arrive from the source.
    // The critical part is that `startLogStream` is not called again if already paused.
    // Our mock `onLogUpdateCallback` bypasses the actual stream, so we check if the content *doesn't* change.
    await waitFor(() => expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('Initial log'));
    expect(screen.getByTestId('log-container').querySelector('pre')).not.toHaveTextContent('Log while paused');


    // Resume logs
    const resumeButton = within(screen.getByTestId('log-container')).getByRole('button', { name: /resume/i });
    fireEvent.click(resumeButton);

    await waitFor(() => {
        // startLogStream is called when resuming
        expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
        expect(screen.getByText('Stream Active: Yes')).toBeInTheDocument();
    });

    // Send logs after resuming
    act(() => {
      // Note: When resuming, logs are cleared and restarted.
      mockOnLogUpdateCallback!(mockContainer.id, 'Log after resume\n');
    });

    await waitFor(() => {
      expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('Log after resume');
      // Initial log should be cleared
      expect(screen.getByTestId('log-container').querySelector('pre')).not.toHaveTextContent('Initial log');
    });
  });

  test('5. isLoading state is handled', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        actionInProgress={null}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    fireEvent.click(showLogsButton);

    await waitFor(() => {
      expect(screen.getByTestId('log-container')).toBeVisible();
      // LogContainer's mock displays "Loading logs..." when isLoading is true
      expect(within(screen.getByTestId('log-container')).getByText('Loading logs...')).toBeInTheDocument();
    });

    // Simulate receiving first log update
    act(() => {
      if (mockOnLogUpdateCallback) {
        mockOnLogUpdateCallback(mockContainer.id, 'First log line\n');
      }
    });

    await waitFor(() => {
      // Loading message should disappear after logs are received
      expect(within(screen.getByTestId('log-container')).queryByText('Loading logs...')).not.toBeInTheDocument();
      expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('First log line');
    });
  });

  test('Handles onError callback from useWebSocket', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        actionInProgress={null}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    fireEvent.click(showLogsButton);

    await waitFor(() => {
      expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
      expect(screen.getByTestId('log-container')).toBeVisible();
      // Initial loading state
      expect(screen.getByText('Loading logs...')).toBeInTheDocument();
    });

    expect(mockOnErrorCallback).not.toBeNull();
    act(() => {
      mockOnErrorCallback!('Simulated WebSocket Error');
    });

    await waitFor(() => {
      // Loading message should disappear even on error
      expect(screen.queryByText('Loading logs...')).not.toBeInTheDocument();
      // Potentially show an error message or just stop loading, depending on implementation
      // For now, we check that loading is false.
    });

    // Test retry logic (waits 2s then calls startLogStream)
    jest.useFakeTimers();
    act(() => {
        mockOnErrorCallback!('Another Error to trigger retry');
    });

    // Fast-forward time by 2 seconds
    act(() => {
        jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
        // Check if startLogStream was called again (it's called once initially, then once for retry)
        expect(mockStartLogStream).toHaveBeenCalledTimes(2);
    });
    jest.useRealTimers();

  });
});

// Need to import `within` for querying inside LogContainer mock
import { within } from '@testing-library/react';
