export interface SortingCondition {
    columnKey: string | number;
    direction: 'asc' | 'desc';
}

export interface ApiModeConfig {
    clientSideSort?: boolean;  // If true, sorting happens client-side
    clientSideFilter?: boolean; // If true, filtering happens client-side
}