// Type declarations for component modules
import { Container } from './docker';

declare module './components/ContainerList' {
    export interface ContainerListProps {
        containers: Container[];
        isLoading: boolean;
        error: string | null;
    }

    export const ContainerList: React.FC<ContainerListProps>;
}

declare module './components/ImageList' {
    export const ImageList: React.FC;
}
