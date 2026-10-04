export type ParcelStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type TransactionType = 'check_in' | 'dispatch';

export type Category = {
	id: string;
	name: string;
	description: string | null;
};

export type Parcel = {
	id: string;
	parcel_code: string;
	company: string;
	supplier: string | null;
	category_id: string | null;
	category_name?: string | null;
	storage_location: string;
	fragile: boolean;
	quantity: number;
	weight_kg: string | number | null;
	reorder_threshold: number;
	status: ParcelStatus;
	notes: string | null;
	received_at: string;
	updated_at: string;
};

export type InventoryTransaction = {
	id: string;
	transaction_code: string;
	parcel_id: string;
	parcel_code: string;
	company: string;
	type: TransactionType;
	quantity: number;
	staff_id: string | null;
	staff_name: string | null;
	recipient: string | null;
	note: string | null;
	occurred_at: string;
};

export type ManagedUser = {
	id: string;
	full_name: string;
	email: string;
	role: 'admin' | 'staff';
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
};

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = sessionStorage.getItem('wsrms-token');
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

	const response = await fetch(path, { ...init, headers });
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
	return payload as T;
}

export function formatDate(value: string) {
	return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(value));
}

export function formatDateTime(value: string) {
	return new Intl.DateTimeFormat('en', {
		year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
	}).format(new Date(value));
}

export function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}