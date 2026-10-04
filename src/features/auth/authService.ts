type AuthResponse = {
	token: string;
	user: {
		id: string;
		full_name: string;
		email: string;
		role: 'admin' | 'staff';
	};
};

type AccessRequestResponse = {
	message: string;
	user: {
		id: string;
		full_name: string;
		email: string;
		status: 'pending';
	};
};

async function readResponse<T>(response: Response): Promise<T> {
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload.error || 'The request could not be completed.');
	}

	return payload as T;
}

export async function signIn(email: string, password: string) {
	const response = await fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

	return readResponse<AuthResponse>(response);
}

export async function requestAccess(fullName: string, email: string, password: string) {
	const response = await fetch('/api/auth/request-access', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ fullName, email, password }),
	});

	return readResponse<AccessRequestResponse>(response);
}
