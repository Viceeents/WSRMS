import { storageSlots, ENTRY, EXIT, normalizeLocation, DEFAULT_GRID_CAPACITY, type StorageSlot } from '../utils/warehouseLayout';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Boxes, Package, MapPinned, Route, SlidersHorizontal } from 'lucide-react';
import { apiRequest, errorMessage, type Parcel, type ParcelStatus } from '../../workspaceApi';
import {
	findPathBetweenStorage,
	findPathFromStorage,
	findPathToStorage,
	gridKey,
	GRID_COLUMNS,
	GRID_ROWS,
	findShortestPath,
	type GridPoint,
} from '../utils/dijkstra';

type WarehouseCell = StorageSlot
	| { kind: 'entry'; point: GridPoint }
	| { kind: 'exit'; point: GridPoint };

type ActiveRoute = {
	mode: 'single' | 'priority';
	path: GridPoint[];
	stopNumbers: Map<string, number>;
	totalCost: number;
	stopCount: number;
};

const statusRank: Record<ParcelStatus, number> = { out_of_stock: 0, low_stock: 1, in_stock: 2 };
const statusText: Record<ParcelStatus, string> = { out_of_stock: 'Out of stock', low_stock: 'Low stock', in_stock: 'In stock' };

const slotByLocation = new Map(storageSlots.map((slot) => [slot.location.toLowerCase(), slot]));
const slotByPoint = new Map(storageSlots.map((slot) => [gridKey(slot.point), slot]));
const STEP_SECONDS = 10;
const CLEAR_MINUTES = 5;

function cellFor(row: number, column: number): WarehouseCell {
	const point = { row, column };
	if (row === ENTRY.row && column === ENTRY.column) return { kind: 'entry', point };
	if (row === EXIT.row && column === EXIT.column) return { kind: 'exit', point };
	return slotByPoint.get(gridKey(point))!;
}

const warehouseCells = Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) =>
	cellFor(Math.floor(index / GRID_COLUMNS), index % GRID_COLUMNS),
);

export default function GridMapPage() {
	const [parcels, setParcels] = useState<Parcel[]>([]);
	const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
	const [simulatedStates, setSimulatedStates] = useState<Map<string, 'empty' | 'partial' | 'full' | 'disabled'>>(() => new Map());
	const [editingAisles, setEditingAisles] = useState(false);
	const [gridCapacity, setGridCapacity] = useState(DEFAULT_GRID_CAPACITY);
	const [selectedParcelId, setSelectedParcelId] = useState('');
	const [selectedLocation, setSelectedLocation] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const refreshInventory = async () => {
			try {
				const result = await apiRequest<{ items: Parcel[] }>('/api/inventory');
				if (!cancelled) {
					setParcels((current) => JSON.stringify(current) === JSON.stringify(result.items) ? current : result.items);
					setError('');
				}
			} catch (reason) {
				if (!cancelled) setError(errorMessage(reason));
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		void refreshInventory();
		const interval = window.setInterval(() => void refreshInventory(), 15000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, []);

	const parcelByLocation = useMemo(() => {
		const byLocation = new Map<string, Parcel[]>();
		parcels.forEach((parcel) => {
			const key = normalizeLocation(parcel.storage_location);
			const current = byLocation.get(key) || [];
			current.push(parcel);
			byLocation.set(key, current);
		});
		return byLocation;
	}, [parcels]);

	const occupancy = useMemo(() => new Map(warehouseCells.map((cell) => {
		const key = gridKey(cell.point), state = simulatedStates.get(key);
		const actual = 'location' in cell ? (parcelByLocation.get(cell.location.toLowerCase()) || []).reduce((total, parcel) => total + parcel.quantity, 0) : 0;
		return [key, state ? state === 'partial' ? gridCapacity / 2 : state === 'full' ? gridCapacity : 0 : actual];
	})), [parcelByLocation, simulatedStates, gridCapacity]);
	const disabledCells = useMemo(() => new Set([...simulatedStates].filter(([, state]) => state === 'disabled').map(([key]) => key)), [simulatedStates]);
	const routeBlockedCells = useMemo(() => new Set([...disabledCells, ...warehouseCells.filter((cell) => (occupancy.get(gridKey(cell.point)) || 0) >= gridCapacity).map((cell) => gridKey(cell.point))]), [disabledCells, occupancy, gridCapacity]);
	const travelWeights = useMemo(() => new Map(warehouseCells.map((cell) => [gridKey(cell.point), 1 + (occupancy.get(gridKey(cell.point)) || 0) / gridCapacity])), [occupancy, gridCapacity]);
	const rankedParcels = useMemo(() => parcels.map((parcel) => {
		const slot = slotByLocation.get(normalizeLocation(parcel.storage_location));
		const path = slot && !disabledCells.has(gridKey(slot.point)) ? findPathToStorage(ENTRY, slot.point, routeBlockedCells, travelWeights) : null;
		const exit = slot ? findPathFromStorage(slot.point, EXIT, routeBlockedCells, travelWeights, path?.path[path.path.length - 2]) : null;
		const baseline = slot ? findPathToStorage(ENTRY, slot.point, new Set()) : null;
		const baselineExit = slot ? findPathFromStorage(slot.point, EXIT, new Set()) : null;
		const accessible = Boolean(path && exit);
		const front = slot ? (parcelByLocation.get(slot.location.toLowerCase()) || []).filter((item) => item.quantity > 0 && Date.parse(item.received_at) > Date.parse(parcel.received_at)).length : 0;
		const clearanceWeights = new Map(travelWeights);
		routeBlockedCells.forEach((key) => clearanceWeights.set(key, 1 + CLEAR_MINUTES * 60 / STEP_SECONDS));
		const clearance = slot && !disabledCells.has(gridKey(slot.point)) ? findPathToStorage(ENTRY, slot.point, disabledCells, clearanceWeights) : null;
		const clearanceExit = slot && !disabledCells.has(gridKey(slot.point)) ? findPathFromStorage(slot.point, EXIT, disabledCells, clearanceWeights) : null;
		const delay = accessible
			? Math.ceil(Math.max(0, path!.distance + exit!.distance - (baseline?.distance || 0) - (baselineExit?.distance || 0)) * STEP_SECONDS / 60) + front * 2
			: slot && clearance && clearanceExit ? Math.max(CLEAR_MINUTES, Math.ceil((clearance.distance + clearanceExit.distance - (baseline?.distance || 0) - (baselineExit?.distance || 0)) * STEP_SECONDS / 60)) + front * 2 : null;
		const suggestion = !accessible || (slot && (occupancy.get(gridKey(slot.point)) || 0) + parcel.quantity > gridCapacity)
			? storageSlots.filter((candidate) => candidate.kind === slot?.kind && candidate !== slot && !disabledCells.has(gridKey(candidate.point)) && (occupancy.get(gridKey(candidate.point)) || 0) + parcel.quantity <= gridCapacity)
				.map((candidate) => ({ candidate, route: findPathToStorage(ENTRY, candidate.point, routeBlockedCells, travelWeights), exit: findPathFromStorage(candidate.point, EXIT, routeBlockedCells, travelWeights) }))
				.filter((item) => item.route && item.exit)
				.sort((a, b) => a.route!.distance - b.route!.distance)[0]?.candidate.location : undefined;
		return { parcel, slot, distance: accessible ? path!.distance : null, accessible, delay, front, suggestion };
	}).sort((first, second) =>
		Number(second.accessible) - Number(first.accessible)
		|| first.front - second.front
		|| statusRank[first.parcel.status] - statusRank[second.parcel.status]
		|| (first.delay ?? Infinity) - (second.delay ?? Infinity)
		|| (first.distance ?? Infinity) - (second.distance ?? Infinity)
		|| first.parcel.parcel_code.localeCompare(second.parcel.parcel_code),
	), [parcels, parcelByLocation, routeBlockedCells, travelWeights, occupancy, gridCapacity, disabledCells]);

	const cellAccess = useMemo(() => new Map(warehouseCells.map((cell) => {
		const key = gridKey(cell.point);
		if (disabledCells.has(key)) return [key, false];
		if ('location' in cell) {
			const incoming = findPathToStorage(ENTRY, cell.point, routeBlockedCells, travelWeights);
			return [key, Boolean(incoming && findPathFromStorage(cell.point, EXIT, routeBlockedCells, travelWeights, incoming.path[incoming.path.length - 2]))];
		}
		return [key, Boolean(findShortestPath(ENTRY, cell.point, routeBlockedCells) && findShortestPath(cell.point, EXIT, routeBlockedCells))];
	})), [disabledCells, routeBlockedCells, travelWeights]);
	const blockedLines = useMemo(() => ({
		rows: new Set(Array.from({ length: GRID_ROWS }, (_, row) => row).filter((row) => warehouseCells.filter((cell) => cell.point.row === row).every((cell) => routeBlockedCells.has(gridKey(cell.point))))),
		columns: new Set(Array.from({ length: GRID_COLUMNS }, (_, column) => column).filter((column) => warehouseCells.filter((cell) => cell.point.column === column).every((cell) => routeBlockedCells.has(gridKey(cell.point))))),
	}), [routeBlockedCells]);
	const unreachableStored = warehouseCells.filter((cell) => (occupancy.get(gridKey(cell.point)) || 0) > 0 && !cellAccess.get(gridKey(cell.point)));

	const selectedParcels = parcelByLocation.get(selectedLocation) || [];
	const pathIndices = useMemo(() => {
		const indices = new Map<string, number>();
		activeRoute?.path.forEach((point, index) => {
			const key = gridKey(point);
			if (!indices.has(key)) indices.set(key, index);
		});
		return indices;
	}, [activeRoute]);

	const activeRouteMode = activeRoute?.mode;

	useEffect(() => {
		if (!activeRouteMode) return;
		const route = activeRouteMode === 'priority'
			? buildPriorityRoute(parcels)
			: buildSingleRoute(parcels.find((parcel) => parcel.id === selectedParcelId));
		if (!route) {
			setActiveRoute(null);
			setError(`The current stock or aisle conditions no longer allow the complete ${activeRouteMode} route.`);
			return;
		}
		setActiveRoute(route);
		setError('');
	}, [activeRouteMode, selectedParcelId, parcels, routeBlockedCells, travelWeights]);

	function cycleGridState(cell: WarehouseCell) {
		if (cell.kind === 'entry' || cell.kind === 'exit') return;
		const key = gridKey(cell.point);
		const current = simulatedStates.get(key) || ((occupancy.get(key) || 0) >= gridCapacity ? 'full' : (occupancy.get(key) || 0) > 0 ? 'partial' : 'empty');
		const next = current === 'empty' ? 'partial' : current === 'partial' ? 'full' : current === 'full' ? 'disabled' : 'empty';
		setSimulatedStates((states) => new Map(states).set(key, next));
	}

	function routeToParcel(parcel: Parcel) {
		const slot = slotByLocation.get(normalizeLocation(parcel.storage_location));
		if (!slot) {
			setError(`Location “${parcel.storage_location}” is not mapped on the warehouse grid.`);
			return;
		}
		const route = buildSingleRoute(parcel);
		if (!route) {
			setError(`No complete route from IN to ${parcel.storage_location} and OUT is available.`);
			return;
		}

		setError('');
		setSelectedParcelId(parcel.id);
		setSelectedLocation(normalizeLocation(parcel.storage_location));
		setActiveRoute(route);
	}

	function buildSingleRoute(parcel: Parcel | undefined): ActiveRoute | null {
		if (!parcel) return null;
		const slot = slotByLocation.get(normalizeLocation(parcel.storage_location));
		if (!slot || disabledCells.has(gridKey(slot.point))) return null;
		const routeToStorage = findPathToStorage(ENTRY, slot.point, routeBlockedCells, travelWeights);
		if (!routeToStorage) return null;
		const incomingApproach = routeToStorage.path[routeToStorage.path.length - 2];
		const routeToExit = findPathFromStorage(slot.point, EXIT, routeBlockedCells, travelWeights, incomingApproach);
		if (!routeToExit) return null;
		const path = [...routeToStorage.path, ...routeToExit.path.slice(1)];
		const totalCost = path.slice(1).reduce((cost, point) => cost + (travelWeights.get(gridKey(point)) ?? 1), 0);
		return {
			mode: 'single',
			path,
			stopNumbers: new Map([[gridKey(slot.point), 1]]),
			totalCost,
			stopCount: 1,
		};
	}

	function buildPriorityRoute(routeParcels: Parcel[]): ActiveRoute | null {
		const itemsByLocation = new Map<string, { parcel: Parcel; slot: StorageSlot }>();
		routeParcels
			.filter((parcel) => (parcel.status === 'out_of_stock' || parcel.status === 'low_stock') && rankedParcels.some((item) => item.parcel.id === parcel.id && item.accessible))
			.map((parcel) => ({ parcel, slot: slotByLocation.get(normalizeLocation(parcel.storage_location)) }))
			.filter((item): item is { parcel: Parcel; slot: StorageSlot } => Boolean(item.slot))
			.forEach((item) => {
				const key = gridKey(item.slot.point);
				const current = itemsByLocation.get(key);
				if (!current || statusRank[item.parcel.status] < statusRank[current.parcel.status]) itemsByLocation.set(key, item);
			});
		const remaining = [...itemsByLocation.values()];
		if (remaining.length === 0) return null;
		let plannedStops: typeof remaining = [];

		if (remaining.length <= 8) {
			let bestCost = Number.POSITIVE_INFINITY;
			let bestOrder: typeof remaining = [];
			const bestPrefixCost = new Map<string, number>();
			const searchOrders = (
				available: typeof remaining,
				current: GridPoint,
				order: typeof remaining,
				cost: number,
				incomingApproach?: GridPoint,
			) => {
				const stateKey = `${available.map((item) => gridKey(item.slot.point)).sort().join(',')}|${gridKey(current)}|${incomingApproach ? gridKey(incomingApproach) : 'start'}`;
				const previousCost = bestPrefixCost.get(stateKey);
				if (previousCost !== undefined && previousCost <= cost) return;
				bestPrefixCost.set(stateKey, cost);

				if (available.length === 0) {
					const exitLeg = findPathFromStorage(current, EXIT, routeBlockedCells, travelWeights, incomingApproach);
					if (!exitLeg) return;
					const completeCost = cost + exitLeg.distance;
					if (completeCost < bestCost) {
						bestCost = completeCost;
						bestOrder = order;
					}
					return;
				}

				const urgency = Math.min(...available.map(({ parcel }) => statusRank[parcel.status]));
				const candidates = available
					.filter(({ parcel }) => statusRank[parcel.status] === urgency)
					.sort((first, second) => first.parcel.parcel_code.localeCompare(second.parcel.parcel_code));
				for (const candidate of candidates) {
					const leg = order.length === 0
						? findPathToStorage(ENTRY, candidate.slot.point, routeBlockedCells, travelWeights)
						: findPathBetweenStorage(current, candidate.slot.point, routeBlockedCells, travelWeights, incomingApproach);
					if (!leg) continue;
					const nextCost = cost + leg.distance;
					if (nextCost >= bestCost) continue;
					const nextApproach = leg.path[leg.path.length - 2];
					searchOrders(available.filter((item) => item !== candidate), candidate.slot.point, [...order, candidate], nextCost, nextApproach);
				}
			};

			searchOrders(remaining, ENTRY, [], 0);
			if (bestOrder.length === 0) return null;
			plannedStops = bestOrder;
		} else {
			const unplanned = [...remaining];
			let current = ENTRY;
			let incomingApproach: GridPoint | undefined;
			while (unplanned.length > 0) {
				const urgency = Math.min(...unplanned.map(({ parcel }) => statusRank[parcel.status]));
				const next = unplanned
					.filter(({ parcel }) => statusRank[parcel.status] === urgency)
					.map((item) => ({
						...item,
						route: plannedStops.length === 0
							? findPathToStorage(ENTRY, item.slot.point, routeBlockedCells, travelWeights)
							: findPathBetweenStorage(current, item.slot.point, routeBlockedCells, travelWeights, incomingApproach),
					}))
					.filter((item) => item.route !== null)
					.sort((first, second) => first.route!.distance - second.route!.distance || first.parcel.parcel_code.localeCompare(second.parcel.parcel_code))[0];
				if (!next?.route) return null;
				plannedStops.push(next);
				current = next.slot.point;
				incomingApproach = next.route.path[next.route.path.length - 2];
				const locationKey = gridKey(next.slot.point);
				for (let index = unplanned.length - 1; index >= 0; index -= 1) {
					if (gridKey(unplanned[index].slot.point) === locationKey) unplanned.splice(index, 1);
				}
			}
		}

		const path: GridPoint[] = [];
		const stopNumbers = new Map<string, number>();
		let current = ENTRY;
		let incomingApproach: GridPoint | undefined;
		for (const [index, stop] of plannedStops.entries()) {
			const leg = index === 0
				? findPathToStorage(ENTRY, stop.slot.point, routeBlockedCells, travelWeights)
				: findPathBetweenStorage(current, stop.slot.point, routeBlockedCells, travelWeights, incomingApproach);
			if (!leg) return null;
			if (path.length === 0) path.push(...leg.path);
			else path.push(...leg.path.slice(1));
			stopNumbers.set(gridKey(stop.slot.point), index + 1);
			current = stop.slot.point;
			incomingApproach = leg.path[leg.path.length - 2];
		}

		const exitLeg = findPathFromStorage(current, EXIT, routeBlockedCells, travelWeights, incomingApproach);
		if (!exitLeg) return null;
		path.push(...exitLeg.path.slice(1));
		const totalCost = path.slice(1).reduce((cost, point) => cost + (travelWeights.get(gridKey(point)) ?? 1), 0);
		return { mode: 'priority', path, stopNumbers, totalCost, stopCount: plannedStops.length };
	}

	function createPriorityRoute() {
		const route = buildPriorityRoute(parcels);
		if (!route) {
			setError('No complete route to the mapped priority parcels and exit is available.');
			return;
		}
		setError('');
		setSelectedParcelId('');
		setSelectedLocation('');
		setActiveRoute(route);
	}

	function clearRoute() {
		setActiveRoute(null);
		setSelectedParcelId('');
		setSelectedLocation('');
		setError('');
	}

	function handleCellClick(cell: WarehouseCell) {
		if (editingAisles) {
			cycleGridState(cell);
			return;
		}
		if (!('location' in cell)) return;
		const locationKey = cell.location.toLowerCase();
		const storedParcels = parcelByLocation.get(locationKey) || [];
		if (storedParcels[0]) routeToParcel(storedParcels[0]);
		else {
			setSelectedLocation(locationKey);
			setSelectedParcelId('');
			setActiveRoute(null);
		}
	}

	return (
		<div className="page-stack">
			<div className="page-heading page-heading-actions">
				<div><p className="page-kicker">Warehouse HQ / Layout</p><h1>Grid Inventory Map</h1><p>Every grid is available for storage. Empty grids remain walkable.</p></div>
				<div className="map-heading-actions"><label>Capacity (units/grid) <input aria-label="Units per grid" type="number" min="1" value={gridCapacity} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value > 0) setGridCapacity(value); }} style={{ width: 75 }} /></label>
					<span className="map-status-summary"><MapPinned size={16} />{loading ? 'Loading positions' : `${rankedParcels.filter(({ slot }) => slot).length} parcels mapped`}</span>
					<button aria-pressed={editingAisles} className={`button ${editingAisles ? 'button-primary' : 'button-outline'}`} onClick={() => setEditingAisles((current) => !current)} title="Cycle grids: Empty, Partial, Full, Disabled/Wall" type="button"><SlidersHorizontal size={15} />{editingAisles ? 'Finish simulation' : 'Simulate grid states'}</button>
					<button className="button button-outline" disabled={!simulatedStates.size} onClick={() => setSimulatedStates(new Map())} type="button">Reset simulation</button><button className="button button-route" disabled={loading || !rankedParcels.some(({ parcel, slot }) => Boolean(slot) && rankedParcels.some((item) => item.parcel.id === parcel.id && item.accessible) && parcel.status !== 'in_stock')} onClick={createPriorityRoute} type="button"><Route size={15} /> Priority route</button>
				</div>
			</div>
			{unreachableStored.length > 0 && <div className="grid-access-alert" role="status">{unreachableStored.length} stored grids unreachable. Clear obstructions or restore a route to IN and OUT.</div>}
			{(blockedLines.rows.size > 0 || blockedLines.columns.size > 0) && <div className="grid-access-alert" role="status">Blocked barrier: {[...blockedLines.rows].map((row) => 'Row ' + (row + 1)).concat([...blockedLines.columns].map((column) => 'Column ' + (column + 1))).join(', ')}. Dashed borders mark unreachable grids.</div>}
			{editingAisles && <p className="page-footnote">Click storage grids to cycle Empty ? Partial ? Full ? Disabled/Wall ? Empty. Simulation changes displayed loads and routes. Reset restores inventory values.</p>}
			{error && <div className="inline-error" role="alert">{error}</div>}
			{activeRoute && <div className="route-summary" role="status"><span className="route-summary-icon"><Route size={16} /></span><span><strong>{activeRoute.mode === 'single' ? 'Single parcel route' : 'Priority collection route'}</strong><small>{activeRoute.stopCount} stop{activeRoute.stopCount === 1 ? '' : 's'} · {activeRoute.totalCost.toFixed(1)} weighted steps including exit</small></span><button aria-label="Clear route" className="route-clear" onClick={clearRoute} type="button">Clear route</button></div>}

			<div className="map-workspace">
				<section className="surface-panel map-panel">
					<div className="map-toolbar">
						<div className="map-legend"><span><i className="legend-square load-empty" />Empty / Walkable</span><span><i className="legend-square entry" />IN / Entrance</span><span><i className="legend-square exit" />OUT / Exit</span><span><i className="legend-square load-partial" />Partial / Caution</span><span><i className="legend-square load-full" />Full / Blocked</span><span><i className="legend-square load-disabled" />Disabled / Wall</span><span><Package size={13} />Stored</span><span><i className="legend-square unreachable" />Unreachable</span><span><i className="legend-square route" />Route outline</span></div>
						<span className="map-orientation">10 × 14 grid <ArrowUpRight size={13} /></span>
					</div>
					<div className="warehouse-grid-scroll"><div aria-label="10 by 14 warehouse storage grid" className="warehouse-grid" role="grid">
						{warehouseCells.map((cell) => {
							const key = gridKey(cell.point), pathIndex = pathIndices.get(key), stopNumber = activeRoute?.stopNumbers.get(key);
							const locationKey = 'location' in cell ? normalizeLocation(cell.location) : '';
							const records = (parcelByLocation.get(locationKey) || []).filter((parcel) => parcel.quantity > 0);
							const load = occupancy.get(key) || 0;
							const state = disabledCells.has(key) ? 'disabled' : routeBlockedCells.has(key) ? 'full' : load > 0 ? 'partial' : 'empty';
							const id = 'location' in cell ? cell.location : cell.kind === 'entry' ? 'IN' : 'OUT';
							const unreachable = state !== 'disabled' && !cellAccess.get(key);
							const status = state === 'disabled' ? 'N/A' : load > 0 ? 'Stored' : 'Empty';
							const pathStatus = state === 'disabled' || state === 'full' ? 'Blocked' : state === 'partial' ? 'Walkable (slow / caution)' : 'Walkable';
							const simulated = simulatedStates.has(key);
							const tooltip = 'Grid ID: ' + id + '\nStored Parcel IDs: ' + (records.map((parcel) => parcel.parcel_code).join(', ') || 'None') + '\nLoad: ' + load + '/' + gridCapacity + ' units' + (simulated ? ' (simulated; inventory unchanged)' : '') + '\nPath Status: ' + pathStatus + '\nRetrieval: ' + (state === 'disabled' ? 'Disabled' : unreachable ? 'Unreachable' : 'Accessible');
							const boundary = blockedLines.rows.has(cell.point.row) || blockedLines.columns.has(cell.point.column);
							return <button aria-label={tooltip.replace(/\n/g, ', ')} aria-pressed={locationKey ? selectedLocation === locationKey : undefined} className={'warehouse-cell ' + cell.kind + ' load-' + state + (unreachable ? ' grid-unreachable' : '') + (boundary ? ' blocked-boundary' : '') + (pathIndex !== undefined ? ' grid-route' : '') + (selectedLocation && selectedLocation === locationKey ? ' grid-selected' : '')} key={key} onClick={() => handleCellClick(cell)} role="gridcell" title={tooltip} type="button">
								<strong className="cell-label">{cell.kind === 'entry' && <ArrowDownLeft size={16} />}{cell.kind === 'exit' && <ArrowUpRight size={16} />}{id}</strong>
								<span className="cell-storage-status">{load > 0 && state !== 'disabled' && <Package size={11} />}{status}{state === 'disabled' ? '' : load > 0 ? ' ' + load : ''}</span>
								<small>{state === 'disabled' ? 'Wall' : state === 'full' ? 'FULL / Blocked' : state === 'partial' ? 'Caution' : 'Walkable'}</small>
								{unreachable && <span className="cell-access-warning">Unreachable</span>}{simulated && <span className="cell-simulated">Sim</span>}{stopNumber && <b className="stop-badge">{stopNumber}</b>}
							</button>;
						})}
					</div></div>
					{selectedLocation && <div className="map-selection"><strong>{selectedLocation.toUpperCase()}</strong>{selectedParcels.length ? selectedParcels.map((parcel) => <span key={parcel.id}>{parcel.parcel_code} · {parcel.company} · {parcel.quantity} units</span>) : <span>No parcel records at this location.</span>}{!activeRoute && <button aria-label="Clear selected location" onClick={() => setSelectedLocation('')} type="button">Clear</button>}</div>}
				</section>

				<aside className="surface-panel priority-panel">
					<div className="panel-heading"><div><h2><Route size={16} /> Package priority</h2><p>Accessible front stock first, then urgency and delay.</p></div><span className="panel-count">{rankedParcels.length.toString().padStart(2, '0')}</span></div>
					{rankedParcels.length ? <div className="priority-list">{rankedParcels.map(({ parcel, slot, distance, delay, front, suggestion }, index) => <button aria-current={selectedParcelId === parcel.id ? 'true' : undefined} className={`priority-row${selectedParcelId === parcel.id ? ' active' : ''}`} key={parcel.id} onClick={() => routeToParcel(parcel)} type="button"><span className={`priority-number priority-${parcel.status}`}>{String(index + 1).padStart(2, '0')}</span><span className="priority-main"><strong>{parcel.company}</strong><span><b>{parcel.parcel_code}</b> · {parcel.storage_location} · Qty {parcel.quantity}{parcel.fragile && <em>Fragile</em>}</span></span><span className="priority-meta"><span className={`status-badge ${parcel.status}`}>{statusText[parcel.status]}</span><small>{!slot ? 'Unmapped' : distance === null ? 'Unreachable' : `${distance.toFixed(1)} weighted steps`}{delay !== null && ` ? ~${delay} min delay`}{front > 0 && ` ? ${front} records in front`}{suggestion && ` ? Suggested: ${suggestion}`}</small></span><ArrowRight className="priority-arrow" size={14} /></button>)}</div> : <div className="map-empty"><Boxes size={20} /><p>{loading ? 'Loading priority list…' : 'No parcels are available yet.'}</p><small>Check in inventory to populate mapped locations and route distances.</small></div>}
				</aside>
			</div>
			<p className="page-footnote"><Route size={14} />Four-way routing: partial grids increase travel cost; full grids block passage but remain retrievable from an open neighboring grid. Estimates: 10 seconds per weighted step, 5 minutes per obstruction, 2 minutes per newer stack record. Capacity and simulation edits apply to this map session.</p>
		</div>
	);
}
