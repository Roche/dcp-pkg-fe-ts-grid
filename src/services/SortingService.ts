import type { GridService } from "../GridService.js";
import type { Row } from "../types/grid.js";
import { SortingCondition } from '../types/sorting.js';

export class SortingService {
    private readonly gridService: GridService;
    private readonly sortConditions: SortingCondition[];
    /**
     * Sorted positions (within the filtered rows) plus the inputs they were computed from. The cache is
     * only reused for the same source rows and the same filter result, so new data or a changed
     * filter/search always re-sorts (previously keyed on the row count only).
     */
    private cache: { rows: Row[]; filterIndexes: number[] | null; sortedIndexes: number[] } | null = null;

    constructor(gridService: GridService, sortConditions: SortingCondition[] = []) {
        this.gridService = gridService;
        this.sortConditions = sortConditions;
    }

    getSorts(): SortingCondition[]
    {
        return this.sortConditions;
    }

    getSortCondition(columnKey: string | number): SortingCondition[] {
        return this.sortConditions.filter(condition => columnKey === condition.columnKey);
    }

    toggleSort(columnKey: string | number): void {
        const existingIndex = this.sortConditions.findIndex(condition => condition.columnKey === columnKey);

        if (existingIndex === -1) {
            this.sortConditions.push({ columnKey, direction: 'asc' });
        } else {
            switch (this.sortConditions[existingIndex].direction) {
                case 'asc':
                    this.sortConditions[existingIndex].direction = 'desc'
                    break;
                case 'desc':
                    this.sortConditions.splice(existingIndex, 1)
                    break;
            }
        }

        this.cache = null;
    }

    /**
     * Sorts the (already filtered) rows and rebuilds the grid's index mapping view position → original
     * row index on every call, also when the cached order is reused or no sort is active.
     */
    applySorting(rows: Row[]): Row[] {
        const filterIndexes = this.gridService.getFilterIndexes();
        const toOriginalIndex = (position: number) => filterIndexes ? filterIndexes[position] : position;

        if (this.sortConditions.length === 0) {
            this.cache = null;
            this.gridService.setIndexMapping(new Map(rows.map((_, i) => [i, toOriginalIndex(i)])));
            return rows;
        }

        const sourceRows = this.gridService.getRows();
        if (
            !this.cache ||
            this.cache.rows !== sourceRows ||
            this.cache.filterIndexes !== filterIndexes ||
            this.cache.sortedIndexes.length !== rows.length
        ) {
            this.cache = {
                rows: sourceRows,
                filterIndexes,
                sortedIndexes: this.computeSortedIndexes(rows)
            };
        }

        const sortedIndexes = this.cache.sortedIndexes;
        this.gridService.setIndexMapping(new Map(sortedIndexes.map((position, i) => [i, toOriginalIndex(position)])));
        return sortedIndexes.map(position => rows[position]);
    }

    private computeSortedIndexes(rows: Row[]): number[] {
        const indexedRows = rows.map((row, index) => ({ row, index }));

        indexedRows.sort((a, b) => {
            for (const { columnKey, direction } of this.sortConditions) {
                const valueA = a.row[columnKey].value;
                const valueB = b.row[columnKey].value;

                let comparison = 0;

                if (typeof valueA === 'string' && typeof valueB === 'string') {
                    comparison = valueA.localeCompare(valueB);
                } else if (typeof valueA === 'number' && typeof valueB === 'number') {
                    comparison = valueA - valueB;
                } else if (valueA instanceof Date && valueB instanceof Date) {
                    comparison = valueA.getTime() - valueB.getTime();
                } else {
                    comparison = String(valueA).localeCompare(String(valueB));
                }

                if (direction === 'desc') {
                    comparison = -comparison;
                }

                if (comparison !== 0) {
                    return comparison;
                }
            }

            return 0; // Keep stable sorting
        });

        return indexedRows.map(item => item.index);
    }

    getSortedIndexes(): number[] | null {
        return this.cache?.sortedIndexes ?? null;
    }

    resetSorting() {
        this.cache = null;
    }
}
