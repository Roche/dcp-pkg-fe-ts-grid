import { FilteringService } from '../FilteringService';
import { GridService } from '../../GridService';
import { Column, Row } from '../../types/grid';
import { FilterNode } from '@open-dcp/filter';

describe('FilteringService', () => {
    let gridService: GridService;
    let filteringService: FilteringService;
    let mockRows: Row[];
    let mockColumns: Column[];

    beforeEach(() => {
        mockColumns = [
            { key: 'id', label: 'ID', type: 'integer' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'status', label: 'Status', type: 'string' },
        ];

        mockRows = [
            { id: { raw: 1, value: 1 }, name: { raw: 'Alice', value: 'Alice' }, age: { raw: 30, value: 30 }, status: { raw: 'active', value: 'active' } },
            { id: { raw: 2, value: 2 }, name: { raw: 'Bob', value: 'Bob' }, age: { raw: 25, value: 25 }, status: { raw: 'inactive', value: 'inactive' } },
            { id: { raw: 3, value: 3 }, name: { raw: 'Charlie', value: 'Charlie' }, age: { raw: 35, value: 35 }, status: { raw: 'active', value: 'active' } },
        ];

        gridService = new GridService(mockRows, mockColumns);
        filteringService = gridService['filteringService'];
    });

    describe('Basic Operations', () => {
        it('should initialize with no filter', () => {
            expect(filteringService.getFilterTree()).toBeNull();
            expect(filteringService.getFilterIndexes()).toBeNull();
        });

        it('should filter by equals condition', () => {
            const filter: FilterNode = {
                type: 'condition',
                columnKey: 'name',
                operator: '=',
                value: 'Alice'
            };

            filteringService.setFilterTree(filter);
            expect(filteringService.getFilterIndexes()).toEqual([0]);
        });

        it('should filter by greater than condition', () => {
            const filter: FilterNode = {
                type: 'condition',
                columnKey: 'age',
                operator: '>',
                value: 30
            };

            filteringService.setFilterTree(filter);
            expect(filteringService.getFilterIndexes()).toEqual([2]);
        });
    });

    describe('Group Filters', () => {
        it('should apply AND group filter', () => {
            const filter: FilterNode = {
                type: 'group',
                operator: 'and',
                filters: [
                    { type: 'condition', columnKey: 'status', operator: '=', value: 'active' },
                    { type: 'condition', columnKey: 'age', operator: '>=', value: 30 }
                ]
            };

            filteringService.setFilterTree(filter);
            expect(filteringService.getFilterIndexes()).toEqual([0, 2]);
        });

        it('should apply OR group filter', () => {
            const filter: FilterNode = {
                type: 'group',
                operator: 'or',
                filters: [
                    { type: 'condition', columnKey: 'name', operator: '=', value: 'Alice' },
                    { type: 'condition', columnKey: 'name', operator: '=', value: 'Bob' }
                ]
            };

            filteringService.setFilterTree(filter);
            expect(filteringService.getFilterIndexes()).toEqual([0, 1]);
        });
    });

    describe('Add and Reset Filters', () => {
        it('should add filter and replace existing for same column', () => {
            const filter1: FilterNode = { type: 'condition', columnKey: 'age', operator: '>', value: 25 };
            const filter2: FilterNode = { type: 'condition', columnKey: 'age', operator: '<', value: 35 };

            filteringService.addFilter(filter1);
            filteringService.addFilter(filter2);

            const tree = filteringService.getFilterTree();
            expect(tree?.type).toBe('group');
            if (tree?.type === 'group') {
                expect(tree.filters.length).toBe(1);
                expect(tree.filters[0]).toEqual(filter2);
            }
        });

        it('should reset all filters', () => {
            filteringService.setFilterTree({ type: 'condition', columnKey: 'status', operator: '=', value: 'active' });
            filteringService.resetFilters();

            expect(filteringService.getFilterTree()).toBeNull();
            expect(filteringService.getFilterIndexes()).toBeNull();
        });

        it('should reset specific column filter', () => {
            const filter: FilterNode = {
                type: 'group',
                operator: 'and',
                filters: [
                    { type: 'condition', columnKey: 'status', operator: '=', value: 'active' },
                    { type: 'condition', columnKey: 'age', operator: '>', value: 25 }
                ]
            };

            filteringService.setFilterTree(filter);
            filteringService.resetFilter('status');

            const tree = filteringService.getFilterTree();
            if (tree?.type === 'group') {
                expect(tree.filters.length).toBe(1);
                expect((tree.filters[0] as any).columnKey).toBe('age');
            }
        });
    });

    describe('Helper Methods', () => {
        it('should check if column has filter', () => {
            filteringService.setFilterTree({ type: 'condition', columnKey: 'status', operator: '=', value: 'active' });

            expect(filteringService.hasFilter('status')).toBe(true);
            expect(filteringService.hasFilter('age')).toBe(false);
        });

        it('should apply filter to rows', () => {
            filteringService.setFilterTree({ type: 'condition', columnKey: 'status', operator: '=', value: 'active' });
            const filtered = filteringService.applyFilter(mockRows);

            expect(filtered.length).toBe(2);
            expect(filtered[0].name.value).toBe('Alice');
            expect(filtered[1].name.value).toBe('Charlie');
        });

        it('should combine global search with filter tree using AND semantics', () => {
            filteringService.setFilterTree({ type: 'condition', columnKey: 'status', operator: '=', value: 'active' });
            filteringService.setGlobalSearch('char', { caseInsensitive: true });

            const filtered = filteringService.applyFilter(mockRows);
            expect(filtered.length).toBe(1);
            expect(filtered[0].name.value).toBe('Charlie');
        });

        it('should use grid case-insensitive option when global search option is not set', () => {
            const caseInsensitiveGridService = new GridService(mockRows, mockColumns, { caseInsensitiveFiltering: true });
            const caseInsensitiveFilteringService = caseInsensitiveGridService['filteringService'];

            caseInsensitiveFilteringService.setGlobalSearch('ALICE');

            const filtered = caseInsensitiveFilteringService.applyFilter(mockRows);
            expect(filtered.length).toBe(1);
            expect(filtered[0].name.value).toBe('Alice');
        });
    });
});