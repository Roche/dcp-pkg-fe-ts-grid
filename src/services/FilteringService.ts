import { BehaviorSubject } from "rxjs";
import type { GridService } from "../GridService";
import type { CellValue, Column, GlobalSearchMode, GlobalSearchOptions, GlobalSearchState, Row } from "../types/grid";
import { FilterCondition, FilterNode, evaluateFilterTree } from "@open-dcp/filter";
import { logger } from '@open-dcp/utilities';

export class FilteringService {
    private readonly gridService: GridService;
    private readonly filteredIndexes$: BehaviorSubject<number[] | null> = new BehaviorSubject<number[] | null>(null);
    private filterTree: FilterNode | null = null;
    private globalSearch: GlobalSearchState | null = null;
    private searchableTextCache: string[] | null = null;
    private cacheSignature: string | null = null;

    constructor(gridService: GridService, filterTree: FilterNode | null = null) {
        this.gridService = gridService;
        this.filterTree = filterTree;
    }

    private getColumnKeys(node: FilterNode): (string | number)[] {
        if (node.type === 'condition') return [node.columnKey];
        if (node.type === 'group') {
            return node.filters.reduce<(string | number)[]>((acc, filter) => {
                return acc.concat(this.getColumnKeys(filter));
            }, []);
        }
        return [];
    }

    setFilterTree(tree: FilterNode | null) {
        this.filterTree = tree;
        this.updateFilterIndexes();
    }

    getFilterTree(): FilterNode | null {
        return this.filterTree;
    }

    setGlobalSearch(query: string, options?: GlobalSearchOptions): void {
        const normalizedQuery = query.trim();

        if (normalizedQuery.length === 0) {
            this.globalSearch = null;
            this.updateFilterIndexes();
            return;
        }

        this.globalSearch = {
            query: normalizedQuery,
            options: options ? { ...options } : undefined,
        };

        this.updateFilterIndexes();
    }

    clearGlobalSearch(): void {
        this.globalSearch = null;
        this.updateFilterIndexes();
    }

    getGlobalSearch(): GlobalSearchState | null {
        return this.globalSearch;
    }

    updateFilterIndexesForUpdatedData() {
        this.invalidateSearchCache();
        this.updateFilterIndexes();
    }

    private invalidateSearchCache(): void {
        this.searchableTextCache = null;
        this.cacheSignature = null;
    }

    private getSearchColumns(options?: GlobalSearchOptions): Column[] {
        const allColumns = this.gridService.getColumns();

        if (options?.columns && options.columns.length > 0) {
            const keySet = new Set(options.columns);
            const filteredColumns = allColumns.filter((column) => keySet.has(column.key));

            if (filteredColumns.length === 0) {
                logger.warn('DcpGrid: Global search columns do not match any configured columns');
            }

            return filteredColumns;
        }

        return allColumns;
    }

    private toSearchValue(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        return String(value);
    }

    private getCellSearchValue(row: Row, column: Column, searchMode: GlobalSearchMode): string {
        const columnKey = column.key;
        const cell = row[columnKey];
        const mappedCell = (cell && typeof cell === 'object') ? (cell as unknown as Record<string, unknown>) : null;

        if (typeof column.globalSearchText === 'function') {
            const customValue = column.globalSearchText(mappedCell as CellValue | null, row, searchMode);
            const customText = this.toSearchValue(customValue);
            if (customText.length > 0) {
                return customText;
            }
        }

        if (mappedCell) {

            if (searchMode === 'raw' && 'raw' in mappedCell) {
                return this.toSearchValue(mappedCell.raw);
            }

            if (searchMode === 'display') {
                if ('display' in mappedCell) {
                    const displayText = this.toSearchValue(mappedCell.display);
                    if (displayText.length > 0) {
                        return displayText;
                    }
                }

                const formattedDisplay = this.gridService.getCellDisplayValue(row, columnKey);
                if (formattedDisplay.length > 0) {
                    return formattedDisplay;
                }

                if ('value' in mappedCell) {
                    return this.toSearchValue(mappedCell.value);
                }
                if ('raw' in mappedCell) {
                    return this.toSearchValue(mappedCell.raw);
                }
            }

            if ('value' in mappedCell) {
                return this.toSearchValue(mappedCell.value);
            }
            if ('raw' in mappedCell) {
                return this.toSearchValue(mappedCell.raw);
            }
        }

        return this.toSearchValue(cell);
    }

    private getCacheSignature(columns: Column[], caseInsensitive: boolean, searchMode: GlobalSearchMode): string {
        const columnKeys = columns.map((column) => String(column.key));
        return `${columnKeys.join('|')}::${caseInsensitive ? 'i' : 's'}::${searchMode}`;
    }

    private ensureSearchCache(rows: Row[], columns: Column[], caseInsensitive: boolean, searchMode: GlobalSearchMode): void {
        const signature = this.getCacheSignature(columns, caseInsensitive, searchMode);

        if (
            this.searchableTextCache !== null &&
            this.cacheSignature === signature &&
            this.searchableTextCache.length === rows.length
        ) {
            return;
        }

        this.searchableTextCache = rows.map(row => {
            const baseText = columns
                .map(column => this.getCellSearchValue(row, column, searchMode))
                .join(' ');

            return caseInsensitive ? baseText.toLowerCase() : baseText;
        });
        this.cacheSignature = signature;
    }

    private matchesFilterTree(row: Row): boolean {
        if (!this.filterTree) {
            return true;
        }

        return evaluateFilterTree(this.filterTree, row, {
            caseInsensitive: this.gridService.gridOptions.caseInsensitiveFiltering ?? false,
        });
    }

    hasFilter(columnKey: string | number): boolean {
        const checkNode = (node: FilterNode): boolean => {
            if (node.type === 'condition') {
                return node.columnKey === columnKey;
            }
            if (node.type === 'group') {
                return node.filters.some(checkNode);
            }
            return false;
        };

        if (!this.filterTree) return false;
        return checkNode(this.filterTree);
    }

    addFilter(filterNode: FilterNode): void {
        const columnKeys = this.getColumnKeys(filterNode);

        // Start with existing filters (if any)
        let newFilters: FilterNode[] = [];
        if (this.filterTree && this.filterTree.type === 'group') {
            // Remove all filters for the affected column(s)
            newFilters = this.filterTree.filters.filter(f => {
                let keys: (string | number)[];
                if (f.type === 'condition') {
                    keys = [f.columnKey];
                } else if (f.type === 'group') {
                    keys = f.filters.reduce<(string | number)[]>((acc, ff) => {
                        if (ff.type === 'condition') {
                            acc.push(ff.columnKey);
                        }
                        return acc;
                    }, []);
                } else {
                    keys = [];
                }
                return !keys.some(k => columnKeys.includes(k));
            });
        }

        // Add the new filter node
        newFilters.push(filterNode);

        // Set the new filter tree
        this.setFilterTree({
            type: 'group',
            operator: 'and',
            filters: newFilters
        });
    }

    resetFilters(): void {
        this.setFilterTree(null);
    }

    resetFilter(columnKey: string | number): void {
        if (!this.filterTree || this.filterTree.type !== 'group') return;

        // Remove any filter node (condition or group) that applies to this column
        const newFilters = this.filterTree.filters.filter(
            f => !this.getColumnKeys(f).includes(columnKey)
        );

        // If no filters left, set to null
        if (newFilters.length === 0) {
            this.setFilterTree(null);
        } else {
            this.setFilterTree({
                ...this.filterTree,
                filters: newFilters
            });
        }
    }

    getFilterIndexes(): number[] | null {
        return this.filteredIndexes$.getValue();
    }

    getFilters(): FilterCondition[] {
        if (!this.filterTree || this.filterTree.type !== 'group') return [];
        return this.filterTree.filters.filter(
            f => f.type === 'condition'
        ) as FilterCondition[];
    }

    private updateFilterIndexes(): void {
        const rows = this.gridService.getRows();

        if (!this.gridService.shouldApplyClientSideFiltering()) {
            this.filteredIndexes$.next(null);
            this.gridService.setIndexMapping(
                new Map([...Array(rows.length).keys()].map(i => [i, i]))
            );
            this.gridService.updateRenderedRows();
            return;
        }

        if (!this.filterTree && !this.globalSearch) {
            // No filters: show all rows, identity mapping
            this.filteredIndexes$.next(null);
            this.gridService.setIndexMapping(
                new Map([...Array(this.gridService.rowCount()).keys()].map(i => [i, i]))
            );
            return;
        }

        let globalSearchQuery: string | null = null;
        if (this.globalSearch) {
            const columns = this.getSearchColumns(this.globalSearch.options);
            const caseInsensitive = this.globalSearch.options?.caseInsensitive ?? this.gridService.gridOptions.caseInsensitiveFiltering ?? false;
            const searchMode = this.globalSearch.options?.searchMode ?? 'value';
            globalSearchQuery = caseInsensitive ? this.globalSearch.query.toLowerCase() : this.globalSearch.query;

            this.ensureSearchCache(rows, columns, caseInsensitive, searchMode);
        }

        // Find all matching row indexes using both filter tree and global search.
        const matchingIndexes = rows
            .map((row, idx) => {
                const matchesTree = this.matchesFilterTree(row);
                if (!matchesTree) {
                    return -1;
                }

                if (!globalSearchQuery) {
                    return idx;
                }

                const searchableText = this.searchableTextCache?.[idx] ?? '';
                return searchableText.includes(globalSearchQuery) ? idx : -1;
            })
            .filter(idx => idx !== -1);

        // Update index mapping for performance and downstream features
        this.gridService.clearIndexMap();
        matchingIndexes.forEach((originalIdx, filteredIdx) => {
            this.gridService.setIndexMappingValue(filteredIdx, originalIdx);
        });

        this.filteredIndexes$.next(matchingIndexes);
    }

    applyFilter(rows: Row[]): Row[] {
        const filteredIndexes = this.filteredIndexes$.getValue();

        if (filteredIndexes === null) {
            return rows;
        }

        this.gridService.clearIndexMap();
        filteredIndexes.forEach((filteredIndex, i) => {
            this.gridService.setIndexMappingValue(i, filteredIndex);
        });

        return filteredIndexes.map(index => rows[index]);
    }
}
