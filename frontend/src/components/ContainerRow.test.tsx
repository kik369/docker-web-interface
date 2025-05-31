import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react'; // Removed fireEvent
import userEvent from '@testing-library/user-event'; // Added userEvent
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

// Re-defining the mock for LogContainer
interface MockLogContainerProps {
  logs: string;
  isLoading: boolean;
  containerId: string;
  containerName?: string;
  onClose: () => void;
  isStreamActive: boolean;
  isPaused: boolean;
  onPauseToggle: () => void;
}
jest.mock('./LogContainer', () => {
  const MockedLogContainer: React.FC<MockLogContainerProps> = ({ logs, isLoading, onPauseToggle, isPaused, isStreamActive, onClose }) => (
    <div data-testid="log-container">
      {isLoading && <p>Loading logs...</p>}
      <pre>{logs}</pre>
      <button onClick={onPauseToggle}>{isPaused ? 'Resume' : 'Pause'}</button>
      <button onClick={onClose}>Close Logs</button>
      <p>Stream Active: {isStreamActive ? 'Yes' : 'No'}</p>
    </div>
  );
  return MockedLogContainer;
});

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
    mockLocalStorageGetItem = jest.spyOn(Storage.prototype, 'getItem');
    mockLocalStorageGetItem.mockReturnValue('false'); // Default for most tests

    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(jest.fn());
  });

  afterEach(() => {
    // Clear all mocks, including spies, to ensure clean state between tests
    jest.restoreAllMocks();
  });

  let mockLocalStorageGetItem: jest.SpyInstance;

  test('1. Clicking "Show Logs" should call startLogStream and display LogContainer', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        actionInProgress={null}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    await userEvent.click(showLogsButton);

    // Check if the button text changed, which means isLogVisible is true
    const hideLogsButton = await screen.findByRole('button', { name: /hide logs/i });
    expect(hideLogsButton).toBeInTheDocument();

    // If "Hide Logs" button is found, then isLogVisible must be true.
    // Then, the log-section-wrapper should also be there.
    const logWrapper = await screen.findByTestId('log-section-wrapper');
    expect(logWrapper).toBeInTheDocument();

    const logContainerElement = await within(logWrapper).findByTestId('log-container');
    expect(logContainerElement).toBeVisible();

    expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);

    expect(within(logContainerElement).getByText('Loading logs...')).toBeInTheDocument();
  });

  test('2. When onLogUpdate is called, logs are passed to LogContainer', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        actionInProgress={null}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    await userEvent.click(showLogsButton); // Changed to userEvent.click

    // Ensure the log section is visible before trying to update logs
    expect(await screen.findByTestId('log-section-wrapper')).toBeInTheDocument();
    expect(await screen.findByTestId('log-container')).toBeVisible();
    expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);

    expect(mockOnLogUpdateCallback).not.toBeNull();
    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Log line 1\n');
    });

    await waitFor(() => {
        const preElement = screen.getByTestId('log-container').querySelector('pre');
        expect(preElement).toHaveTextContent(/Log line 1/);
    });

    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Log line 2\n');
    });

    await waitFor(() => {
      const preElement = screen.getByTestId('log-container').querySelector('pre');
      // Check for both lines, allowing for whitespace differences / newlines
      expect(preElement).toHaveTextContent(/Log line 1/);
      expect(preElement).toHaveTextContent(/Log line 2/);
      // More specific check for exact content if needed, ensuring newlines are handled by the matcher
      expect(preElement?.innerHTML).toContain('Log line 1\n');
      expect(preElement?.innerHTML).toContain('Log line 2\n');
    });
  });

  test('3. Clicking "Hide Logs" should call stopLogStream and hide LogContainer', async () => {
    // Set localStorage to initially show logs for this test
    mockLocalStorageGetItem.mockImplementation((key: string) =>
      key === `dockerWebInterface_logsViewed_${mockContainer.id}` ? 'true' : 'false'
    );

    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        actionInProgress={null}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    // Logs should be visible initially due to localStorage mock
    const logWrapperInitially = await screen.findByTestId('log-section-wrapper');
    expect(logWrapperInitially).toBeInTheDocument();
    const logContainerInitially = await screen.findByTestId('log-container');
    expect(logContainerInitially).toBeVisible();
    expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
    // isLoadingLogs should be true initially
    expect(within(logContainerInitially).getByText('Loading logs...')).toBeInTheDocument();

    // Simulate log arrival to set isLoadingLogs to false and potentially settle effects
    act(() => {
      if (mockOnLogUpdateCallback) {
        mockOnLogUpdateCallback(mockContainer.id, "Log line 1\n");
      }
    });

    // Wait for isLoadingLogs to become false and UI to update
    await waitFor(() => {
      expect(within(logContainerInitially).queryByText('Loading logs...')).not.toBeInTheDocument();
    });

    // Ensure actualStreamIsRunning.current has had a chance to be set to true
    // This waitFor is to ensure React has processed state changes and effects from the log update.
    await waitFor(() => {
      expect(within(logContainerInitially).getByText(/Stream Active: Yes/i)).toBeInTheDocument();
    });

    const hideLogsButton = screen.getByRole('button', { name: /hide logs/i });
    await userEvent.click(hideLogsButton);

    await waitFor(() => {
      expect(mockStopLogStream).toHaveBeenCalledWith(mockContainer.id);
    });
    expect(screen.queryByTestId('log-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-section-wrapper')).not.toBeInTheDocument();


    // Test close button within LogContainer mock (re-opening logs first)
    const showLogsButtonAgain = screen.getByRole('button', { name: /show logs/i });
    await userEvent.click(showLogsButtonAgain);

    const logContainerSecondTime = await screen.findByTestId('log-container');
    expect(logContainerSecondTime).toBeVisible();
    // startLogStream would be called again. Let's clear mocks for a clean check or check call count.
    // For simplicity here, we assume previous calls are fine. We are testing the close button now.
    // mockStartLogStream.mockClear(); // Option: clear mock for specific call count check

    act(() => { // Simulate logs arriving for the re-opened container
      if (mockOnLogUpdateCallback) {
        mockOnLogUpdateCallback(mockContainer.id, "More logs\n");
      }
    });
    await waitFor(() => { // Wait for "Loading" to disappear
        expect(within(logContainerSecondTime).queryByText('Loading logs...')).not.toBeInTheDocument();
    });


    const closeButtonInLogContainer = within(logContainerSecondTime).getByRole('button', { name: /close logs/i });
    await userEvent.click(closeButtonInLogContainer);

    await waitFor(() => {
      // stopLogStream should be called (again, or check total calls if not cleared)
      expect(mockStopLogStream).toHaveBeenCalledWith(mockContainer.id);
    });
    expect(screen.queryByTestId('log-container')).not.toBeInTheDocument();
  });

  test('4. Pause and Resume functionality', async () => {
    renderWithProviders(
      <ContainerRow
        container={mockContainer}
        onAction={jest.fn()}
        actionInProgress={null}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    await userEvent.click(showLogsButton); // Changed to userEvent.click
    expect(await screen.findByTestId('log-section-wrapper')).toBeInTheDocument();
    expect(await screen.findByTestId('log-container')).toBeVisible();

    act(() => {
      mockOnLogUpdateCallback!(mockContainer.id, 'Initial log\n');
    });
    await waitFor(() => expect(screen.getByTestId('log-container').querySelector('pre')).toHaveTextContent('Initial log'));

    // Pause logs
    const pauseButton = within(screen.getByTestId('log-container')).getByRole('button', { name: /pause/i });
    await userEvent.click(pauseButton); // Changed to userEvent.click

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
    // Our mock `onLogUpdateCallback` bypasses the actual stream.
    // The important part is that stopLogStream was called. New logs from source would not arrive.
    // If we manually call mockOnLogUpdateCallback, the logs *will* update in the state as isLogVisible is still true.
    // So, we don't assert that "Log while paused" is NOT there if we force the callback.
    // The key check is that stopLogStream was called and UI reflects inactive stream.

    // Resume logs
    const resumeButton = within(screen.getByTestId('log-container')).getByRole('button', { name: /resume/i });
    await userEvent.click(resumeButton); // Changed to userEvent.click

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
        actionInProgress={null}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    await userEvent.click(showLogsButton); // Changed to userEvent.click

    expect(await screen.findByTestId('log-section-wrapper')).toBeInTheDocument();
    expect(await screen.findByTestId('log-container')).toBeVisible();
    // LogContainer's mock displays "Loading logs..." when isLoading is true
    expect(within(screen.getByTestId('log-container')).getByText('Loading logs...')).toBeInTheDocument();

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
        actionInProgress={null}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const showLogsButton = screen.getByRole('button', { name: /show logs/i });
    await userEvent.click(showLogsButton); // Changed to userEvent.click

    expect(await screen.findByTestId('log-section-wrapper')).toBeInTheDocument();
    expect(await screen.findByTestId('log-container')).toBeVisible();
    expect(mockStartLogStream).toHaveBeenCalledWith(mockContainer.id);
    // Initial loading state
    expect(screen.getByText('Loading logs...')).toBeInTheDocument();

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
