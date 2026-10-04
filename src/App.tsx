import { useEffect, useState } from 'react';
import RequestAccessPage from './features/auth/pages/RequestAccessPage';
import SignInPage from './features/auth/pages/SignInPage';
import DashboardLayout from './components/layout/DashboardLayout';
import { apiRequest } from './features/workspaceApi';

export type AuthPage = 'sign-in' | 'request-access';

export type AuthUser = {
	id: string;
	full_name: string;
	email: string;
	role: 'admin' | 'staff';
};

export default function App() {
	const [page, setPage] = useState<AuthPage>('sign-in');
	const [user, setUser] = useState<AuthUser | null>(null);
	const [restoringSession, setRestoringSession] = useState(true);

	useEffect(() => {
		if (!sessionStorage.getItem('wsrms-token')) {
			setRestoringSession(false);
			return;
		}

		apiRequest<{ user: AuthUser }>('/api/auth/me')
			.then((result) => setUser(result.user))
			.catch(() => sessionStorage.removeItem('wsrms-token'))
			.finally(() => setRestoringSession(false));
	}, []);

	if (restoringSession) {
		return <main className="session-loading" role="status">Checking your session…</main>;
	}

	if (user) {
		return (
			<DashboardLayout
				user={user}
				onSignOut={() => {
					sessionStorage.removeItem('wsrms-token');
					setUser(null);
				}}
			/>
		);
	}

	if (page === 'request-access') {
		return <RequestAccessPage onNavigate={setPage} />;
	}

	return <SignInPage onNavigate={setPage} onAuthenticated={setUser} />;
}
