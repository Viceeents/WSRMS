import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Map, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { WorkspaceSection } from '../../../components/layout/Sidebar';
import { apiRequest, errorMessage, formatDate, type Category, type Parcel, type ParcelStatus } from '../../workspaceApi';

type InventoryPageProps = {
	onNavigate: (section: WorkspaceSection) => void;
	isAdmin: boolean;
};

const statusLabels: Record<ParcelStatus, string> = {
	in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock',
};

export default function InventoryPage({ onNavigate, isAdmin }: InventoryPageProps) {
	const [parcels, setParcels] = useState<Parcel[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [search, setSearch] = useState('');
	const [status, setStatus] = useState('all');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);
	const [categoryName, setCategoryName] = useState('');
	const [categoryDescription, setCategoryDescription] = useState('');
	const [categoryError, setCategoryError] = useState('');
	const [editError, setEditError] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		Promise.all([
			apiRequest<{ items: Parcel[] }>('/api/inventory'),
			apiRequest<{ items: Category[] }>('/api/categories'),
		]).then(([inventory, categoryList]) => {
			setParcels(inventory.items);
			setCategories(categoryList.items);
		}).catch((reason: unknown) => setError(errorMessage(reason)))
			.finally(() => setLoading(false));
	}, []);

	async function saveCategory(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setCategoryError('');
		try {
			const payload = { name: categoryName, description: categoryDescription || null };
			const result = await apiRequest<{ category: Category }>(
				editingCategory ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories',
				{ method: editingCategory ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
			);
			setCategories((current) => editingCategory
				? current.map((category) => category.id === result.category.id ? result.category : category)
				: [...current, result.category].sort((left, right) => left.name.localeCompare(right.name)));
			setEditingCategory(null);
			setCategoryName('');
			setCategoryDescription('');
		} catch (reason) {
			setCategoryError(errorMessage(reason));
		} finally {
			setBusy(false);
		}
	}

	async function deleteCategory(category: Category) {
		if (!window.confirm(`Delete the ${category.name} category? Parcels will become uncategorized.`)) return;
		setCategoryError('');
		try {
			await apiRequest(`/api/admin/categories/${category.id}`, { method: 'DELETE' });
			setCategories((current) => current.filter((item) => item.id !== category.id));
			setParcels((current) => current.map((parcel) => parcel.category_id === category.id
				? { ...parcel, category_id: null, category_name: null }
				: parcel));
		} catch (reason) {
			setCategoryError(errorMessage(reason));
		}
	}

	async function saveParcel(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!editingParcel) return;
		setBusy(true);
		setEditError('');
		try {
			const result = await apiRequest<{ parcel: Parcel }>(`/api/admin/inventory/${editingParcel.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					company: editingParcel.company,
					categoryId: editingParcel.category_id,
					supplier: editingParcel.supplier || null,
					storageLocation: editingParcel.storage_location,
					fragile: editingParcel.fragile,
					weightKg: editingParcel.weight_kg === null || editingParcel.weight_kg === '' ? null : Number(editingParcel.weight_kg),
					reorderThreshold: Number(editingParcel.reorder_threshold),
					notes: editingParcel.notes || null,
				}),
			});
			const category = categories.find((item) => item.id === result.parcel.category_id);
			setParcels((current) => current.map((parcel) => parcel.id === result.parcel.id
				? { ...result.parcel, category_name: category?.name ?? null }
				: parcel));
			setEditingParcel(null);
		} catch (reason) {
			setEditError(errorMessage(reason));
		} finally {
			setBusy(false);
		}
	}

	async function deleteParcel(parcel: Parcel) {
		if (!window.confirm(`Delete parcel ${parcel.parcel_code}? Parcels with transaction history cannot be deleted.`)) return;
		setEditError('');
		try {
			await apiRequest(`/api/admin/inventory/${parcel.id}`, { method: 'DELETE' });
			setParcels((current) => current.filter((item) => item.id !== parcel.id));
			if (editingParcel?.id === parcel.id) setEditingParcel(null);
		} catch (reason) {
			setEditError(errorMessage(reason));
		}
	}

	const filtered = useMemo(() => parcels.filter((parcel) => {
		const term = search.trim().toLowerCase();
		const matchesSearch = !term || [parcel.parcel_code, parcel.company, parcel.storage_location].some((value) => value.toLowerCase().includes(term));
		return matchesSearch && (status === 'all' || parcel.status === status);
	}), [parcels, search, status]);

	return (
		<div className="page-stack">
			<div className="page-heading page-heading-actions"><div><p className="page-kicker">Warehouse HQ / Stock control</p><h1>Inventory</h1><p>{parcels.length} parcel records · {filtered.length} shown</p></div><div className="heading-actions"><button className="button button-primary" onClick={() => onNavigate('check-in')} type="button"><ArrowDownToLine size={15} /> Check-in</button><button className="button button-quiet" onClick={() => onNavigate('dispatch')} type="button"><ArrowUpFromLine size={15} /> Dispatch</button><button className="button button-outline" onClick={() => onNavigate('grid-map')} type="button"><Map size={15} /> Map</button></div></div>
			{isAdmin && <section className="surface-panel admin-catalog">
				<div className="panel-heading"><div><h2>Category management</h2><p>Maintain the catalog used on incoming parcel records.</p></div></div>
				<div className="catalog-content">
					<form className="category-form" onSubmit={saveCategory}>
						<label className="form-field"><span>Category name</span><input onChange={(event) => setCategoryName(event.target.value)} required value={categoryName} /></label>
						<label className="form-field"><span>Description <small>Optional</small></span><input onChange={(event) => setCategoryDescription(event.target.value)} value={categoryDescription} /></label>
						<div className="category-form-actions"><button className="button button-primary" disabled={busy} type="submit">{editingCategory ? <Pencil size={14} /> : <Plus size={14} />}{editingCategory ? ' Save category' : ' Add category'}</button>{editingCategory && <button className="button button-quiet" onClick={() => { setEditingCategory(null); setCategoryName(''); setCategoryDescription(''); }} type="button"><X size={14} /> Cancel</button>}</div>
					</form>
					<div className="category-list">
						{categories.map((category) => <div className="category-row" key={category.id}><div><strong>{category.name}</strong><small>{category.description || 'No description'}</small></div><div className="category-row-actions"><button aria-label={`Edit ${category.name}`} className="icon-action" onClick={() => { setEditingCategory(category); setCategoryName(category.name); setCategoryDescription(category.description || ''); }} title="Edit category" type="button"><Pencil size={14} /></button><button aria-label={`Delete ${category.name}`} className="icon-action reject-action" onClick={() => void deleteCategory(category)} title="Delete category" type="button"><Trash2 size={14} /></button></div></div>)}
						{categories.length === 0 && <p className="category-empty">No categories yet.</p>}
					</div>
					{categoryError && <div className="inline-error" role="alert">{categoryError}</div>}
				</div>
			</section>}
			{isAdmin && editingParcel && <form className="surface-panel operation-form inventory-edit-form" onSubmit={saveParcel}>
				<div className="form-section-heading"><span className="form-section-icon"><Pencil size={16} /></span><div><h2>Edit {editingParcel.parcel_code}</h2><p>Stock quantity changes must be recorded as check-in or dispatch transactions.</p></div><button aria-label="Close parcel editor" className="icon-action" onClick={() => setEditingParcel(null)} type="button"><X size={15} /></button></div>
				{editError && <div className="inline-error" role="alert">{editError}</div>}
				<div className="form-two-columns"><label className="form-field"><span>Company</span><input onChange={(event) => setEditingParcel((current) => current ? { ...current, company: event.target.value } : current)} required value={editingParcel.company} /></label><label className="form-field"><span>Category</span><select onChange={(event) => setEditingParcel((current) => current ? { ...current, category_id: event.target.value || null } : current)} value={editingParcel.category_id || ''}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
				<div className="form-two-columns"><label className="form-field"><span>Storage location</span><input onChange={(event) => setEditingParcel((current) => current ? { ...current, storage_location: event.target.value } : current)} required value={editingParcel.storage_location} /></label><label className="form-field"><span>Supplier</span><input onChange={(event) => setEditingParcel((current) => current ? { ...current, supplier: event.target.value || null } : current)} value={editingParcel.supplier || ''} /></label></div>
				<div className="form-two-columns"><label className="form-field"><span>Weight (kg)</span><input min="0" onChange={(event) => setEditingParcel((current) => current ? { ...current, weight_kg: event.target.value ? Number(event.target.value) : null } : current)} step="0.01" type="number" value={editingParcel.weight_kg ?? ''} /></label><label className="form-field"><span>Reorder threshold</span><input min="0" onChange={(event) => setEditingParcel((current) => current ? { ...current, reorder_threshold: Number(event.target.value) } : current)} type="number" value={editingParcel.reorder_threshold} /></label></div>
				<label className="check-field"><input checked={editingParcel.fragile} onChange={(event) => setEditingParcel((current) => current ? { ...current, fragile: event.target.checked } : current)} type="checkbox" /><span>Fragile handling</span></label>
				<label className="form-field"><span>Notes</span><textarea onChange={(event) => setEditingParcel((current) => current ? { ...current, notes: event.target.value || null } : current)} rows={3} value={editingParcel.notes || ''} /></label>
				<div className="form-actions"><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save changes'}</button><button className="button button-quiet" onClick={() => setEditingParcel(null)} type="button">Cancel</button></div>
			</form>}
			<div className="inventory-toolbar"><label className="search-box"><Search size={17} /><span className="sr-only">Search inventory</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search company, parcel ID, or location…" value={search} /></label><label className="filter-select"><SlidersHorizontal size={15} /><span className="sr-only">Filter by stock status</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select></label></div>
			{error && <div className="inline-error" role="alert">Could not load inventory: {error}</div>}
			<section className="surface-panel inventory-panel"><div className="table-scroll"><table className="data-table inventory-table"><thead><tr><th>Parcel ID</th><th>Company</th><th>Category</th><th>Handling</th><th>Location</th><th>Qty</th><th>Weight</th><th>Status</th><th>Arrival</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>
				{filtered.map((parcel) => <tr key={parcel.id}><td className="mono link-tone">{parcel.parcel_code}</td><td><strong>{parcel.company}</strong></td><td>{parcel.category_name || '—'}</td><td><span className={`handling-badge${parcel.fragile ? ' fragile' : ''}`}>{parcel.fragile ? 'Fragile' : 'Standard'}</span></td><td className="mono">{parcel.storage_location}</td><td className="mono quantity-cell">{parcel.quantity}</td><td className="mono muted-cell">{parcel.weight_kg ? `${parcel.weight_kg} kg` : '—'}</td><td><span className={`status-badge ${parcel.status}`}>{statusLabels[parcel.status]}</span></td><td className="mono muted-cell">{formatDate(parcel.received_at)}</td>{isAdmin && <td className="inventory-row-actions"><button aria-label={`Edit parcel ${parcel.parcel_code}`} className="icon-action" onClick={() => { setEditingParcel(parcel); setEditError(''); }} title="Edit parcel" type="button"><Pencil size={14} /></button><button aria-label={`Delete parcel ${parcel.parcel_code}`} className="icon-action reject-action" onClick={() => void deleteParcel(parcel)} title="Delete parcel" type="button"><Trash2 size={14} /></button></td>}</tr>)}
				{loading && <tr><td className="table-empty" colSpan={isAdmin ? 10 : 9}>Loading inventory…</td></tr>}
				{!loading && !error && filtered.length === 0 && <tr><td className="table-empty" colSpan={isAdmin ? 10 : 9}>{parcels.length ? 'No parcels match your search.' : 'No parcels yet. Record a check-in to start your inventory.'}</td></tr>}
			</tbody></table></div></section>
		</div>
	);
}
