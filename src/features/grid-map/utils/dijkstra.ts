export type GridPoint = {
	row: number;
	column: number;
};

export type PathResult = {
	path: GridPoint[];
	distance: number;
};

type QueueItem = {
	key: string;
	distance: number;
};

class MinPriorityQueue {
	private values: QueueItem[] = [];

	push(item: QueueItem) {
		this.values.push(item);
		let index = this.values.length - 1;
		while (index > 0) {
			const parent = Math.floor((index - 1) / 2);
			if (this.values[parent].distance <= item.distance) break;
			this.values[index] = this.values[parent];
			index = parent;
		}
		this.values[index] = item;
	}

	pop(): QueueItem | undefined {
		if (this.values.length === 0) return undefined;
		const first = this.values[0];
		const last = this.values.pop()!;
		if (this.values.length > 0) {
			let index = 0;
			while (true) {
				const left = index * 2 + 1;
				const right = left + 1;
				if (left >= this.values.length) break;
				const child = right < this.values.length && this.values[right].distance < this.values[left].distance ? right : left;
				if (this.values[child].distance >= last.distance) break;
				this.values[index] = this.values[child];
				index = child;
			}
			this.values[index] = last;
		}
		return first;
	}

	get size() {
		return this.values.length;
	}
}

export const GRID_ROWS = 10;
export const GRID_COLUMNS = 14;

export function gridKey(point: GridPoint) {
	return `${point.row}:${point.column}`;
}

function pointFromKey(key: string): GridPoint {
	const [row, column] = key.split(':').map(Number);
	return { row, column };
}

function isInside(point: GridPoint, rows: number, columns: number) {
	return point.row >= 0 && point.row < rows && point.column >= 0 && point.column < columns;
}

function neighbors(point: GridPoint): GridPoint[] {
	return [
		{ row: point.row - 1, column: point.column },
		{ row: point.row, column: point.column + 1 },
		{ row: point.row + 1, column: point.column },
		{ row: point.row, column: point.column - 1 },
	];
}

export function findShortestPath(
	start: GridPoint,
	goal: GridPoint,
	blocked: ReadonlySet<string>,
	rows = GRID_ROWS,
	columns = GRID_COLUMNS,
	weights: ReadonlyMap<string, number> = new Map(),
): PathResult | null {
	if (!isInside(start, rows, columns) || !isInside(goal, rows, columns)) return null;

	const startKey = gridKey(start);
	const goalKey = gridKey(goal);
	if (blocked.has(startKey) || blocked.has(goalKey)) return null;
	const distances = new Map<string, number>([[startKey, 0]]);
	const previous = new Map<string, string>();
	const frontier = new MinPriorityQueue();
	frontier.push({ key: startKey, distance: 0 });
	const visited = new Set<string>();

	while (frontier.size > 0) {
		const current = frontier.pop();
		if (!current || visited.has(current.key)) continue;
		visited.add(current.key);
		if (current.key === goalKey) break;

		for (const next of neighbors(pointFromKey(current.key))) {
			if (!isInside(next, rows, columns)) continue;
			const nextKey = gridKey(next);
			if (blocked.has(nextKey)) continue;

			const weight = weights.get(nextKey) ?? 1;
			if (!Number.isFinite(weight) || weight < 1) continue;
			const candidateDistance = current.distance + weight;
			if (candidateDistance >= (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
			distances.set(nextKey, candidateDistance);
			previous.set(nextKey, current.key);
			frontier.push({ key: nextKey, distance: candidateDistance });
		}
	}

	const distance = distances.get(goalKey);
	if (distance === undefined) return null;

	const path = [goalKey];
	let cursor = goalKey;
	while (cursor !== startKey) {
		const parent = previous.get(cursor);
		if (!parent) return null;
		path.push(parent);
		cursor = parent;
	}
	path.reverse();
	return { path: path.map(pointFromKey), distance };
}

export function findPathToStorage(
	start: GridPoint,
	target: GridPoint,
	blocked: ReadonlySet<string>,
	weights: ReadonlyMap<string, number> = new Map(),
): PathResult | null {
	const approaches = neighbors(target).filter((point) => isInside(point, GRID_ROWS, GRID_COLUMNS) && !blocked.has(gridKey(point)));
	let best: PathResult | null = null;

	for (const approach of approaches) {
		const result = findShortestPath(start, approach, blocked, GRID_ROWS, GRID_COLUMNS, weights);
		if (!result) continue;
		const path = gridKey(approach) === gridKey(target) ? result.path : [...result.path, target];
		const candidate = { path, distance: result.distance + (weights.get(gridKey(target)) ?? 1) };
		if (!best || candidate.distance < best.distance) best = candidate;
	}

	return best;
}

export function findPathBetweenStorage(
	startStorage: GridPoint,
	endStorage: GridPoint,
	blocked: ReadonlySet<string>,
	weights: ReadonlyMap<string, number> = new Map(),
	avoidStartApproach?: GridPoint,
): PathResult | null {
	const startApproaches = neighbors(startStorage).filter((point) => isInside(point, GRID_ROWS, GRID_COLUMNS) && !blocked.has(gridKey(point)) && (!blocked.has(gridKey(startStorage)) || !avoidStartApproach || gridKey(point) === gridKey(avoidStartApproach)));
	const endApproaches = neighbors(endStorage).filter((point) => isInside(point, GRID_ROWS, GRID_COLUMNS) && !blocked.has(gridKey(point)));
	let best: PathResult | null = null;
	let bestStartApproach: string | undefined;

	for (const startApproach of startApproaches) {
		for (const endApproach of endApproaches) {
			const aislePath = findShortestPath(startApproach, endApproach, blocked, GRID_ROWS, GRID_COLUMNS, weights);
			if (!aislePath) continue;
			const candidate = {
				path: [startStorage, ...aislePath.path, endStorage],
				distance: (weights.get(gridKey(startApproach)) ?? 1) + aislePath.distance + (weights.get(gridKey(endStorage)) ?? 1),
			};
			const candidateApproach = gridKey(startApproach);
			const avoidsPreviousApproach = avoidStartApproach !== undefined && candidateApproach !== gridKey(avoidStartApproach);
			const bestAvoidsPreviousApproach = avoidStartApproach !== undefined && bestStartApproach !== gridKey(avoidStartApproach);
			if (!best || candidate.distance < best.distance || (candidate.distance === best.distance && avoidsPreviousApproach && !bestAvoidsPreviousApproach)) {
				best = candidate;
				bestStartApproach = candidateApproach;
			}
		}
	}

	return best;
}

export function findPathFromStorage(
	startStorage: GridPoint,
	goal: GridPoint,
	blocked: ReadonlySet<string>,
	weights: ReadonlyMap<string, number> = new Map(),
	avoidStartApproach?: GridPoint,
): PathResult | null {
	const approaches = neighbors(startStorage).filter((point) => isInside(point, GRID_ROWS, GRID_COLUMNS) && !blocked.has(gridKey(point)) && (!blocked.has(gridKey(startStorage)) || !avoidStartApproach || gridKey(point) === gridKey(avoidStartApproach)));
	let best: PathResult | null = null;
	let bestStartApproach: string | undefined;

	for (const approach of approaches) {
		const aislePath = findShortestPath(approach, goal, blocked, GRID_ROWS, GRID_COLUMNS, weights);
		if (!aislePath) continue;
		const candidate = {
			path: [startStorage, ...aislePath.path],
			distance: (weights.get(gridKey(approach)) ?? 1) + aislePath.distance,
		};
		const candidateApproach = gridKey(approach);
		const avoidsPreviousApproach = avoidStartApproach !== undefined && candidateApproach !== gridKey(avoidStartApproach);
		const bestAvoidsPreviousApproach = avoidStartApproach !== undefined && bestStartApproach !== gridKey(avoidStartApproach);
		if (!best || candidate.distance < best.distance || (candidate.distance === best.distance && avoidsPreviousApproach && !bestAvoidsPreviousApproach)) {
			best = candidate;
			bestStartApproach = candidateApproach;
		}
	}

	return best;
}
