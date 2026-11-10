import type { GridService } from "../GridService";
import type { Row } from "../types/grid";
import { SortingCondition } from '../types/sorting';

export class SortingService {
    private readonly gridService: GridService;
    private readonly sortConditions: SortingCondition[];
    private sortedIndexes: number[] | null = null;

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

        this.sortedIndexes = null;
    }

    applySorting(rows: Row[]): Row[] {    
        if (this.sortConditions.length === 0) {
            return rows;
        }

        if (
            this.sortedIndexes &&
            this.sortedIndexes.length === rows.length &&
            this.sortedIndexes.every(index => index >= 0 && index < rows.length)
        ) {
            return this.sortedIndexes.map(index => rows[index]); // Apply cached order
        }

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

        const filteredIndexes = this.gridService.getFilterIndexes() ?? this.gridService.getRows().map((_, i) => i);;
        
        this.gridService.clearIndexMap(); // Clear the existing mapping
        indexedRows.forEach((indexedRow, i) => {
            this.gridService.setIndexMappingValue(i, filteredIndexes[indexedRow.index]); // Map the sorted index to the original index
        });

        this.sortedIndexes = indexedRows.map(item => item.index);
        return indexedRows.map(item => item.row); // Return sorted rows
    }

    getSortedIndexes(): number[] | null {
        return this.sortedIndexes;
    }

    resetSorting() {
        this.sortedIndexes = null;
    }
}
