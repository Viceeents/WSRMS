import {
	ArrowDownToLine,
	ArrowLeftRight,
	ArrowUpFromLine,
	ChartNoAxesCombined,
	Grid2X2,
	LayoutDashboard,
	Map,
	PackageSearch,
	UsersRound,
} from 'lucide-react';
import type { AuthUser } from '../../App';

export type WorkspaceSection =
	| 'dashboard'
	| 'grid-map'
	| 'inventory'
	| 'check-in'
	| 'dispatch'
	| 'transactions'
	| 'reports'
	| 'users';

type SidebarProps = {
	active: WorkspaceSection;
	user: AuthUser;
	onNavigate: (section: WorkspaceSection) => void;
	onSignOut: () => void;
};

const navigation = [
	{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
	{ id: 'grid-map', label: 'Grid Map', icon: Grid2X2 },
	{ id: 'inventory', label: 'Inventory', icon: PackageSearch },
	{ id: 'check-in', label: 'Check-In', icon: ArrowDownToLine },
	{ id: 'dispatch', label: 'Dispatch', icon: ArrowUpFromLine },
	{ id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
	{ id: 'reports', label: 'Reports', icon: ChartNoAxesCombined },
	{ id: 'users', label: 'Users', icon: UsersRound },
] as const;

export default function Sidebar({ active, user, onNavigate, onSignOut }: SidebarProps) {
	return (
		<aside className="workspace-sidebar">
			<button className="workspace-brand" onClick={() => onNavigate('dashboard')} type="button">
				<span className="workspace-brand-mark"><Map size={17} /></span>
				<span><strong>WSRMS</strong><small>Warehouse HQ · {user.role}</small></span>
			</button>
			<nav className="sidebar-nav" aria-label="Main navigation">
				{navigation.filter((item) => item.id !== 'users' || user.role === 'admin').map(({ id, label, icon: Icon }) => (
					<button
						aria-current={active === id ? 'page' : undefined}
						className={`sidebar-link${active === id ? ' active' : ''}`}
						key={id}
						onClick={() => onNavigate(id)}
						type="button"
					>
						<Icon size={17} strokeWidth={1.8} aria-hidden="true" />
						<span>{label}</span>
					</button>
				))}
			</nav>
			<div className="sidebar-account">
				<span className="account-avatar" aria-hidden="true">{user.full_name.slice(0, 1).toUpperCase()}</span>
				<div className="account-info"><strong>{user.full_name}</strong><span>{user.role} · {user.email}</span></div>
				<button className="signout-button" onClick={onSignOut} type="button">Sign out</button>
			</div>
		</aside>
	);
}
