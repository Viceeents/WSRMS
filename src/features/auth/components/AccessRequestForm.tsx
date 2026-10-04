import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';

type AccessRequestFormProps = {
	onSubmit: (fullName: string, email: string, password: string) => void;
	notice: string;
};

export default function AccessRequestForm({ onSubmit, notice }: AccessRequestFormProps) {
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [passwordError, setPasswordError] = useState('');

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (password !== confirmPassword) {
			setPasswordError('Passwords do not match.');
			return;
		}

		setPasswordError('');
		onSubmit(fullName.trim(), email.trim(), password);
	}

	return (
		<form className="auth-form access-form" onSubmit={handleSubmit}>
			<label className="field-label" htmlFor="request-name">Full name</label>
			<input
				autoComplete="name"
				className="text-input"
				id="request-name"
				onChange={(event) => setFullName(event.target.value)}
				placeholder="Last, First M."
				required
				value={fullName}
			/>

			<label className="field-label" htmlFor="request-email">Email address</label>
			<input
				autoComplete="email"
				className="text-input"
				id="request-email"
				onChange={(event) => setEmail(event.target.value)}
				placeholder="you@example.com"
				required
				type="email"
				value={email}
			/>

			<div className="field-heading">
				<label className="field-label" htmlFor="request-password">Password</label>
				<span className="field-hint">At least 8 characters</span>
			</div>
			<div className="password-wrap">
				<input
					autoComplete="new-password"
					className="text-input"
					id="request-password"
					minLength={8}
					onChange={(event) => setPassword(event.target.value)}
					placeholder="Create a password"
					required
					type={showPassword ? 'text' : 'password'}
					value={password}
				/>
				<button
					aria-label={showPassword ? 'Hide password' : 'Show password'}
					className="password-toggle"
					onClick={() => setShowPassword((visible) => !visible)}
					type="button"
				>
					{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
				</button>
			</div>

			<label className="field-label" htmlFor="confirm-password">Confirm password</label>
			<input
				autoComplete="new-password"
				className="text-input"
				id="confirm-password"
				onChange={(event) => setConfirmPassword(event.target.value)}
				placeholder="Enter your password again"
				required
				type={showPassword ? 'text' : 'password'}
				value={confirmPassword}
			/>

			{(passwordError || notice) && (
				<p className={passwordError ? 'form-notice form-notice-error' : 'form-notice'} role="status">
					{passwordError || notice}
				</p>
			)}

			<button className="submit-button" type="submit">
				Submit request <ArrowRight size={17} aria-hidden="true" />
			</button>
		</form>
	);
}
