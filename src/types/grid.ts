import type { FilterNode } from '@open-dcp/filter';
import type { SortingCondition } from './sorting';

export type ColumnType = 'string' | 'integer' | 'number' | 'date' | 'datetime' | 'duration' | 'custom' | 'component' | 'enum';
export type GlobalSearchMode = 'value' | 'raw' | 'display';

export interface FilterOption {
    label: string;
    value: string | number | boolean;
}

export interface Column {
    label: string;
    style?: string;
    key: string | number;
    type: ColumnType;
    renderCell?: (cellValue: CellValue, row: Row) => string | HTMLElement;  // Function-based renderer
    displayAsHtml?: boolean;
    component?: any; // Placeholder for a component (framework-specific)
    componentPropsMapper?: (cellValue: CellValue, row: Row) => Record<string, any>; // Function to map cell values to component props
    globalSearchText?: (cellValue: CellValue | null, row: Row, mode: GlobalSearchMode) => string | number | boolean | null | undefined;
    transformer?: (rawValue: any) => string | number | boolean;
    filterOptions?: FilterOption[]; // Options for enum filter type
}

export interface Row {
    [key: string]: CellValue;
}

export interface RenderRow {
    globaIndex: number;
    data: Row;
}

export interface CellValue {
    raw: any;       // The original unmodified value.
    value: any; // The transformed value (for sorting, filtering).
    display?: string | null; // The display value (formatted for rendering).
    renderedElement?: HTMLElement;
}

export interface GridState {
    startIndex: number;
    step: number;
    firstRowHeight: number;
    lastRowHeight: number;
    renderRows: RenderRow[];
}

export interface DisplayFormat {
    timeZone: string;
    dateFormat: string;
    timeFormat: string;
}

export interface DisplayValue {
    display: string | undefined | null;
    renderedElement: HTMLElement | undefined;
}

export interface GlobalSearchOptions {
    columns?: Array<string | number>;
    caseInsensitive?: boolean;
    searchMode?: GlobalSearchMode;
}

export interface GlobalSearchState {
    query: string;
    options?: GlobalSearchOptions;
}

export interface FilterSortUpdatePayload {
    filterTree: FilterNode | null;
    sorts: SortingCondition[];
    globalSearch?: GlobalSearchState | null;
}

export interface GridOptions {
    elementHeight: number;
    multiSelect: boolean;
    allSelector: boolean;
    displayFormat: Partial<DisplayFormat>;
    caseInsensitiveFiltering: boolean;
}