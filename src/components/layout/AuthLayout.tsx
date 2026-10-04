import type { ReactNode } from 'react';
import { Boxes, CircleHelp, Route, ShieldCheck } from 'lucide-react';
import type { AuthPage } from '../../App';

type AuthLayoutProps = {
	children: ReactNode;
	page: AuthPage;
	onNavigate: (page: AuthPage) => void;
};

const features = [
	{
		icon: Boxes,
		title: 'Grid inventory map',
		detail: 'Visual storage positions, kept in sync with stock.',
	},
	{
		icon: Route,
		title: 'Priority routing',
		detail: 'Find the shortest path to the next parcel.',
	},
	{
		icon: ShieldCheck,
		title: 'A clear audit trail',
		detail: 'Every inventory movement has a timestamp.',
	},
];

export default function AuthLayout({ children, page, onNavigate }: AuthLayoutProps) {
	return (
		<div className="auth-shell">
			<aside className="auth-aside">
				<button
					className="brand-lockup"
					type="button"
					onClick={() => onNavigate('sign-in')}
					aria-label="WSRMS home"
				>
					<span className="brand-mark"><Boxes size={18} strokeWidth={1.8} /></span>
					<span>WSRMS <span className="brand-version">/ 01</span></span>
				</button>

				<div className="aside-copy">
					<p className="eyebrow">Warehouse operations</p>
					<h1>Every parcel.<br />In its place.</h1>
					<p className="aside-description">
						A calmer way to receive, locate, and move warehouse inventory.
					</p>
				</div>

				<div className="feature-list" aria-label="System capabilities">
					{features.map(({ icon: Icon, title, detail }, index) => (
						<div className="feature-row" key={title}>
							<span className="feature-index">0{index + 1}</span>
							<Icon className="feature-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
							<div>
								<h2>{title}</h2>
								<p>{detail}</p>
							</div>
						</div>
					))}
				</div>

				<div className="aside-footer">
					<span>CCSFEN1L</span>
					<span className="footer-divider" aria-hidden="true" />
					<span>Warehouse HQ</span>
					<span className="footer-spacer" />
					<span className="connection-indicator"><span /> Local preview</span>
				</div>
			</aside>

			<main className="auth-main">
				<header className="mobile-brand">
					<button className="brand-lockup" type="button" onClick={() => onNavigate('sign-in')}>
						<span className="brand-mark"><Boxes size={18} strokeWidth={1.8} /></span>
						<span>WSRMS <span className="brand-version">/ 01</span></span>
					</button>
					<span className="connection-indicator"><span /> Local preview</span>
				</header>
				<section className="auth-content" key={page}>
					{children}
				</section>
				<a className="help-button" href="mailto:support@wsrms.ph" aria-label="Contact support">
					<CircleHelp size={19} strokeWidth={1.8} />
				</a>
			</main>
		</div>
	);
}
