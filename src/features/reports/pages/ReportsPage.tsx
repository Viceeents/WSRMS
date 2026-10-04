import { useEffect, useState } from 'react';
import { ArrowDownToLine, BarChart3, ClipboardList, FileText, PackageSearch, TriangleAlert } from 'lucide-react';
import { apiRequest, errorMessage, type InventoryTransaction, type Parcel } from '../../workspaceApi';

type ReportDefinition = {
	title: string;
	description: string;
	icon: typeof PackageSearch;
	data: 'inventory' | 'transactions' | 'low-stock' | 'monthly';
};

const reports: ReportDefinition[] = [
	{ title: 'Inventory summary', description: 'Current parcel quantities, stock status, and warehouse locations.', icon: PackageSearch, data: 'inventory' },
	{ title: 'Transaction audit log', description: 'Timestamped check-in and dispatch movements.', icon: ClipboardList, data: 'transactions' },
	{ title: 'Low stock report', description: 'Parcels at or below their reorder threshold.', icon: TriangleAlert, data: 'low-stock' },
	{ title: 'Operations summary', description: 'Aggregated parcel movements for the selected period.', icon: BarChart3, data: 'monthly' },
];

function downloadCsv(filename: string, rows: string[][]) {
	const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
	const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

export default function ReportsPage() {
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

	function exportReport(report: ReportDefinition) {
		const date = new Date().toISOString().slice(0, 10);
		if (report.data === 'inventory' || report.data === 'low-stock') {
			const data = report.data === 'low-stock' ? parcels.filter((parcel) => parcel.status !== 'in_stock') : parcels;
			const rows = [['Parcel ID', 'Company', 'Category', 'Location', 'Quantity', 'Weight (kg)', 'Status', 'Received']];
			data.forEach((parcel) => rows.push([parcel.parcel_code, parcel.company, parcel.category_name || '', parcel.storage_location, String(parcel.quantity), String(parcel.weight_kg ?? ''), parcel.status, parcel.received_at]));
			downloadCsv(`${report.data}-${date}.csv`, rows);
			return;
		}

		const data = report.data === 'monthly'
			? transactions.filter((item) => new Date(item.occurred_at).getMonth() === new Date().getMonth() && new Date(item.occurred_at).getFullYear() === new Date().getFullYear())
			: transactions;
		const rows = [['Transaction ID', 'Type', 'Parcel ID', 'Company', 'Quantity', 'Staff', 'Recipient', 'Timestamp']];
		data.forEach((item) => rows.push([item.transaction_code, item.type, item.parcel_code, item.company, String(item.quantity), item.staff_name || '', item.recipient || '', item.occurred_at]));
		downloadCsv(`${report.data}-${date}.csv`, rows);
	}

	return (
		<div className="page-stack">
			<div className="page-heading"><div><p className="page-kicker">Warehouse HQ / Insights</p><h1>Reports</h1><p>Download current inventory and operational activity as CSV files.</p></div></div>
			{error && <div className="inline-error" role="alert">Could not load report data: {error}</div>}
			<div className="report-summary"><div><span>Tracked parcels</span><strong>{loading ? '—' : parcels.length}</strong></div><div><span>Recorded movements</span><strong>{loading ? '—' : transactions.length}</strong></div><div><span>Stock alerts</span><strong>{loading ? '—' : parcels.filter((parcel) => parcel.status !== 'in_stock').length}</strong></div></div>
			<div className="report-grid">{reports.map(({ title, description, icon: Icon, data }) => <article className="report-row" key={data}><div className="report-icon"><Icon size={19} /></div><div className="report-copy"><h2>{title}</h2><p>{description}</p></div><span className="report-format"><FileText size={13} /> CSV</span><button className="button button-outline" disabled={loading} onClick={() => exportReport({ title, description, icon: Icon, data })} type="button"><ArrowDownToLine size={15} /> Export</button></article>)}</div>
			<p className="page-footnote">Exports reflect records currently available to your account.</p>
		</div>
	);
}
