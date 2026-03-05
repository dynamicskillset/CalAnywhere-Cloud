import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import pkg from "../../package.json";

export function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10"
    >
      {isAuthenticated && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3">
          <p className="text-sm text-content-muted">You have an account.</p>
          <Link to="/dashboard" className="btn-primary text-sm">
            Go to dashboard
          </Link>
        </div>
      )}

      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-content">
          Share your calendar availability, privately
        </h1>
        <p className="mt-3 text-content-muted">
          Works with any calendar. No tracking. Pages expire on your schedule.
        </p>
        <p className="mt-4 text-sm text-content-muted">
          Connect one or more iCal feeds from any provider — Google, Outlook,
          Proton, Apple, or Fastmail — and CalAnywhere creates a scheduling
          page showing only when you're free. Manage all your pages from a
          single dashboard. Ideal for freelancers, educators, and anyone who
          wants to offer appointment slots without handing over their full
          calendar.
        </p>
        {!isAuthenticated && (
          <div className="mt-6 flex items-center gap-3">
            <Link to="/signup" className="btn-primary">
              Get started free
            </Link>
            <Link to="/signin" className="btn-ghost">
              Sign in
            </Link>
          </div>
        )}
      </header>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Key features">
        <div>
          <h2 className="text-sm font-semibold text-content">Works with any calendar</h2>
          <p className="mt-1 text-xs text-content-muted">
            Google, Outlook, Proton, Apple, Fastmail — anything with an ICS
            link. Merge up to two calendars so your availability reflects all
            your commitments.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-content">Pages expire automatically</h2>
          <p className="mt-1 text-xs text-content-muted">
            Each scheduling page has a set expiry. Once it's gone, visitors see
            a clear "no longer active" message. Your calendar details are never
            stored — only free/busy times are read.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-content">Spam-free requests</h2>
          <p className="mt-1 text-xs text-content-muted">
            Every appointment request is verified by email before it reaches
            you. Combined with rate limiting and bot detection, only genuine
            requests get through.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-content">Fully configurable</h2>
          <p className="mt-1 text-xs text-content-muted">
            Set appointment length, buffer time, minimum notice, and working
            days. Manage all your pages from one dashboard and see incoming
            requests in one place.
          </p>
        </div>
      </section>

      <footer className="mt-auto pt-8 text-xs text-content-subtle">
        <p>
          Privacy-first scheduling by{" "}
          <a href="https://dynamicskillset.com" className="underline hover:text-content-muted">
            Dynamic Skillset
          </a>.
          {" "}Your calendar details never leave your provider — only availability is shared.
        </p>
        <p className="mt-1">v{pkg.version}</p>
      </footer>
    </main>
  );
}
