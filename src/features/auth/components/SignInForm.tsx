import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';

type SignInFormProps = {
	onSubmit: (email: string, password: string) => void;
	notice: string;
};

export default function SignInForm({ onSubmit, notice }: SignInFormProps) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onSubmit(email.trim(), password);
	}

	return (
		<form className="auth-form" onSubmit={handleSubmit}>
			<label className="field-label" htmlFor="signin-email">Email address</label>
			<input
				autoComplete="username"
				className="text-input"
				id="signin-email"
				name="email"
				onChange={(event) => setEmail(event.target.value)}
				placeholder="you@wsrms.ph"
				required
				type="email"
				value={email}
			/>

			<div className="field-heading">
				<label className="field-label" htmlFor="signin-password">Password</label>
			</div>
			<div className="password-wrap">
				<input
					autoComplete="current-password"
					className="text-input"
					id="signin-password"
					name="password"
					onChange={(event) => setPassword(event.target.value)}
					placeholder="Enter your password"
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

			{notice && <p className="form-notice" role="status">{notice}</p>}

			<button className="submit-button" type="submit">
				Sign in <ArrowRight size={17} aria-hidden="true" />
			</button>
		</form>
	);
}
