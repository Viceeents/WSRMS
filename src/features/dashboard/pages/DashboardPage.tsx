import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Boxes, CircleAlert, PackageCheck } from 'lucide-react';
import type { WorkspaceSection } from '../../../components/layout/Sidebar';
import { apiRequest, errorMessage, formatDateTime, type InventoryTransaction, type Parcel } from '../../workspaceApi';

type DashboardPageProps = {
	onNavigate: (section: WorkspaceSection) => void;
};

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
	const [parcels, setParcels] = useState<Parcel[]>([]);
	const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		Promise.all([
			apiRequest<{ items: Parcel[] }>('/api/inventory'),
			apiRequest<{ items: InventoryTransaction[] }>('/api/transactions'),
		]).then(([inventory, history]) => {
			setParcels(inventory.items);
			setTransactions(history.items);
		}).catch((reason: unknown) => setError(errorMessage(reason)))
			.finally(() => setLoading(false));
	}, []);

	const lowStock = parcels.filter((parcel) => parcel.status === 'low_stock');
	const outOfStock = parcels.filter((parcel) => parcel.status === 'out_of_stock');
	const inStock = parcels.filter((parcel) => parcel.status === 'in_stock');
	const todayKey = new Date().toDateString();
	const todayTransactions = transactions.filter((item) => new Date(item.occurred_at).toDateString() === todayKey);
	const todayCheckIns = todayTransactions.filter((item) => item.type === 'check_in');
	const todayDispatches = todayTransactions.filter((item) => item.type === 'dispatch');
	const todayUnits = todayTransactions.reduce((total, item) => total + item.quantity, 0);
	const alerts = [...outOfStock, ...lowStock].slice(0, 4);

	return (
		<div className="page-stack">
			<div className="page-heading dashboard-heading">
				<div><p className="page-kicker">Warehouse HQ / Overview</p><h1>Operations Dashboard</h1><p>Live inventory and movement across your warehouse.</p></div>
				<div className="dashboard-date">{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}</div>
			</div>
			{error && <div className="inline-error" role="alert">Could not load dashboard data: {error}</div>}
			<section className="stat-grid" aria-label="Inventory summary">
				<article className="stat-card"><div className="stat-top"><span>Total parcels</span><Boxes size={18} /></div><strong>{loading ? '—' : parcels.length}</strong><small>Tracked parcel records</small></article>
				<article className="stat-card stat-good"><div className="stat-top"><span>In stock</span><PackageCheck size={18} /></div><strong>{loading ? '—' : inStock.length}</strong><small>Above reorder threshold</small></article>
				<article className="stat-card stat-warning"><div className="stat-top"><span>Low stock</span><CircleAlert size={18} /></div><strong>{loading ? '—' : lowStock.length}</strong><small>Reorder soon</small></article>
				<article className="stat-card stat-danger"><div className="stat-top"><span>Out of stock</span><CircleAlert size={18} /></div><strong>{loading ? '—' : outOfStock.length}</strong><small>Needs replenishment</small></article>
			</section>

			<button className="map-callout" onClick={() => onNavigate('grid-map')} type="button">
				<span className="map-callout-icon"><Boxes size={20} /></span>
				<span className="map-callout-copy"><strong>Grid inventory map</strong><small>See storage positions and parcel stock status</small></span>
				<span className="map-callout-action">Open map <ArrowRight size={15} /></span>
			</button>

			<div className="dashboard-columns">
				<section className="surface-panel">
					<div className="panel-heading"><div><h2>Recent transactions</h2><p>Latest warehouse movements</p></div><button className="text-action" onClick={() => onNavigate('transactions')} type="button">View all <ArrowRight size={14} /></button></div>
					<div className="table-scroll"><table className="data-table"><thead><tr><th>Transaction</th><th>Type</th><th>Parcel / company</th><th>Qty</th><th>Staff</th></tr></thead><tbody>
						{transactions.slice(0, 5).map((item) => <tr key={item.id}><td className="mono link-tone">{item.transaction_code}</td><td><span className={`type-pill ${item.type}`}>{item.type === 'check_in' ? 'Check-in' : 'Dispatch'}</span></td><td><strong>{item.company}</strong><small className="cell-subtext">{item.parcel_code}</small></td><td className="mono">{item.quantity}</td><td>{item.staff_name || '—'}</td></tr>)}
						{!loading && transactions.length === 0 && <tr><td className="table-empty" colSpan={5}>No transactions recorded yet.</td></tr>}
						{loading && <tr><td className="table-empty" colSpan={5}>Loading warehouse activity…</td></tr>}
					</tbody></table></div>
				</section>
				<div className="dashboard-side-stack">
					<section className="surface-panel">
						<div className="panel-heading"><div><h2>Stock alerts</h2><p>Parcels at or below threshold</p></div><span className="panel-count">{alerts.length.toString().padStart(2, '0')}</span></div>
						<div className="alert-list">
							{alerts.map((parcel) => <div className="alert-row" key={parcel.id}><div><strong>{parcel.company}</strong><small>{parcel.parcel_code} · {parcel.storage_location}</small></div><span className={`status-badge ${parcel.status}`}>{parcel.status === 'out_of_stock' ? 'Out' : 'Low'}</span></div>)}
							{!loading && alerts.length === 0 && <p className="panel-empty">No stock alerts. Inventory is above its thresholds.</p>}
						</div>
					</section>
					<section className="activity-panel"><div className="activity-title"><span>Today’s movement</span><span className="live-dot" /></div><div className="activity-metrics"><div><small>Check-ins</small><strong>{loading ? '—' : todayCheckIns.length}</strong></div><div><small>Dispatches</small><strong>{loading ? '—' : todayDispatches.length}</strong></div><div><small>Units moved</small><strong>{loading ? '—' : todayUnits}</strong></div></div></section>
					<div className="quick-actions"><button onClick={() => onNavigate('check-in')} type="button"><ArrowDownToLine size={15} /> Check in</button><button onClick={() => onNavigate('dispatch')} type="button"><ArrowUpFromLine size={15} /> Dispatch</button></div>
				</div>
			</div>
			{transactions[0] && <p className="page-footnote">Latest activity {formatDateTime(transactions[0].occurred_at)}</p>}
		</div>
	);
}
