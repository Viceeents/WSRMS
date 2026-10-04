import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Search, ShieldCheck, UserRoundX, X } from 'lucide-react';
import { apiRequest, errorMessage, formatDate, type ManagedUser } from '../../workspaceApi';

type UserFilter = 'all' | ManagedUser['status'];

export default function UsersPage() {
	const [users, setUsers] = useState<ManagedUser[]>([]);
	const [filter, setFilter] = useState<UserFilter>('all');
	const [search, setSearch] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);
	const [updatingId, setUpdatingId] = useState('');

	async function loadUsers() {
		setLoading(true);
		try {
			const result = await apiRequest<{ items: ManagedUser[] }>('/api/admin/users');
			setUsers(result.items);
			setError('');
		} catch (reason) {
			setError(errorMessage(reason));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { void loadUsers(); }, []);

	async function setStatus(user: ManagedUser, status: 'approved' | 'rejected') {
		setUpdatingId(user.id);
		setError('');
		try {
			const result = await apiRequest<{ user: ManagedUser }>(`/api/admin/users/${user.id}/status`, {
				method: 'PATCH', body: JSON.stringify({ status }),
			});
			setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
		} catch (reason) {
			setError(errorMessage(reason));
		} finally {
			setUpdatingId('');
		}
	}

	const counts = {
		all: users.length,
		pending: users.filter((user) => user.status === 'pending').length,
		approved: users.filter((user) => user.status === 'approved').length,
		rejected: users.filter((user) => user.status === 'rejected').length,
	};
	const visible = useMemo(() => users.filter((user) => {
		const matchesStatus = filter === 'all' || user.status === filter;
		const term = search.trim().toLowerCase();
		return matchesStatus && (!term || `${user.full_name} ${user.email}`.toLowerCase().includes(term));
	}), [filter, search, users]);

	return (
		<div className="page-stack">
			<div className="page-heading"><div><p className="page-kicker">Warehouse HQ / Administration</p><h1>User Management</h1><p>Review access requests and manage approved accounts.</p></div></div>
			{error && <div className="inline-error" role="alert">{error}</div>}
			<div className="user-toolbar"><div className="filter-tabs" role="group" aria-label="Filter users">{(['all', 'pending', 'approved', 'rejected'] as const).map((value) => <button className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)} type="button">{value[0].toUpperCase() + value.slice(1)} <span>{counts[value]}</span></button>)}</div><label className="search-box users-search"><Search size={16} /><span className="sr-only">Search accounts</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search people…" value={search} /></label></div>
			<section className="surface-panel"><div className="table-scroll"><table className="data-table users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Requested</th><th>Review</th></tr></thead><tbody>
				{visible.map((user) => <tr key={user.id}><td><strong>{user.full_name}</strong></td><td>{user.email}</td><td><span className={`role-badge ${user.role}`}>{user.role === 'admin' && <ShieldCheck size={12} />}{user.role}</span></td><td><span className={`user-status ${user.status}`}><span />{user.status}</span></td><td className="mono muted-cell">{formatDate(user.created_at)}</td><td>{user.status === 'pending' ? <div className="review-actions"><button aria-label={`Approve ${user.full_name}`} className="icon-action approve-action" disabled={updatingId === user.id} onClick={() => void setStatus(user, 'approved')} title="Approve account" type="button"><Check size={15} /></button><button aria-label={`Reject ${user.full_name}`} className="icon-action reject-action" disabled={updatingId === user.id} onClick={() => void setStatus(user, 'rejected')} title="Reject account" type="button"><X size={15} /></button></div> : <span className="review-complete">{user.status === 'approved' ? 'Access active' : 'Request closed'}</span>}</td></tr>)}
				{loading && <tr><td className="table-empty" colSpan={6}>Loading user accounts…</td></tr>}
				{!loading && visible.length === 0 && <tr><td className="table-empty" colSpan={6}><UserRoundX size={18} />No accounts in this view.</td></tr>}
			</tbody></table></div></section>
			<p className="page-footnote"><Clock3 size={14} /> New access requests remain pending until an administrator approves them.</p>
		</div>
	);
}
