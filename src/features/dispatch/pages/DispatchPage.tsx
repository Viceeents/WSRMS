import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpFromLine, CircleCheck, PackageCheck } from 'lucide-react';
import { apiRequest, errorMessage, type Parcel } from '../../workspaceApi';

export default function DispatchPage() {
	const [parcels, setParcels] = useState<Parcel[]>([]);
	const [parcelId, setParcelId] = useState('');
	const [quantity, setQuantity] = useState('1');
	const [recipient, setRecipient] = useState('');
	const [note, setNote] = useState('');
	const [verified, setVerified] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	useEffect(() => {
		apiRequest<{ items: Parcel[] }>('/api/inventory')
			.then((result) => setParcels(result.items.filter((parcel) => parcel.quantity > 0)))
			.catch((reason: unknown) => setError(errorMessage(reason)));
	}, []);

	const selectedParcel = parcels.find((parcel) => parcel.id === parcelId);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError('');
		setSuccess('');
		try {
			await apiRequest('/api/transactions', {
				method: 'POST',
				body: JSON.stringify({ parcelId, type: 'dispatch', quantity: Number(quantity), recipient, note: note || null }),
			});
			setSuccess(`${quantity} units of ${selectedParcel?.parcel_code} dispatched to ${recipient}.`);
			setParcels((current) => current.map((parcel) => parcel.id === parcelId ? { ...parcel, quantity: parcel.quantity - Number(quantity) } : parcel).filter((parcel) => parcel.quantity > 0));
			setParcelId('');
			setQuantity('1');
			setRecipient('');
			setNote('');
			setVerified(false);
		} catch (reason) {
			setError(errorMessage(reason));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="page-stack">
			<div className="page-heading"><div><p className="page-kicker">Warehouse HQ / Release</p><h1>Parcel Dispatch</h1><p>Verify the parcel and recipient before recording its release.</p></div></div>
			<div className="form-page-layout">
				<form className="surface-panel operation-form" onSubmit={handleSubmit}>
					<div className="form-section-heading"><span className="form-section-icon form-section-violet"><ArrowUpFromLine size={18} /></span><div><h2>Dispatch details</h2><p>Stock is checked and decremented when confirmed.</p></div></div>
					{error && <div className="inline-error" role="alert">{error}</div>}
					{success && <div className="inline-success" role="status">{success}</div>}
					<label className="form-field"><span>Parcel ID</span><select onChange={(event) => setParcelId(event.target.value)} required value={parcelId}><option value="">Select parcel…</option>{parcels.map((parcel) => <option key={parcel.id} value={parcel.id}>{parcel.parcel_code} · {parcel.company} · {parcel.quantity} available</option>)}</select></label>
					{selectedParcel && <div className="selected-parcel"><PackageCheck size={17} /><div><strong>{selectedParcel.company}</strong><small>{selectedParcel.storage_location} · {selectedParcel.quantity} units available</small></div></div>}
					<div className="form-two-columns"><label className="form-field"><span>Quantity</span><input max={selectedParcel?.quantity} min="1" onChange={(event) => setQuantity(event.target.value)} required type="number" value={quantity} /></label><label className="form-field"><span>Client / recipient</span><input onChange={(event) => setRecipient(event.target.value)} placeholder="e.g. TechBuild Corp." required value={recipient} /></label></div>
					<label className="form-field"><span>Dispatch note <small>Optional</small></span><textarea onChange={(event) => setNote(event.target.value)} placeholder="Reference or release details" rows={3} value={note} /></label>
					<label className="check-field verification-field"><input checked={verified} onChange={(event) => setVerified(event.target.checked)} required type="checkbox" /><span><strong>Inspection verified</strong><small>I confirm the parcel contents and quantity have been checked for release.</small></span><CircleCheck size={18} /></label>
					<div className="form-actions"><button className="button button-violet" disabled={busy || !verified || !selectedParcel || Number(quantity) > (selectedParcel?.quantity ?? 0)} type="submit">{busy ? 'Recording…' : 'Confirm dispatch'}</button><span className="form-note">Dispatches above available stock are rejected.</span></div>
				</form>
				<aside className="form-aside-note"><p className="page-kicker">Release control</p><h2>Stock stays accurate.</h2><p>Each dispatch is a permanent transaction. The available quantity changes only after the database accepts the release.</p><div className="note-rule" /><small>Recipient and staff are included in transaction history.</small></aside>
			</div>
		</div>
	);
}
