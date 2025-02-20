export interface Container {
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    created: string;
    ports: string;
    compose_project: string | null;
    compose_service: string | null;
}

export interface ContainerDetails extends Container {
    command?: string;
    size?: string;
    mounts?: string;
    networks?: string;
    platform?: string;
    driver?: string;
    localVolumes?: string;
    labels?: string;
    networkMode?: string;
    imageId?: string;
    runtime?: string;
}

export interface ApiResponse<T> {
    data: T;
    status: 'success' | 'error';
    timestamp: string;
    error?: string;
}

export interface ContainerListProps {
    containers: Container[];
    isLoading: boolean;
    error: string | null;
}

export interface ContainerRowProps {
    container: Container;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onAction: (containerId: string, action: string) => Promise<void>;
    actionInProgress: string | null;
}

export interface SortConfig {
    key: keyof Container | null;
    direction: 'asc' | 'desc';
}
