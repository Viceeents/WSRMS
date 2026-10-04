import { useEffect, useState } from 'react';
import type { AuthUser } from '../../App';
import DashboardPage from '../../features/dashboard/pages/DashboardPage';
import CheckInPage from '../../features/check-in/pages/CheckInPage';
import DispatchPage from '../../features/dispatch/pages/DispatchPage';
import GridMapPage from '../../features/grid-map/pages/GridMapPage';
import InventoryPage from '../../features/inventory/pages/InventoryPage';
import ReportsPage from '../../features/reports/pages/ReportsPage';
import TransactionsPage from '../../features/transactions/pages/TransactionsPage';
import UsersPage from '../../features/users/pages/UsersPage';
import { apiRequest } from '../../features/workspaceApi';
import Sidebar, { type WorkspaceSection } from './Sidebar';

type DashboardLayoutProps = {
	user: AuthUser;
	onSignOut: () => void;
};

export default function DashboardLayout({ user, onSignOut }: DashboardLayoutProps) {
	const [active, setActive] = useState<WorkspaceSection>('dashboard');
	const [databaseStatus, setDatabaseStatus] = useState<'checking' | 'connected' | 'offline'>('checking');

	useEffect(() => {
		let mounted = true;
		const checkHealth = async () => {
			try {
				const health = await apiRequest<{ status: string }>('/api/health');
				if (mounted) setDatabaseStatus(health.status === 'ok' ? 'connected' : 'offline');
			} catch {
				if (mounted) setDatabaseStatus('offline');
			}
		};

		void checkHealth();
		const interval = window.setInterval(checkHealth, 30000);
		return () => {
			mounted = false;
			window.clearInterval(interval);
		};
	}, []);

	const navigate = (section: WorkspaceSection) => setActive(section);
	const title = {
		dashboard: 'Operations Dashboard',
		'grid-map': 'Grid Inventory Map',
		inventory: 'Inventory',
		'check-in': 'Parcel Check-In',
		dispatch: 'Parcel Dispatch',
		transactions: 'Transaction History',
		reports: 'Reports',
		users: 'User Management',
	}[active];

	return (
		<div className="workspace-shell">
			<Sidebar active={active} onNavigate={navigate} onSignOut={onSignOut} user={user} />
			<div className="workspace-main">
				<header className="workspace-topbar">
					<div className="topbar-context"><span>CCSFEN1L</span><span className="topbar-dot">·</span><span>Group: Azeus ROG Strix</span><span className="topbar-dot">·</span><strong>Warehouse Storage Records Management System</strong></div>
					<span aria-live="polite" className={`system-status ${databaseStatus}`}><span />{databaseStatus === 'connected' ? 'Connected' : databaseStatus === 'offline' ? 'Offline' : 'Checking'}</span>
				</header>
				<main className="workspace-content" key={active}>
					{active === 'dashboard' && <DashboardPage onNavigate={navigate} />}
					{active === 'grid-map' && <GridMapPage />}
					{active === 'inventory' && <InventoryPage isAdmin={user.role === 'admin'} onNavigate={navigate} />}
					{active === 'check-in' && <CheckInPage onComplete={() => navigate('inventory')} />}
					{active === 'dispatch' && <DispatchPage />}
					{active === 'transactions' && <TransactionsPage />}
					{active === 'reports' && <ReportsPage />}
					{active === 'users' && user.role === 'admin' && <UsersPage />}
				</main>
			</div>
		</div>
	);
}
