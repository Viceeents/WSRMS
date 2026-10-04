import { useState } from 'react';
import AuthLayout from '../../../components/layout/AuthLayout';
import type { AuthPage } from '../../../App';
import { requestAccess } from '../authService';
import AccessRequestForm from '../components/AccessRequestForm';

type RequestAccessPageProps = {
	onNavigate: (page: AuthPage) => void;
};

export default function RequestAccessPage({ onNavigate }: RequestAccessPageProps) {
	const [notice, setNotice] = useState('');

	async function handleSubmit(fullName: string, email: string, password: string) {
		setNotice('');
		try {
			const result = await requestAccess(fullName, email, password);
			setNotice(result.message);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : 'Unable to submit the request.');
		}
	}

	return (
		<AuthLayout page="request-access" onNavigate={onNavigate}>
			<div className="form-heading">
				<p className="eyebrow">Join your warehouse</p>
				<h2>Request access</h2>
				<p>Submit a request. An administrator will review your account.</p>
			</div>

			<AccessRequestForm onSubmit={handleSubmit} notice={notice} />

			<div className="form-switch">
				<span>Already have an account?</span>
				<button onClick={() => onNavigate('sign-in')} type="button">
					Sign in
				</button>
			</div>
		</AuthLayout>
	);
}
