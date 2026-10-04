import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, PackagePlus } from 'lucide-react';
import { apiRequest, errorMessage, type Category, type Parcel } from '../../workspaceApi';
import { suggestPlacements } from '../../grid-map/utils/placement';
import { DEFAULT_GRID_CAPACITY, type StorageSlot } from '../../grid-map/utils/warehouseLayout';

type CheckInPageProps = {
	onComplete: () => void;
};

export default function CheckInPage({ onComplete }: CheckInPageProps) {
	const [categories, setCategories] = useState<Category[]>([]);
	const [parcels, setParcels] = useState<Parcel[]>([]);
	const [storageKind, setStorageKind] = useState<StorageSlot['kind']>('rack');
	const [capacity, setCapacity] = useState(String(DEFAULT_GRID_CAPACITY));
	const [placementLoading, setPlacementLoading] = useState(true);
	const [placementError, setPlacementError] = useState('');
	const [company, setCompany] = useState('');
	const [categoryId, setCategoryId] = useState('');
	const [location, setLocation] = useState('');
	const [supplier, setSupplier] = useState('');
	const [quantity, setQuantity] = useState('1');
	const [weight, setWeight] = useState('');
	const [threshold, setThreshold] = useState('0');
	const [notes, setNotes] = useState('');
	const [fragile, setFragile] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		apiRequest<{ items: Category[] }>('/api/categories')
			.then((result) => setCategories(result.items))
			.catch((reason: unknown) => setError(errorMessage(reason)));
	}, []);

	useEffect(() => {
		let cancelled = false;
		async function refresh() {
			try {
				const result = await apiRequest<{ items: Parcel[] }>('/api/inventory');
				if (!cancelled) { setParcels(result.items); setPlacementError(''); }
			} catch (reason) {
				if (!cancelled) setPlacementError(errorMessage(reason));
			} finally {
				if (!cancelled) setPlacementLoading(false);
			}
		}
		void refresh();
		const interval = window.setInterval(() => void refresh(), 15000);
		return () => { cancelled = true; window.clearInterval(interval); };
	}, []);

	const suggestions = useMemo(() => suggestPlacements(parcels, Number(quantity), Number(capacity), storageKind), [parcels, quantity, capacity, storageKind]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError('');
		const suffix = globalThis.crypto.randomUUID().slice(0, 8).toUpperCase();
		try {
			await apiRequest('/api/inventory', {
				method: 'POST',
				body: JSON.stringify({
					parcelCode: `PKG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${suffix}`,
					company,
					categoryId: categoryId || null,
					supplier: supplier || null,
					storageLocation: location,
					fragile,
					quantity: Number(quantity),
					weightKg: weight ? Number(weight) : null,
					reorderThreshold: Number(threshold),
					notes: notes || null,
				}),
			});
			onComplete();
		} catch (reason) {
			setError(errorMessage(reason));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="page-stack">
			<div className="page-heading"><div><p className="page-kicker">Warehouse HQ / Receiving</p><h1>Parcel Check-In</h1><p>Record an incoming parcel and add it to warehouse stock.</p></div></div>
			<div className="form-page-layout">
				<form className="surface-panel operation-form" onSubmit={handleSubmit}>
					<div className="form-section-heading"><span className="form-section-icon"><PackagePlus size={18} /></span><div><h2>Incoming parcel</h2><p>A unique parcel ID will be generated when saved.</p></div></div>
					{error && <div className="inline-error" role="alert">{error}</div>}
					<label className="form-field"><span>Company / sender</span><input autoComplete="organization" onChange={(event) => setCompany(event.target.value)} placeholder="e.g. DigiParts Asia" required value={company} /></label>
					<label className="form-field"><span>Category <small>Optional</small></span><select onChange={(event) => setCategoryId(event.target.value)} value={categoryId}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
					<label className="form-field"><span>Storage location</span><input onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Rack A-13" required value={location} /></label>
					<label className="form-field"><span>Supplier / source <small>Optional</small></span><input onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier or origin" value={supplier} /></label>
					<div className="form-two-columns">
						<label className="form-field"><span>Quantity</span><input min="1" onChange={(event) => setQuantity(event.target.value)} required type="number" value={quantity} /></label>
						<label className="form-field"><span>Weight <small>kg · optional</small></span><input min="0" onChange={(event) => setWeight(event.target.value)} placeholder="0.00" step="0.01" type="number" value={weight} /></label>
					</div>
					<div className="form-two-columns">
						<label className="form-field"><span>Reorder threshold</span><input min="0" onChange={(event) => setThreshold(event.target.value)} required type="number" value={threshold} /></label>
						<label className="check-field"><input checked={fragile} onChange={(event) => setFragile(event.target.checked)} type="checkbox" /><span>Fragile handling</span></label>
					</div>
					<label className="form-field"><span>Notes <small>Optional</small></span><textarea onChange={(event) => setNotes(event.target.value)} placeholder="Arrival condition or remarks" rows={3} value={notes} /></label>
					<div className="form-actions"><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Recording…' : 'Record parcel'} <ArrowRight size={15} /></button><span className="form-note">Check-in is recorded in the audit trail.</span></div>
				</form>
				<aside className="form-aside-note placement-panel">
					<p className="page-kicker">Storage planner</p><h2>Suggested placements</h2>
					<p>Fill the best-fitting cells first to leave room for future arrivals and keep stock accessible.</p>
					<label className="form-field"><span>Storage type</span><select value={storageKind} onChange={(event) => setStorageKind(event.target.value as StorageSlot['kind'])}><option value="rack">Rack / general storage</option><option value="vault">Vault</option><option value="cold">Cold storage</option></select></label>
					<label className="form-field"><span>Capacity (units per grid)</span><input type="number" min="1" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
					<div aria-live="polite">
						{placementLoading ? <p>Loading warehouse stock…</p> : placementError ? <p role="alert">Suggestions unavailable: {placementError}</p> : suggestions.length ? suggestions.slice(0, 3).map((suggestion, index) => <div className="placement-option" key={suggestion.slot.location}>
							<strong>{index === 0 ? 'Best fit: ' : ''}{suggestion.slot.location}</strong>
							<small>Grid row {suggestion.slot.point.row + 1}, column {suggestion.slot.point.column + 1} · {suggestion.used + Number(quantity)}/{capacity} units after placement · {suggestion.remaining} free</small>
							<button className="button button-outline" type="button" disabled={busy} onClick={() => setLocation(suggestion.slot.location)}>{location === suggestion.slot.location ? 'Selected' : 'Use location'}</button>
						</div>) : <p>No accessible cell can fit this quantity. Check the quantity and capacity, select another storage type, or split the arrival into smaller check-ins.</p>}
					</div>
					<div className="note-rule" /><small>Uses live inventory quantities, refreshed every 15 seconds. Set capacity to match the grid map. Map simulations are excluded. Suggestions assume equal-sized units; weight and dimensions are not modeled.</small>
				</aside>
			</div>
		</div>
	);
}
