import type { Parcel } from '../../workspaceApi';
import { findPathToStorage, findPathFromStorage, findShortestPath, gridKey } from './dijkstra';
import { ENTRY, EXIT, storageSlots, normalizeLocation, type StorageSlot } from './warehouseLayout';

export type PlacementSuggestion = {
	slot: StorageSlot;
	used: number;
	remaining: number;
	distance: number;
};

// Best fit packs existing cells first, leaving empty cells available for larger arrivals.
export function suggestPlacements(parcels: Parcel[], quantity: number, capacity: number, kind: StorageSlot['kind']): PlacementSuggestion[] {
	if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(capacity) || capacity <= 0) return [];
	const occupancy = new Map<string, number>();
	for (const parcel of parcels) {
		const key = normalizeLocation(parcel.storage_location);
		occupancy.set(key, (occupancy.get(key) || 0) + Math.max(0, Number(parcel.quantity)));
	}
	const load = (slot: StorageSlot) => occupancy.get(normalizeLocation(slot.location)) || 0;
	const blocked = new Set(storageSlots.filter((slot) => load(slot) >= capacity).map((slot) => gridKey(slot.point)));
	const accessible = (slot: StorageSlot, obstacles: Set<string>) => {
		const incoming = findPathToStorage(ENTRY, slot.point, obstacles);
		return incoming && findPathFromStorage(slot.point, EXIT, obstacles, new Map(), incoming.path.at(-2)) ? incoming : null;
	};
	const currentlyAccessible = storageSlots.filter((slot) => load(slot) > 0 && accessible(slot, blocked));
	const suggestions: PlacementSuggestion[] = [];
	for (const slot of storageSlots) {
		const used = load(slot);
		if (slot.kind !== kind || used + quantity > capacity) continue;
		const route = accessible(slot, blocked);
		if (!route) continue;
		const after = new Set(blocked);
		if (used + quantity === capacity) after.add(gridKey(slot.point));
		// A newly full cell must not cut the circulation route or isolate stored stock.
		if (!findShortestPath(ENTRY, EXIT, after) || !accessible(slot, after)) continue;
		if (used + quantity === capacity && currentlyAccessible.some((stored) => !accessible(stored, after))) continue;
		suggestions.push({ slot, used, remaining: capacity - used - quantity, distance: route.distance });
	}
	return suggestions.sort((a, b) => a.remaining - b.remaining || a.distance - b.distance || a.slot.location.localeCompare(b.slot.location));
}
