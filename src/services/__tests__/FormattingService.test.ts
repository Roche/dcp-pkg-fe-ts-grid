import { FormattingService } from '../FormattingService';
import { GridService } from '../../GridService';
import { Column, Row } from '../../types/grid';

describe('FormattingService', () => {
    let gridService: GridService;
    let formattingService: FormattingService;
    let mockColumns: Column[];

    beforeEach(() => {
        mockColumns = [
            { key: 'id', label: 'ID', type: 'integer' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'price', label: 'Price', type: 'number' },
            { key: 'created', label: 'Created', type: 'date' },
            { key: 'updated', label: 'Updated', type: 'datetime' },
            { key: 'duration', label: 'Duration', type: 'duration' },
        ];

        gridService = new GridService([], mockColumns);
        formattingService = gridService['formattingService'];
    });

    describe('applyFormattingToRow', () => {
        it('should format a complete row with all column types', () => {
            const row: Row = {
                id: { raw: '123', value: '123' },
                name: { raw: 'Product', value: 'Product' },
                price: { raw: '99.99', value: '99.99' },
                created: { raw: '2024-01-15', value: '2024-01-15' },
                updated: { raw: '2024-01-15T14:30:00Z', value: '2024-01-15T14:30:00Z' },
                duration: { raw: '3661', value: '3661' },
            };

            const formatted = formattingService.applyFormattingToRow(row);

            expect(formatted.id.value).toBe(123);
            expect(formatted.name.value).toBe('Product');
            expect(formatted.price.value).toBe(99.99);
            expect(formatted.duration.value).toBe(3661);
            expect(formatted.created.raw).toBe('2024-01-15');
            expect(formatted.updated.raw).toBe('2024-01-15T14:30:00Z');
        });

        it('should handle null values', () => {
            const row: Row = {
                id: { raw: null, value: null },
                name: { raw: null, value: null },
            };

            const formatted = formattingService.applyFormattingToRow(row);

            expect(formatted.id.value).toBeNull();
            expect(formatted.name.value).toBeNull();
        });
    });

    describe('formatCellValue', () => {
        it('should transform integer values', () => {
            const row: Row = { id: { raw: '42', value: '42' } };
            const column: Column = { key: 'id', label: 'ID', type: 'integer' };

            const result = formattingService.formatCellValue(row, column);
            expect(result).toBe(42);
        });

        it('should transform number values', () => {
            const row: Row = { price: { raw: '19.99', value: '19.99' } };
            const column: Column = { key: 'price', label: 'Price', type: 'number' };

            const result = formattingService.formatCellValue(row, column);
            expect(result).toBe(19.99);
        });

        it('should transform date values to timestamps', () => {
            const row: Row = { created: { raw: '2024-01-15', value: '2024-01-15' } };
            const column: Column = { key: 'created', label: 'Created', type: 'date' };

            const result = formattingService.formatCellValue(row, column);
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });

        it('should transform string values', () => {
            const row: Row = { name: { raw: 'Test', value: 'Test' } };
            const column: Column = { key: 'name', label: 'Name', type: 'string' };

            const result = formattingService.formatCellValue(row, column);
            expect(result).toBe('Test');
        });
    });

    describe('formatCellDisplay', () => {
        it('should format integer for display', () => {
            const row: Row = { id: { raw: 42, value: 42 } };
            const column: Column = { key: 'id', label: 'ID', type: 'integer' };

            const result = formattingService.formatCellDisplay(row, column);
            expect(result.display).toBe('42');
        });

        it('should format date for display', () => {
            const row: Row = { created: { raw: '2024-01-15', value: new Date('2024-01-15').getTime() } };
            const column: Column = { key: 'created', label: 'Created', type: 'date' };

            const result = formattingService.formatCellDisplay(row, column);
            expect(result.display).toContain('2024');
        });

        it('should format datetime for display', () => {
            const row: Row = { updated: { raw: '2024-01-15T14:30:00Z', value: new Date('2024-01-15T14:30:00Z').getTime() } };
            const column: Column = { key: 'updated', label: 'Updated', type: 'datetime' };

            const result = formattingService.formatCellDisplay(row, column);
            expect(result.display).toBeTruthy();
            expect(result.display).toContain('2024');
        });

        it('should format duration for display', () => {
            const row: Row = { duration: { raw: 3661, value: 3661 } };
            const column: Column = { key: 'duration', label: 'Duration', type: 'duration' };

            const result = formattingService.formatCellDisplay(row, column);
            expect(result.display).toBe('01:01:01');
        });

        it('should handle null values in display', () => {
            const row: Row = { name: { raw: null, value: null } };
            const column: Column = { key: 'name', label: 'Name', type: 'string' };

            const result = formattingService.formatCellDisplay(row, column);
            expect(result.display).toBeNull();
        });
    });

    describe('Display format changes', () => {
        it('should respect timezone changes for date formatting', () => {
            const row: Row = { created: { raw: '2024-01-15T12:00:00Z', value: new Date('2024-01-15T12:00:00Z').getTime() } };
            const column: Column = { key: 'created', label: 'Created', type: 'datetime' };

            gridService.updateDisplayFormat({ timeZone: 'America/New_York' });
            const result = formattingService.formatCellDisplay(row, column);

            expect(result.display).toBeTruthy();
        });

        it('should respect date format changes', () => {
            const row: Row = { created: { raw: '2024-01-15', value: new Date('2024-01-15').getTime() } };
            const column: Column = { key: 'created', label: 'Created', type: 'date' };

            gridService.updateDisplayFormat({ dateFormat: 'dd/MM/yyyy' });
            const result = formattingService.formatCellDisplay(row, column);

            expect(result.display).toContain('/');
        });
    });
});