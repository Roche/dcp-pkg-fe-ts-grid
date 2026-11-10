import type { GridService } from "../GridService";

export class RowHeightService {
    private rowHeights: Map<number, number> = new Map();
    private heightCache: number[] = [];
    private readonly gridService: GridService;

    constructor(gridService: GridService) {
        this.gridService = gridService;
    }

    initRowHeights(numberOfRows: number) {
        this.rowHeights = new Map(
            Array.from({ length: numberOfRows }, (_, index) => [index, this.gridService.elementHeight])
        );
    }

    getRowHeight(index: number): number {
        return this.rowHeights.get(index) ?? this.gridService.elementHeight
    }

    getHeightCache(): number[] {
        return this.heightCache;
    }

    updateRowHeight(index: number, height: number) {
        this.rowHeights.set(index, height);
        this.recalculateHeights();
    }

    recalculateHeights() {
        let filteredRows = this.gridService.getFilterIndexes();

        this.heightCache = [];
        let sum = 0;
        for (let i = 0; i < this.gridService.rowCount(); i++) {
            let rowIndex = filteredRows ? filteredRows[i] : i;
            sum += this.getRowHeight(rowIndex);
            this.heightCache.push(sum);
        }
    }

    updateRowHeights() {
        let container = this.gridService.getContainer();
        if (!container) return;

        const rows = container.querySelectorAll('tbody > tr:not(.firstRow):not(.lastRow)'); // Adjust the selector as needed

        let hasUpdated = false;

        rows.forEach((row, index) => {
            const rowHeight = row.getBoundingClientRect().height; // Get the actual row height
            const rowIndex = index + this.gridService.startIndex;

            if (this.getRowHeight(rowIndex) !== rowHeight) {
                this.updateRowHeight(rowIndex, rowHeight);
                hasUpdated = true;
            }
        });

        if (hasUpdated) {
            this.gridService.updateRenderedRows();
        }
    } 

    findStartIndex(scrollTop: number): number {
        let index = 0;
        while (index < this.heightCache.length && this.heightCache[index] < scrollTop) {
            index++;
        }
        return Math.max(0, index);
    }

    findEndIndex(scrollBottom: number): number {
        let index = 0;
        while (index < this.heightCache.length && this.heightCache[index] < scrollBottom) {
            index++;
        }
        return Math.min(index, this.heightCache.length - 1)
    }
}