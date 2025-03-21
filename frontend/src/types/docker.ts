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
    isHighlighted?: boolean;
    highlightTimestamp?: number;
}

export interface SortConfig {
    key: keyof Container | null;
    direction: 'asc' | 'desc';
}

export interface Image {
    id: string;
    tags: string[];
    size: number;
    created: string;
    repo_digests: string[];
    parent_id: string;
    labels: Record<string, string>;
}

export interface ImageListProps {
    images: Image[];
    isLoading: boolean;
    error: string | null;
}
