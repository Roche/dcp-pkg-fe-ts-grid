import { GridService } from '../GridService';
import { Column, Row } from '../types/grid';

describe('GridService', () => {
    let gridService: GridService;
    let mockRows: Row[];
    let mockColumns: Column[];

    beforeEach(() => {
        // Setup mock columns
        mockColumns = [
            { key: 'id', label: 'ID', type: 'integer' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'age', label: 'Age', type: 'number' },
        ];

        // Setup mock rows
        mockRows = [
            { id: { raw: 1, value: 1 }, name: { raw: 'Alice', value: 'Alice' }, age: { raw: 30, value: 30 } },
            { id: { raw: 2, value: 2 }, name: { raw: 'Bob', value: 'Bob' }, age: { raw: 25, value: 25 } },
            { id: { raw: 3, value: 3 }, name: { raw: 'Charlie', value: 'Charlie' }, age: { raw: 35, value: 35 } },
        ];

        gridService = new GridService(mockRows, mockColumns);
    });

    it('should initialize with correct row count', () => {
        expect(gridService.rowCount()).toBe(3);
    });

    it('should return all rows', () => {
        const rows = gridService.getRows();
        expect(rows.length).toBe(3);
    });

    it('should return all columns', () => {
        const columns = gridService.getColumns();
        expect(columns.length).toBe(3);
    });

    it('should update rows', () => {
        const newRows: Row[] = [
            { id: { raw: 4, value: 4 }, name: { raw: 'David', value: 'David' }, age: { raw: 40, value: 40 } },
        ];
        gridService.setRows(newRows);
        expect(gridService.rowCount()).toBe(1);
    });

    it('should toggle sort on a column', () => {
        gridService.toggleSort('name');
        const sortCondition = gridService.getSortCondition('name');
        expect(sortCondition).not.toBeNull();
        expect(sortCondition?.direction).toBe('asc');
    });

    it('should toggle sort direction from asc to desc', () => {
        gridService.toggleSort('name');
        gridService.toggleSort('name');
        const sortCondition = gridService.getSortCondition('name');
        expect(sortCondition?.direction).toBe('desc');
    });

    it('should remove sort after third toggle', () => {
        gridService.toggleSort('name');
        gridService.toggleSort('name');
        gridService.toggleSort('name');
        const sortCondition = gridService.getSortCondition('name');
        expect(sortCondition).toBeNull();
    });

    it('should sort rows by age ascending', () => {
        gridService.toggleSort('age');
        const sortedRows = gridService.getFilteredAndSortRows();
        expect(sortedRows[0].age.value).toBe(25);
        expect(sortedRows[1].age.value).toBe(30);
        expect(sortedRows[2].age.value).toBe(35);
    });

    it('should enable API mode', () => {
        gridService.enableApiMode({ clientSideSort: false, clientSideFilter: false });
        expect(gridService['apiMode']).toBe(true);
    });

    it('should set rows from API', () => {
        gridService.enableApiMode({ clientSideSort: false, clientSideFilter: false });
        const apiRows: Row[] = [
            { id: { raw: 5, value: 5 }, name: { raw: 'Eve', value: 'Eve' }, age: { raw: 28, value: 28 } },
        ];
        gridService.setRowsFromApi(apiRows);
        expect(gridService.rowCount()).toBe(1);
    });

    it('should emit filterSort$ observable when sort is toggled in API mode', (done) => {
        gridService.enableApiMode({ clientSideSort: false, clientSideFilter: false });
        
        gridService.filterSort$.subscribe(({ filterTree, sorts }) => {
            if (sorts.length > 0) {
                expect(sorts[0].columnKey).toBe('name');
                expect(sorts[0].direction).toBe('asc');
                done();
            }
        });

        gridService.toggleSort('name');
    });

    it('should use client-side sorting when enabled in API mode', () => {
        gridService.enableApiMode({ clientSideSort: true, clientSideFilter: false });
        gridService.setRowsFromApi(mockRows);
        
        gridService.toggleSort('age');
        const sortedRows = gridService.getFilteredAndSortRows();
        
        expect(sortedRows[0].age.value).toBe(25);
        expect(sortedRows[1].age.value).toBe(30);
        expect(sortedRows[2].age.value).toBe(35);
    });

    it('should select a row', (done) => {
        gridService.selectRow(0);
        gridService.getSelected().subscribe(selected => {
            expect(selected.has(0)).toBe(true);
            done();
        });
    });

    it('should deselect a row', (done) => {
        gridService.selectRow(0);
        gridService.deselectRow(0);
        gridService.getSelected().subscribe(selected => {
            expect(selected.has(0)).toBe(false);
            done();
        });
    });

    it('should toggle row selection', (done) => {
        gridService.toggleRowSelection(0);
        gridService.getSelected().subscribe(selected => {
            expect(selected.has(0)).toBe(true);
            done();
        });
    });

    it('should clear all selections', (done) => {
        gridService.selectRow(0);
        gridService.selectRow(1);
        gridService.clearSelection();
        gridService.getSelected().subscribe(selected => {
            expect(selected.size).toBe(0);
            done();
        });
    });

    it('should update display format', (done) => {
        gridService.updateDisplayFormat({ dateFormat: 'dd/MM/yyyy' });
        gridService.displayFormat$.subscribe(format => {
            expect(format.dateFormat).toBe('dd/MM/yyyy');
            done();
        });
    });

    it('should set and clear global search', () => {
        gridService.setGlobalSearch('Alice');
        expect(gridService.getGlobalSearch()).toEqual({ query: 'Alice', options: undefined });

        const searchedRows = gridService.getFilteredRows();
        expect(searchedRows).toHaveLength(1);
        expect(searchedRows[0].name.value).toBe('Alice');

        gridService.clearGlobalSearch();
        expect(gridService.getGlobalSearch()).toBeNull();
        expect(gridService.getFilteredRows()).toHaveLength(3);
    });

    it('should apply global search only to restricted columns', () => {
        gridService.setGlobalSearch('25', { columns: ['name'] });
        expect(gridService.getFilteredRows()).toHaveLength(0);

        gridService.setGlobalSearch('25', { columns: ['age'] });
        const searchedRows = gridService.getFilteredRows();
        expect(searchedRows).toHaveLength(1);
        expect(searchedRows[0].name.value).toBe('Bob');
    });

    it('should apply case-insensitive global search using options', () => {
        gridService.setGlobalSearch('ALICE', { caseInsensitive: true });
        const searchedRows = gridService.getFilteredRows();

        expect(searchedRows).toHaveLength(1);
        expect(searchedRows[0].name.value).toBe('Alice');
    });

    it('should update global search matches after setRows', () => {
        gridService.setGlobalSearch('zara', { caseInsensitive: true });
        expect(gridService.getFilteredRows()).toHaveLength(0);

        const newRows: Row[] = [
            { id: { raw: 10, value: 10 }, name: { raw: 'Zara', value: 'Zara' }, age: { raw: 22, value: 22 } },
        ];

        gridService.setRows(newRows);
        const searchedRows = gridService.getFilteredRows();
        expect(searchedRows).toHaveLength(1);
        expect(searchedRows[0].name.value).toBe('Zara');
    });

    it('should update global search matches after setColumns', () => {
        gridService.setGlobalSearch('30', { columns: ['age'] });
        expect(gridService.getFilteredRows()).toHaveLength(1);

        gridService.setColumns([
            { key: 'id', label: 'ID', type: 'integer' },
            { key: 'name', label: 'Name', type: 'string' },
        ]);

        gridService.setGlobalSearch('30');
        expect(gridService.getFilteredRows()).toHaveLength(0);
    });

    it('should emit global search in filterSort$ payload in API mode', (done) => {
        gridService.enableApiMode({ clientSideSort: false, clientSideFilter: false });

        gridService.filterSort$.subscribe(({ globalSearch }) => {
            if (globalSearch?.query === 'alice') {
                expect(globalSearch.options?.columns).toEqual(['name']);
                expect(globalSearch.options?.caseInsensitive).toBe(true);
                done();
            }
        });

        gridService.setGlobalSearch('alice', { columns: ['name'], caseInsensitive: true });
    });

    it('should support display-mode global search', () => {
        const durationColumns: Column[] = [
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'sessionDuration', label: 'Session Duration', type: 'duration' },
        ];

        const durationRows: Row[] = [
            { name: { raw: 'Alice', value: 'Alice' }, sessionDuration: { raw: 3661, value: 3661 } },
            { name: { raw: 'Bob', value: 'Bob' }, sessionDuration: { raw: 125, value: 125 } },
        ];

        const durationGrid = new GridService(durationRows, durationColumns);

        durationGrid.setGlobalSearch('01:01', { columns: ['sessionDuration'], searchMode: 'display' });
        const displayMatches = durationGrid.getFilteredRows();
        expect(displayMatches).toHaveLength(1);
        expect(displayMatches[0].name.value).toBe('Alice');

        durationGrid.setGlobalSearch('01:01', { columns: ['sessionDuration'], searchMode: 'raw' });
        expect(durationGrid.getFilteredRows()).toHaveLength(0);
    });

    it('should refresh display-mode global search after display format updates', () => {
        const dateColumns: Column[] = [
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'created', label: 'Created', type: 'date' },
        ];

        const dateRows: Row[] = [
            { name: { raw: 'Alice', value: 'Alice' }, created: { raw: '2024-01-15T00:00:00Z', value: new Date('2024-01-15T00:00:00Z').getTime() } },
            { name: { raw: 'Bob', value: 'Bob' }, created: { raw: '2024-12-31T00:00:00Z', value: new Date('2024-12-31T00:00:00Z').getTime() } },
        ];

        const dateGrid = new GridService(dateRows, dateColumns);

        dateGrid.setGlobalSearch('/', { columns: ['created'], searchMode: 'display' });
        expect(dateGrid.getFilteredRows()).toHaveLength(0);

        dateGrid.updateDisplayFormat({ dateFormat: 'dd/MM/yyyy' });
        expect(dateGrid.getFilteredRows()).toHaveLength(2);
    });

    it('should use column globalSearchText callback for component columns', () => {
        const componentColumns: Column[] = [
            { key: 'id', label: 'ID', type: 'integer' },
            {
                key: 'status',
                label: 'Status',
                type: 'component',
                globalSearchText: (cell) => {
                    const code = String(cell?.raw ?? '');
                    if (code === 'A') return 'Active';
                    if (code === 'I') return 'Inactive';
                    return 'Pending';
                },
            },
        ];

        const componentRows: Row[] = [
            { id: { raw: 1, value: 1 }, status: { raw: 'A', value: 'A' } },
            { id: { raw: 2, value: 2 }, status: { raw: 'I', value: 'I' } },
        ];

        const componentGrid = new GridService(componentRows, componentColumns);
        componentGrid.setGlobalSearch('inactive', { searchMode: 'display', caseInsensitive: true });

        const searchedRows = componentGrid.getFilteredRows();
        expect(searchedRows).toHaveLength(1);
        expect(searchedRows[0].id.value).toBe(2);
    });

    it('should keep sort consistent when global search query changes', () => {
        gridService.toggleSort('age');
        expect(gridService.getSortCondition('age')?.direction).toBe('asc');

        gridService.setGlobalSearch('a', { caseInsensitive: true });
        expect(gridService.getSortCondition('age')?.direction).toBe('asc');
        const firstSearch = gridService.getFilteredAndSortRows();
        expect(firstSearch).toHaveLength(2);
        expect(firstSearch[0].name.value).toBe('Alice');
        expect(firstSearch[1].name.value).toBe('Charlie');

        gridService.setGlobalSearch('bo', { caseInsensitive: true });
        expect(gridService.getSortCondition('age')?.direction).toBe('asc');
        const secondSearch = gridService.getFilteredAndSortRows();
        expect(secondSearch).toHaveLength(1);
        expect(secondSearch[0].name.value).toBe('Bob');
    });

    it('should combine global search and per-column filter with sorting', () => {
        gridService.toggleSort('age');

        gridService.addFilter({ type: 'condition', columnKey: 'age', operator: '>=', value: 30 });
        gridService.setGlobalSearch('a', { caseInsensitive: true });

        const rows = gridService.getFilteredAndSortRows();
        expect(rows).toHaveLength(2);
        expect(rows[0].name.value).toBe('Alice');
        expect(rows[1].name.value).toBe('Charlie');
    });

    it('should not apply global search locally in API mode when client-side filtering is disabled', () => {
        gridService.enableApiMode({ clientSideSort: true, clientSideFilter: false });
        gridService.setRowsFromApi(mockRows);

        gridService.setGlobalSearch('Alice');
        gridService.toggleSort('age');

        const rows = gridService.getFilteredAndSortRows();
        expect(rows).toHaveLength(3);
        expect(rows[0].name.value).toBe('Bob');
        expect(rows[1].name.value).toBe('Alice');
        expect(rows[2].name.value).toBe('Charlie');
    });
});