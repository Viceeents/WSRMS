import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Search } from 'lucide-react';
import { apiRequest, errorMessage, formatDateTime, type InventoryTransaction } from '../../workspaceApi';

export default function TransactionsPage() {
	const [items, setItems] = useState<InventoryTransaction[]>([]);
	const [filter, setFilter] = useState<'all' | 'check_in' | 'dispatch'>('all');
	const [search, setSearch] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		apiRequest<{ items: InventoryTransaction[] }>('/api/transactions')
			.then((result) => setItems(result.items))
			.catch((reason: unknown) => setError(errorMessage(reason)))
			.finally(() => setLoading(false));
	}, []);

	const filtered = useMemo(() => items.filter((item) => {
		const matchesType = filter === 'all' || item.type === filter;
		const term = search.trim().toLowerCase();
		const matchesSearch = !term || [item.transaction_code, item.parcel_code, item.company, item.staff_name || '', item.recipient || ''].some((value) => value.toLowerCase().includes(term));
		return matchesType && matchesSearch;
	}), [filter, items, search]);

	return (
		<div className="page-stack">
			<div className="page-heading page-heading-actions"><div><p className="page-kicker">Warehouse HQ / Audit</p><h1>Transaction History</h1><p>Timestamped record of every inventory movement.</p></div><div className="filter-tabs" role="group" aria-label="Filter transaction type">
				{(['all', 'check_in', 'dispatch'] as const).map((value) => <button className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)} type="button">{value === 'all' ? 'All activity' : value === 'check_in' ? 'Check-in' : 'Dispatch'}</button>)}
			</div></div>
			<label className="search-box transaction-search"><Search size={17} /><span className="sr-only">Search transaction history</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, parcel, company, or staff…" value={search} /></label>
			{error && <div className="inline-error" role="alert">Could not load transactions: {error}</div>}
			<section className="surface-panel"><div className="table-scroll"><table className="data-table transaction-table"><thead><tr><th>Transaction ID</th><th>Type</th><th>Parcel</th><th>Company</th><th>Qty</th><th>Staff</th><th>Recipient / note</th><th>Timestamp</th></tr></thead><tbody>
				{filtered.map((item) => <tr key={item.id}><td className="mono link-tone">{item.transaction_code}</td><td><span className={`type-pill ${item.type}`}>{item.type === 'check_in' ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}{item.type === 'check_in' ? 'Check-in' : 'Dispatch'}</span></td><td className="mono">{item.parcel_code}</td><td>{item.company}</td><td className="mono quantity-cell">{item.quantity}</td><td>{item.staff_name || '—'}</td><td className="muted-cell">{item.recipient || item.note || '—'}</td><td className="mono muted-cell">{formatDateTime(item.occurred_at)}</td></tr>)}
				{loading && <tr><td className="table-empty" colSpan={8}>Loading transaction history…</td></tr>}
				{!loading && filtered.length === 0 && <tr><td className="table-empty" colSpan={8}>No transactions match this view.</td></tr>}
			</tbody></table></div></section>
			<p className="page-footnote"><ArrowLeftRight size={14} /> {filtered.length} movement{filtered.length === 1 ? '' : 's'} · transaction records are immutable</p>
		</div>
	);
}
