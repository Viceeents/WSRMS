import { GRID_COLUMNS, GRID_ROWS, type GridPoint } from './dijkstra';

export type StorageSlot = {
	location: string;
	kind: 'rack' | 'vault' | 'cold';
	point: GridPoint;
};

export const ENTRY: GridPoint = { row: 9, column: 0 };
export const EXIT: GridPoint = { row: 9, column: 13 };
export const DEFAULT_GRID_CAPACITY = 100;

export function normalizeLocation(location: string) {
	return location.replace(/^(rack|vault|zone)\s+/i, '').replace(/\s+/g, '').toLowerCase();
}

function createRackSlots(letter: string, rows: number[], columns: number[]): StorageSlot[] {
	let index = 0;
	return rows.flatMap((row) => columns.map((column) => {
		index += 1;
		return { location: `${letter}-${String(index).padStart(2, '0')}`, kind: 'rack' as const, point: { row, column } };
	}));
}

export const storageSlots: StorageSlot[] = [
	...createRackSlots('A', [1, 2, 3], [1, 2, 4, 5]),
	...createRackSlots('B', [1, 2, 3], [7, 8, 10, 11]),
	...createRackSlots('C', [5, 6, 7], [1, 2, 4, 5]),
	...createRackSlots('D', [5, 6], [7, 8, 10, 11]),
	...[1, 2, 3, 4].map((row, index) => ({ location: `E-${String(index + 1).padStart(2, '0')}`, kind: 'vault' as const, point: { row, column: 13 } })),
	...[6, 7].map((row, index) => ({ location: `Cold-${String(index + 1).padStart(2, '0')}`, kind: 'cold' as const, point: { row, column: 13 } })),
];

// Preserve existing inventory locations and make every remaining grid available for storage.
for (let row = 0; row < GRID_ROWS; row += 1) {
	for (let column = 0; column < GRID_COLUMNS; column += 1) {
		if ((row === ENTRY.row && column === ENTRY.column) || (row === EXIT.row && column === EXIT.column)) continue;
		if (storageSlots.some((slot) => slot.point.row === row && slot.point.column === column)) continue;
		storageSlots.push({ location: `R${row + 1}-C${column + 1}`, kind: 'rack', point: { row, column } });
	}
}

