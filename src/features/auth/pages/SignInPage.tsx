import { useState } from 'react';
import AuthLayout from '../../../components/layout/AuthLayout';
import type { AuthPage, AuthUser } from '../../../App';
import { signIn } from '../authService';
import SignInForm from '../components/SignInForm';

type SignInPageProps = {
	onNavigate: (page: AuthPage) => void;
	onAuthenticated: (user: AuthUser) => void;
};

export default function SignInPage({ onNavigate, onAuthenticated }: SignInPageProps) {
	const [notice, setNotice] = useState('');

	async function handleSubmit(email: string, password: string) {
		setNotice('');
		try {
			const result = await signIn(email, password);
			sessionStorage.setItem('wsrms-token', result.token);
			onAuthenticated(result.user);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : 'Unable to sign in.');
		}
	}

	return (
		<AuthLayout page="sign-in" onNavigate={onNavigate}>
			<div className="form-heading">
				<p className="eyebrow">Welcome back</p>
				<h2>Sign in</h2>
				<p>Enter your credentials to access the system.</p>
			</div>

			<SignInForm onSubmit={handleSubmit} notice={notice} />

			<div className="form-switch">
				<span>New to the warehouse?</span>
				<button onClick={() => onNavigate('request-access')} type="button">
					Request access
				</button>
			</div>

			<p className="form-footnote">
				Access requests are reviewed by a warehouse administrator.
			</p>
		</AuthLayout>
	);
}
