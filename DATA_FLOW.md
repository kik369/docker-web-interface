# Application Data Flow

This document details the data flow within the Docker Web Interface application, illustrating how information moves between components.

## Core Data Flow Diagram

```mermaid
flowchart TD
    Client[Frontend Client] <--> |HTTP/REST API| Flask[Flask Backend Server]
    Client <--> |WebSocket| Flask

    Flask --> |Docker SDK| DockerEngine[Docker Engine]
    DockerEngine --> |Events| Flask
    DockerEngine --> |Container Data| Flask
    DockerEngine --> |Image Data| Flask
    DockerEngine --> |Log Streams| Flask

    subgraph "Frontend Application"
        Client
        ReactComponents[React Components]
        WebSocketHook[WebSocket Hook]
        RestAPI[REST API Service]

        Client --> ReactComponents
        ReactComponents --> WebSocketHook
        ReactComponents --> RestAPI
        WebSocketHook --> Client
        RestAPI --> Client
    end

    subgraph "Backend Server"
        Flask
        DockerService[Docker Service]
        WebSocketManager[WebSocket Manager]

        Flask --> DockerService
        Flask --> WebSocketManager
        DockerService --> Flask
        WebSocketManager --> Flask
    end

    Database[(SQLite Database)] <--> Flask
```

## Container Operations Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend UI
    participant API as Backend API
    participant Docker as Docker Engine

    User->>UI: Click container action
    UI->>API: POST /api/containers/{id}/{action}
    API->>Docker: Container SDK operation
    Docker-->>API: Operation result
    API-->>UI: Response (JSON)
    UI-->>User: Show operation result

    Docker->>API: Container state change event
    Note right of Docker: Asynchronous event
    API->>UI: WebSocket: container_state_change
    UI->>User: Update UI state
```

## Log Streaming Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend UI
    participant Socket as WebSocket Server
    participant Docker as Docker Engine

    User->>UI: View container logs
    UI->>Socket: Emit: start_log_stream
    Socket->>Docker: Request container logs stream

    loop Log streaming
        Docker-->>Socket: Log line
        Socket-->>UI: Event: log_update
        UI-->>User: Display log
    end

    User->>UI: Close logs
    UI->>Socket: Emit: stop_log_stream
    Socket->>Docker: Close log stream
    Socket-->>UI: Event: log_stream_stopped
```

## Initial Connection Flow

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Docker

    Client->>Server: Connect WebSocket
    Server->>Docker: Get all containers
    Docker-->>Server: Container list
    Server-->>Client: Event: connection_established
    Server-->>Client: Event: initial_state

    Client->>Client: Render containers
```

## Resource Usage Metrics Flow

```mermaid
flowchart LR
    Docker[Docker Engine] -->|Container Stats| Backend[Backend Server]
    Backend -->|Process & Store| Database[(SQLite Database)]
    Backend -->|API Response| Frontend[Frontend Client]
    Frontend -->|API Request| Backend
    Backend -->|Query| Database
    Database -->|Results| Backend
```

## Error Handling Flow

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Docker

    Client->>Server: API Request or WebSocket Event

    alt Successful Operation
        Server->>Docker: Docker SDK Operation
        Docker-->>Server: Result
        Server-->>Client: Success Response
    else Error in Docker Operation
        Server->>Docker: Docker SDK Operation
        Docker-->>Server: Error
        Server-->>Client: Error Response
        Client->>Client: Display Error
    else Connection Error
        Server->>Docker: Docker SDK Operation
        Note right of Server: Connection fails
        Server-->>Client: Error Response
        Client->>Client: Display Error & Retry Options
    end
```

## Data Transformation Flow

```mermaid
flowchart TB
    DockerAPI[Docker API] -->|Raw Container Data| BackendParser[Backend Parser]
    DockerAPI -->|Raw Image Data| BackendParser
    BackendParser -->|Structured Data| APIResponse[API Response]
    APIResponse -->|JSON| Frontend[Frontend]
    Frontend -->|Parse JSON| UIStore[UI State Store]
    UIStore -->|Render Data| Components[UI Components]

    subgraph "Data Transformation"
        direction TB
        RawData[Raw Docker Data] --> FilterData[Filter Relevant Fields]
        FilterData --> FormatData[Format for Frontend]
        FormatData --> EnrichData[Enrich with Additional Info]
    end
```

## Authentication Flow (Future)

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Auth as Auth Service

    User->>Frontend: Login Credentials
    Frontend->>Backend: Authentication Request
    Backend->>Auth: Validate Credentials
    Auth-->>Backend: Auth Token
    Backend-->>Frontend: Token & User Info
    Frontend->>Frontend: Store Token

    Note right of Frontend: Subsequent Requests
    Frontend->>Backend: API Request + Auth Token
    Backend->>Backend: Validate Token
    Backend-->>Frontend: Protected Resource
```
