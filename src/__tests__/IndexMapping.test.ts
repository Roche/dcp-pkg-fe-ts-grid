import { firstValueFrom } from 'rxjs';
import { GridService } from '../GridService.js';
import { Column, Row } from '../types/grid.js';

// Rendering needs a scroll container; a large clientHeight renders all rows.
const fakeContainer = () => ({
    scrollTop: 0,
    clientHeight: 100000,
    querySelectorAll: () => [],
}) as unknown as HTMLElement;

beforeAll(() => {
    (globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 0; };
});

const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'integer' },
    { key: 'name', label: 'Name', type: 'string' },
];

const row = (id: number, name: string): Row => ({
    id: { raw: id, value: id },
    name: { raw: name, value: name },
});

const createGrid = (rows: Row[]) => {
    const grid = new GridService(rows, columns);
    grid.attachContainer(fakeContainer());
    return grid;
};

/** Rendered rows as [name, globaIndex] pairs. */
const rendered = (grid: GridService) =>
    grid.getRenderRows().map(r => [r.data.name.value, r.globaIndex]);

/** Names of the original rows referenced by each rendered globaIndex. */
const namesByGlobalIndex = (grid: GridService) =>
    grid.getRenderRows().map(r => grid.getRows()[r.globaIndex].name.value);

const selection = async (grid: GridService) => [...await firstValueFrom(grid.getSelected())].sort((a, b) => a - b);

describe('GridService index mapping', () => {
    describe('sorting (#2)', () => {
        it('re-sorts after setRows with the same number of rows', () => {
            const grid = createGrid([row(1, 'b'), row(2, 'a'), row(3, 'c')]);
            grid.toggleSort('name');
            expect(rendered(grid).map(([name]) => name)).toEqual(['a', 'b', 'c']);

            grid.setRows([row(4, 'z'), row(5, 'y'), row(6, 'x')]);

            expect(rendered(grid).map(([name]) => name)).toEqual(['x', 'y', 'z']);
            expect(namesByGlobalIndex(grid)).toEqual(['x', 'y', 'z']);
        });

        it('keeps globaIndex correct when a search changes but the match count does not', () => {
            const grid = createGrid([row(1, 'a2'), row(2, 'a1'), row(3, 'b2'), row(4, 'b1')]);
            grid.toggleSort('name');

            grid.setGlobalSearch('a');
            expect(namesByGlobalIndex(grid)).toEqual(['a1', 'a2']);

            grid.setGlobalSearch('b');
            expect(rendered(grid).map(([name]) => name)).toEqual(['b1', 'b2']);
            expect(namesByGlobalIndex(grid)).toEqual(['b1', 'b2']);
        });

        it('keeps globaIndex correct on re-render (cache hit) with an active filter', () => {
            const grid = createGrid([row(1, 'c'), row(2, 'x'), row(3, 'a'), row(4, 'b')]);
            grid.addFilter({ type: 'condition', columnKey: 'name', operator: 'in', value: ['a', 'b', 'c'] });
            grid.toggleSort('name');
            expect(namesByGlobalIndex(grid)).toEqual(['a', 'b', 'c']);

            grid.updateRenderedRows(); // e.g. scroll

            expect(namesByGlobalIndex(grid)).toEqual(['a', 'b', 'c']);
        });

        it('stays correct when the search is cleared again', () => {
            const grid = createGrid([row(1, 'b'), row(2, 'a'), row(3, 'c')]);
            grid.toggleSort('name');
            grid.setGlobalSearch('a');
            grid.clearGlobalSearch();

            expect(rendered(grid).map(([name]) => name)).toEqual(['a', 'b', 'c']);
            expect(namesByGlobalIndex(grid)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('setRows with an active filter (#3)', () => {
        it('renders only rows that match the filter after new data arrives', () => {
            const grid = createGrid([row(1, 'r1'), row(2, 'zz1')]);
            grid.setGlobalSearch('r1');
            expect(rendered(grid).map(([name]) => name)).toEqual(['r1']);

            grid.setRows([row(3, 'zz1'), row(4, 'zz2')]);

            expect(grid.rowCount()).toBe(0);
            expect(grid.getRenderRows()).toEqual([]);
        });

        it('renders new matching rows with correct globaIndex', () => {
            const grid = createGrid([row(1, 'r1'), row(2, 'zz1')]);
            grid.setGlobalSearch('r');

            grid.setRows([row(3, 'zz'), row(4, 'r9'), row(5, 'r8')]);

            expect(rendered(grid)).toEqual([['r9', 1], ['r8', 2]]);
        });
    });

    describe('selection (#4)', () => {
        it('selectAll selects the original indexes of the visible (filtered) rows', async () => {
            const grid = createGrid([row(1, 'a'), row(2, 'b'), row(3, 'c'), row(4, 'd'), row(5, 'target')]);
            grid.setGlobalSearch('target');

            grid.selectAll();

            expect(await selection(grid)).toEqual([4]);
        });

        it('selectAll with sort and filter selects exactly the visible rows', async () => {
            const grid = createGrid([row(1, 'x'), row(2, 'b'), row(3, 'y'), row(4, 'a')]);
            grid.addFilter({ type: 'condition', columnKey: 'name', operator: 'in', value: ['a', 'b'] });
            grid.toggleSort('name');

            grid.selectAll();

            expect(await selection(grid)).toEqual([1, 3]);
        });

        it('shiftSelect selects the visible range between two rows (sorted view)', async () => {
            // original order: d(0) a(1) c(2) b(3); sorted view: a b c d
            const grid = createGrid([row(1, 'd'), row(2, 'a'), row(3, 'c'), row(4, 'b')]);
            grid.toggleSort('name');

            // from "a" (original 1) to "c" (original 2) → a, b, c in the view
            grid.shiftSelect(1, 2);

            expect(await selection(grid)).toEqual([1, 2, 3]);
        });

        it('shiftSelect works in either direction and keeps existing selection', async () => {
            const grid = createGrid([row(1, 'd'), row(2, 'a'), row(3, 'c'), row(4, 'b')]);
            grid.toggleSort('name');
            grid.selectRow(0); // "d"

            grid.shiftSelect(2, 1); // "c" up to "a"

            expect(await selection(grid)).toEqual([0, 1, 2, 3]);
        });

        it('shiftSelect ignores rows that are not in the current view', async () => {
            const grid = createGrid([row(1, 'a'), row(2, 'b'), row(3, 'zz')]);
            grid.setGlobalSearch('zz');

            grid.shiftSelect(0, 2);

            expect(await selection(grid)).toEqual([2]);
        });
    });

    describe('sort turned off and API mode', () => {
        it('restores the original mapping when sorting is switched off (asc → desc → off)', () => {
            const grid = createGrid([row(1, 'b'), row(2, 'a'), row(3, 'c')]);
            grid.toggleSort('name'); // asc
            grid.toggleSort('name'); // desc
            grid.toggleSort('name'); // off

            expect(rendered(grid)).toEqual([['b', 0], ['a', 1], ['c', 2]]);
        });

        it('API mode with client-side sort and filter maps view rows to the right originals', async () => {
            const grid = new GridService([], columns);
            grid.attachContainer(fakeContainer());
            grid.enableApiMode({ clientSideSort: true, clientSideFilter: true });
            grid.setRowsFromApi([row(1, 'x'), row(2, 'b'), row(3, 'y'), row(4, 'a')]);
            grid.addFilter({ type: 'condition', columnKey: 'name', operator: 'in', value: ['a', 'b'] });
            grid.toggleSort('name');

            expect(namesByGlobalIndex(grid)).toEqual(['a', 'b']);

            grid.setRowsFromApi([row(5, 'b'), row(6, 'q'), row(7, 'a')]);
            expect(namesByGlobalIndex(grid)).toEqual(['a', 'b']);

            grid.selectAll();
            expect(await selection(grid)).toEqual([0, 2]);
        });

        it('pure API mode keeps a 1:1 mapping', () => {
            const grid = new GridService([], columns);
            grid.attachContainer(fakeContainer());
            grid.enableApiMode();
            grid.setRowsFromApi([row(1, 'b'), row(2, 'a')]);

            expect(rendered(grid)).toEqual([['b', 0], ['a', 1]]);
        });

        it('shiftSelect does nothing in single-select mode', async () => {
            const grid = new GridService([row(1, 'a'), row(2, 'b')], columns, { multiSelect: false });
            grid.attachContainer(fakeContainer());

            grid.shiftSelect(0, 1);

            expect(await selection(grid)).toEqual([]);
        });
    });
});

describe('setRows change detection', () => {
    it('re-renders when setRows is called with deep-equal data (new objects)', () => {
        const grid = createGrid([row(1, 'a'), row(2, 'b')]);
        const before = grid.getRenderRows().map(r => r.data);

        grid.setRows([row(1, 'a'), row(2, 'b')]);

        const after = grid.getRenderRows().map(r => r.data);
        expect(after.map(d => d.name.value)).toEqual(['a', 'b']);
        expect(after[0]).not.toBe(before[0]);
        expect(after[0]).toBe(grid.getRows()[0]);
    });

    it('does not write into the caller\'s row objects', () => {
        const input = [row(1, 'a')];
        const grid = createGrid(input);
        grid.setRows(input);

        expect(input[0].name).toEqual({ raw: 'a', value: 'a' });
        expect(grid.getRows()[0].name).not.toBe(input[0].name);
    });
});
