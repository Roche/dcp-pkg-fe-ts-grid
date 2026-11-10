import { BehaviorSubject } from 'rxjs';

export class SelectionService {
    private readonly selectedIndexes$: BehaviorSubject<Set<number>>;
    private readonly multiSelect: boolean;

    constructor(selections: Set<number> = new Set(), multiSelect: boolean = true) {
        this.multiSelect = multiSelect;
        this.selectedIndexes$ = new BehaviorSubject<Set<number>>(selections);
    }

    get selected$() {
        return this.selectedIndexes$.asObservable();
    }

    selectRow(index: number) {
        const selected = new Set(this.selectedIndexes$.value);
        selected.add(index);
        this.selectedIndexes$.next(selected);
    }

    deselectRow(index: number) {
        const selected = new Set(this.selectedIndexes$.value);
        selected.delete(index);
        this.selectedIndexes$.next(selected);
    }

    toggleRowSelection(index: number) {
        const selected = new Set(this.selectedIndexes$.value);
        if (selected.has(index)) {
            selected.delete(index);
        } else {
            if (!this.multiSelect) {
                selected.clear();

            }
            selected.add(index);
        }

        this.selectedIndexes$.next(selected);
    }

    clearSelection() {
        this.selectedIndexes$.next(new Set());
    }

    selectAll(indices: number[]) {
        this.selectedIndexes$.next(new Set(indices));
    }

    deselectAll() {
        this.clearSelection();
    }

    shiftSelect(startIndex: number, endIndex: number) {
        if (!this.multiSelect) return;

        const selected = new Set(this.selectedIndexes$.value);
        const [start, end] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];

        for (let i = start; i <= end; i++) {
            selected.add(i);
        }

        this.selectedIndexes$.next(selected);
    }

    isSelected(index: number): boolean {
        return this.selectedIndexes$.value.has(index);
    }
}
