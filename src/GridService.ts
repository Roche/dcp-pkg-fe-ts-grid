import { BehaviorSubject, Observable, skip, combineLatest, map } from 'rxjs';
import { isEqual } from 'lodash-es';
import { distinctUntilChanged } from 'rxjs/operators';
import {
    GridState,
    Column,
    Row,
    RenderRow,
    DisplayFormat,
    DisplayValue,
    GridOptions,
    FilterSortUpdatePayload,
    GlobalSearchOptions,
    GlobalSearchState,
} from './types/grid.js';
import { FilterNode } from '@open-dcp/filter';
import { logger } from '@open-dcp/utilities';
import { SortingCondition, ApiModeConfig } from './types/sorting.js';

import { RowHeightService } from './services/RowHeightService.js';
import { SortingService } from './services/SortingService.js';
import { FormattingService } from './services/FormattingService.js';
import { FilteringService } from './services/FilteringService.js';
import { SelectionService } from './services/SelectionService.js';

const DEFAULT_DISPLAY_FORMAT: Required<DisplayFormat> = {
    timeZone: "UTC",
    dateFormat: "yyyy-MM-dd",
    timeFormat: "HH:mm:ss",
};

export class GridService {
    public readonly elementHeight: number;
    public readonly gridOptions: Partial<GridOptions>;

    private readonly rowsSubject: BehaviorSubject<Row[]>;
    private readonly columnsSubject: BehaviorSubject<Column[]>;
    private readonly stateSubject: BehaviorSubject<GridState>;

    public displayFormatSubject: BehaviorSubject<DisplayFormat>;
    public displayFormat$: Observable<DisplayFormat>;
    public rows$: Observable<Row[]>;
    public rowCount$: Observable<number>;
    public columns$: Observable<Column[]>;
    private container: HTMLElement | null = null; // Reference to the scrolling container
    public startIndex: number = 0;
    private firstRowHeight: number = 0;
    private lastRowHeight: number = 0;

    private apiMode: boolean = false;
    private clientSideSort: boolean = false;
    private clientSideFilter: boolean = false;

    private readonly rowHeightService: RowHeightService;
    private readonly sortingService: SortingService;
    private readonly formattingService: FormattingService;
    private readonly filteringService: FilteringService;
    private readonly selectionService: SelectionService;

    private filterSortSubject: BehaviorSubject<FilterSortUpdatePayload>;
    public filterSort$: Observable<FilterSortUpdatePayload>;

    private indexMapping: Map<number, number> = new Map();

    constructor(rows: Row[], columns: Column[], gridOptions: Partial<GridOptions> = {}, sorts: SortingCondition[] = [], filterTree: FilterNode | null = null, selections: Set<number> = new Set()) {

        this.gridOptions = gridOptions;

        this.filterSortSubject = new BehaviorSubject<FilterSortUpdatePayload>({ filterTree, sorts, globalSearch: null });
        this.filterSort$ = this.filterSortSubject.asObservable();

        this.displayFormatSubject = new BehaviorSubject<DisplayFormat>({
            ...DEFAULT_DISPLAY_FORMAT,
            ...gridOptions.displayFormat
        });
        this.displayFormat$ = this.displayFormatSubject.asObservable();

        // Data independend services
        this.formattingService = new FormattingService(this);
        this.rowHeightService = new RowHeightService(this);

        // Set Column
        this.columnsSubject = new BehaviorSubject(columns);
        this.columns$ = this.columnsSubject.asObservable();

        // Format Rows
        let initalRows = rows.map(row => this.formattingService.applyFormattingToRow(row));
        this.rowsSubject = new BehaviorSubject(initalRows);
        this.rows$ = this.rowsSubject.asObservable();
        this.indexMapping = new Map([...Array(initalRows.length).keys()].map(i => [i, i]))

        // Row Count Observable
        this.rowCount$ = combineLatest([
            this.rows$,
            this.filterSort$,
            this.columns$
        ]).pipe(
            map(() => this.rowCount()),
            distinctUntilChanged()
        );

        // Init Data Services
        this.filteringService = new FilteringService(this, filterTree);
        this.sortingService = new SortingService(this, sorts);
        this.selectionService = new SelectionService(selections, gridOptions.multiSelect ?? true);

        this.elementHeight = gridOptions.elementHeight ?? 42;

        this.stateSubject = new BehaviorSubject<GridState>({
            startIndex: 0,
            step: 1,
            firstRowHeight: 0,
            lastRowHeight: 0,
            renderRows: []
        });

        // Reference check only: every setRows() call produces a new (formatted) array, i.e. new data.
        // A deep isEqual over all rows here cost ~150 ms per update at 10k rows x 20 columns.
        this.rows$.pipe(
            skip(1),
            distinctUntilChanged()
        ).subscribe(() => {
            if (this.apiMode) {
                return;
            }

            // Filter indexes must match the new rows before rendering (otherwise stale rows are shown)
            this.filteringService.updateFilterIndexesForUpdatedData();
            this.updateRenderedRows()
            this.rowHeightService.initRowHeights(this.rowCount())
        });

        this.columns$.pipe(
            distinctUntilChanged((prev, curr) => isEqual(curr, prev))
        ).subscribe(() => {
            if (this.getRows().length > 0) {
                this.setRows(this.rowsSubject.getValue());
            }
        });

        this.displayFormat$.subscribe(() => {
            this.updateRenderedRows();
        });
    }

    // API Support
    private notifyFilterSortUpdate() {
        const filterTree = this.filteringService.getFilterTree();
        const sorts = this.sortingService.getSorts();
        const globalSearch = this.filteringService.getGlobalSearch();

        // Always emit to observable
        this.filterSortSubject.next({
            filterTree,
            sorts,
            globalSearch,
        });

        if (this.apiMode && !this.clientSideSort && !this.clientSideFilter) {
            // In API mode or with client-side operations, do not update locally
            return;
        }

        this.updateRenderedRows();
    }

    public enableApiMode(config: ApiModeConfig = {}): void {
        logger.log('DcpGrid: api mode active');
        this.apiMode = true;
        this.clientSideSort = config.clientSideSort ?? false;
        this.clientSideFilter = config.clientSideFilter ?? false;
    }

    public disableApiMode(): void {
        this.apiMode = false;
        this.clientSideSort = false;
        this.clientSideFilter = false;
    }

    public shouldApplyClientSideFiltering(): boolean {
        return !this.apiMode || this.clientSideFilter;
    }

    public setRowsFromApi(rows: Row[]) {
        if (!this.apiMode) {
            logger.warn('DcpGrid: setRowsFromApi should only be called in API mode');
            return;
        }

        // Format the rows first!
        const formattedRows = rows.map(row => this.formattingService.applyFormattingToRow(row));

        // Reset index mapping - it will be recalculated based on client-side operations
        this.indexMapping = this.createIdentityMapping(formattedRows.length);
        this.sortingService.resetSorting();

        // Set the formatted rows
        this.rowsSubject.next(formattedRows);

        if (this.clientSideFilter) {
            this.filteringService.updateFilterIndexesForUpdatedData();
        }

        this.rowHeightService.initRowHeights(formattedRows.length);
        this.updateRenderedRows();
    }

    // Index Mapping
    clearIndexMap(): void {
        this.indexMapping.clear();
    }

    setIndexMapping(newMap: Map<number, number>): void {
        this.indexMapping = newMap
    }

    setIndexMappingValue(newIndex: number, originalIndex: number): void {
        this.indexMapping.set(newIndex, originalIndex)
    }

    getOriginalIndex(index: number): number {
        const originalIndex = this.indexMapping.get(index);

        if (originalIndex === undefined) {
            throw new Error(`Original index in rows not found for: ${index}`);
        }

        return originalIndex;
    }

    getIndexMapping(): Map<number, number> {
        return this.indexMapping;
    }

    // Others
    updateDisplayFormat(newFormat: Partial<DisplayFormat>) {
        this.displayFormatSubject.next({
            ...this.displayFormatSubject.getValue(),
            ...newFormat
        });

        const globalSearch = this.filteringService.getGlobalSearch();
        if (globalSearch?.options?.searchMode === 'display') {
            this.filteringService.updateFilterIndexesForUpdatedData();
        }
    }

    attachContainer(container: HTMLElement) {
        this.container = container;
        this.rowHeightService.recalculateHeights();
        this.updateRenderedRows();
    }

    getContainer(): HTMLElement | null {
        return this.container;
    }

    setStateValue(key: string, newValue: any): void {
        this.stateSubject.next({
            ...this.stateSubject.value,
            [key]: newValue
        })
    }

    getState(): Observable<GridState> {
        return this.stateSubject.asObservable();
    }

    getFirstRowHeight(): number {
        return this.firstRowHeight;
    }

    getLastRowHeight(): number {
        return this.lastRowHeight;
    }

    getRenderRows() {
        return this.stateSubject.getValue().renderRows;
    }

    getRows() {
        return this.rowsSubject.getValue();
    }

    getCellDisplayValue(row: Row, columnKey: string | number): string {
        const column = this.columnsSubject.getValue().find((col) => col.key === columnKey);

        if (!column) {
            return '';
        }

        const displayValue = this.formattingService.formatCellDisplay(row, column).display;
        return displayValue === null || displayValue === undefined ? '' : String(displayValue);
    }

    getFilteredRows() {
        if (this.apiMode && !this.clientSideFilter) {
            // In API mode without client-side filtering, return rows as-is (already filtered by backend)
            return this.getRows();
        }

        // Apply client-side filtering
        return this.filteringService.applyFilter(this.getRows());
    }

    getFilteredAndSortRows() {
        const filteredRows = this.getFilteredRows();

        if (this.apiMode && !this.clientSideSort) {
            // In API mode without client-side sorting, return rows as-is (already sorted by backend)
            return filteredRows;
        }

        // Apply client-side sorting
        return this.sortingService.applySorting(filteredRows);
    }

    rowCount(): number {
        let totalRows = this.rowsSubject.getValue().length;

        if (this.apiMode && !this.clientSideFilter) {
            // In API mode without client-side filtering, use total rows
            return totalRows;
        }

        // Use filtered count
        let filterIndexes = this.filteringService.getFilterIndexes()

        if (filterIndexes === null) {
            return totalRows;
        }

        return filterIndexes.length;
    }

    setRows(rows: Row[], shouldFormat: boolean = true): void {
        const updatedRows = shouldFormat
            ? rows.map(row => this.formattingService.applyFormattingToRow(row))
            : rows;

        this.indexMapping = this.createIdentityMapping(updatedRows.length);
        this.sortingService.resetSorting();

        // Outside API mode the rows$ subscriber refreshes the filter indexes and renders.
        this.rowsSubject.next(updatedRows);

        if (this.apiMode) {
            this.filteringService.updateFilterIndexesForUpdatedData();
        }
    }

    getColumns() {
        return this.columnsSubject.getValue();
    }

    setColumns(columns: Column[]): void {
        this.columnsSubject.next(columns);
    }

    // SortingService
    getSortCondition(columnKey: string | number): SortingCondition | null {
        let matchingConditions = this.sortingService.getSortCondition(columnKey)
        if (matchingConditions.length == 0) {
            return null;
        }

        return matchingConditions[0];
    }

    toggleSort(columnKey: string | number) {
        this.sortingService.toggleSort(columnKey);
        this.notifyFilterSortUpdate();
    }

    // FilteringService
    addFilter(filterNode: FilterNode): void {
        this.filteringService.addFilter(filterNode);
        this.sortingService.resetSorting();

        this.notifyFilterSortUpdate();
    }

    reset(): void {
        this.filteringService.resetFilters();
        this.sortingService.resetSorting();
        this.notifyFilterSortUpdate();
    }

    resetFilter(columnKey: string | number): void {
        this.filteringService.resetFilter(columnKey);
        this.sortingService.resetSorting();
        this.notifyFilterSortUpdate();
    }

    setGlobalSearch(query: string, options?: GlobalSearchOptions): void {
        this.filteringService.setGlobalSearch(query, options);
        this.notifyFilterSortUpdate();
    }

    clearGlobalSearch(): void {
        this.filteringService.clearGlobalSearch();
        this.notifyFilterSortUpdate();
    }

    getGlobalSearch(): GlobalSearchState | null {
        return this.filteringService.getGlobalSearch();
    }

    getFilterIndexes(): number[] | null {
        return this.filteringService.getFilterIndexes();
    }

    hasFilter(columnKey: string | number): boolean {
        return this.filteringService.hasFilter(columnKey);
    }

    // SelectionService
    getSelected() {
        return this.selectionService.selected$;
    }

    selectRow(index: number) {
        this.selectionService.selectRow(index);
    }

    deselectRow(index: number) {
        this.selectionService.deselectRow(index);
    }

    toggleRowSelection(index: number) {
        this.selectionService.toggleRowSelection(index);
    }

    /** Selects all rows of the current view (after filter/search), by original row index. */
    selectAll() {
        this.selectionService.selectAll(this.getViewOriginalIndexes());
    }

    /**
     * Selects the range of rows between two rows as they appear in the current (filtered/sorted) view.
     * Both arguments are original row indexes (`globaIndex`), like `toggleRowSelection`. Rows that are not
     * in the view are ignored; the existing selection is kept.
     */
    shiftSelect(startIndex: number, endIndex: number) {
        const view = this.getViewOriginalIndexes();
        const positions = [view.indexOf(startIndex), view.indexOf(endIndex)].filter(position => position !== -1);
        if (positions.length === 0) {
            return;
        }

        const from = Math.min(...positions);
        const to = Math.max(...positions);
        this.selectionService.addToSelection(view.slice(from, to + 1));
    }

    isSelected(index: number): boolean {
        return this.selectionService.isSelected(index);
    }

    deselectAll() {
        this.selectionService.deselectAll();
    }

    clearSelection() {
        this.selectionService.clearSelection();
    }

    private getDisplayValue(row: Row, column: Column): DisplayValue {
        return this.formattingService.formatCellDisplay(row, column);
    }

    private getRowsOfInterest(): Row[] {
        if (this.apiMode) {
            // API mode: apply only client-side operations
            if (this.clientSideFilter && this.clientSideSort) {
                return this.getFilteredAndSortRows();
            } else if (this.clientSideFilter) {
                return this.getFilteredRows();
            } else if (this.clientSideSort) {
                return this.sortingService.applySorting(this.getRows());
            } else {
                // Pure API mode - no client-side operations
                return this.getRows();
            }
        } else {
            // Normal mode - always apply both
            return this.getFilteredAndSortRows();
        }
    }

    private createIdentityMapping(length: number): Map<number, number> {
        return new Map(Array.from({ length }, (_, i) => [i, i] as [number, number]));
    }

    private rebuildIndexMapping(processedRows: Row[]): void {
        // Row object → first original index (O(n) instead of indexOf per row)
        const originalIndexByRow = new Map<Row, number>();
        this.getRows().forEach((row, index) => {
            if (!originalIndexByRow.has(row)) originalIndexByRow.set(row, index);
        });

        const newMapping = new Map<number, number>();
        processedRows.forEach((processedRow, newIdx) => {
            const originalIdx = originalIndexByRow.get(processedRow);
            if (originalIdx !== undefined) {
                newMapping.set(newIdx, originalIdx);
            }
        });

        this.indexMapping = newMapping;
    }

    private isPureApiMode(): boolean {
        return this.apiMode && !this.clientSideFilter && !this.clientSideSort;
    }

    /** Rows of the current view; updates the index mapping view position → original index. */
    private resolveViewRows(): Row[] {
        const rowsOfInterest = this.getRowsOfInterest();

        if (this.isPureApiMode()) {
            this.indexMapping = this.createIdentityMapping(rowsOfInterest.length);
        } else if (this.apiMode) {
            // client-side operations in API mode
            this.rebuildIndexMapping(rowsOfInterest);
        }

        return rowsOfInterest;
    }

    /** Original row indexes of all rows in the current view, in view order. */
    private getViewOriginalIndexes(): number[] {
        return this.resolveViewRows().map((_, i) => this.indexMapping.get(i) ?? i);
    }

    updateRenderedRows() {
        if (!this.container) return;

        const scrollTop = this.getScrollHeight() ?? 0;

        // Get the appropriate rows based on mode and settings (also updates the index mapping)
        const rowsOfInterest = this.resolveViewRows();

        this.rowHeightService.recalculateHeights();

        const scrollBottom = scrollTop + this.container.clientHeight;
        this.startIndex = this.rowHeightService.findStartIndex(scrollTop);
        const endIndex = this.rowHeightService.findEndIndex(scrollBottom);

        // Correct firstRowHeight using cumulative heights
        this.firstRowHeight = this.startIndex > 0 && rowsOfInterest.length > 0 ? this.rowHeightService.getHeightCache()[this.startIndex - 1] : 0;

        // Calculate the actual visible height
        const totalHeight = this.rowHeightService.getHeightCache()[this.rowHeightService.getHeightCache().length - 1] || 0;
        const visibleHeight = this.rowHeightService.getHeightCache()[endIndex] - this.firstRowHeight;

        // Ensure lastRowHeight is computed dynamically
        this.lastRowHeight = rowsOfInterest.length > 0 ? Math.max(0, totalHeight - (this.firstRowHeight + visibleHeight)) : 0;

        // Slice visible rows
        const visibleRows = rowsOfInterest.slice(this.startIndex, endIndex + 1);

        // Apply formatting
        const formattedRenderRows: RenderRow[] = visibleRows.map((row: Row, index: number) => {
            const currentIndex = this.startIndex + index;

            // In pure API mode (no client-side operations), use currentIndex directly
            const originalIndex = this.isPureApiMode()
                ? currentIndex
                : this.indexMapping.get(currentIndex) ?? currentIndex;

            const formattedRow: RenderRow = {
                globaIndex: originalIndex,
                data: row
            };

            this.columnsSubject.getValue().forEach((column: Column) => {
                const cellValue = formattedRow.data[column.key];
                if (cellValue && typeof cellValue === 'object' && cellValue.raw !== undefined) {
                    const displayValue = this.getDisplayValue(row, column);
                    formattedRow.data[column.key].display = displayValue.display;
                    formattedRow.data[column.key].renderedElement = displayValue.renderedElement;
                }
            });
            return formattedRow;
        });

        // Update state
        this.stateSubject.next({
            startIndex: this.startIndex,
            step: endIndex - this.startIndex,
            firstRowHeight: this.firstRowHeight,
            lastRowHeight: this.lastRowHeight,
            renderRows: formattedRenderRows
        });

        requestAnimationFrame(() => this.rowHeightService.updateRowHeights());
    }

    handleScroll(event: Event) {
        if (!this.container) return;
        this.updateRenderedRows();
    }

    getScrollHeight(): number | undefined {
        return this.container?.scrollTop;
    }
}
