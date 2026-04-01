import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkAdminSession,
  adminLogout,
  getAdminStats,
  getAdminSettings,
  patchAdminSettings,
  lookupUser,
  setUserTier,
  type AdminStats,
  type AdminUser,
} from "../services/admin";

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // User management
  const [userSearch, setUserSearch] = useState("");
  const [userResult, setUserResult] = useState<AdminUser | null>(null);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);

  useEffect(() => {
    document.title = "Admin dashboard — CalAnywhere";

    checkAdminSession().catch(() => navigate("/admin/login", { replace: true }));

    Promise.all([getAdminStats(), getAdminSettings()])
      .then(([s, cfg]) => {
        setStats(s);
        setSettings(cfg);
      })
      .catch(() => setLoadError("Could not load dashboard data."));
  }, [navigate]);

  const handleSignupsToggle = async (enabled: boolean) => {
    setSaveError(null);
    setIsSaving(true);
    try {
      await patchAdminSettings({ signups_enabled: enabled ? "true" : "false" });
      setSettings((prev) => ({ ...prev, signups_enabled: enabled ? "true" : "false" }));
    } catch {
      setSaveError("Could not update setting. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    navigate("/admin/login", { replace: true });
  };

  const handleUserSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = userSearch.trim();
    if (!query) return;
    setIsSearching(true);
    setUserResult(null);
    setUserSearchError(null);
    try {
      const user = await lookupUser(query);
      setUserResult(user);
    } catch {
      setUserSearchError("User not found.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleTierToggle = async () => {
    if (!userResult) return;
    setIsUpdatingTier(true);
    const newTier = userResult.tier === 'admin' ? 'free' : 'admin';
    try {
      await setUserTier(userResult.id, newTier);
      setUserResult((prev) => prev ? { ...prev, tier: newTier } : prev);
    } catch {
      setUserSearchError("Could not update tier. Please try again.");
    } finally {
      setIsUpdatingTier(false);
    }
  };

  const signupsEnabled = settings.signups_enabled !== "false";

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10"
    >
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Admin dashboard
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-content-muted hover:text-content"
        >
          Sign out
        </button>
      </header>

      {loadError && (
        <div className="alert-error mb-6" role="alert">
          {loadError}
        </div>
      )}

      {/* Stats */}
      <section className="mb-6" aria-label="System stats">
        <h2 className="mb-3 text-sm font-semibold text-content">Overview</h2>
        {stats ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Users" value={stats.users} />
            <StatCard label="Total pages" value={stats.pages} />
            <StatCard label="Active pages" value={stats.activePages} />
          </div>
        ) : (
          !loadError && (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card">
                  <div className="skeleton mb-2 h-7 w-12" />
                  <div className="skeleton h-3 w-20" />
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* Feature flags */}
      <section className="card space-y-5" aria-label="Feature flags">
        <h2 className="text-sm font-semibold text-content">Feature flags</h2>

        {saveError && (
          <div className="alert-error" role="alert">
            {saveError}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-content">New signups</p>
            <p className="text-xs text-content-muted">
              When off, the sign-up flow is hidden and new accounts cannot be
              created. Existing users are unaffected.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={signupsEnabled}
            disabled={isSaving || !stats}
            onClick={() => handleSignupsToggle(!signupsEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${
              signupsEnabled ? "bg-accent" : "bg-surface-overlay"
            }`}
            aria-label={signupsEnabled ? "Disable new signups" : "Enable new signups"}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                signupsEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Placeholder row for future premium flags */}
        <p className="text-xs text-content-subtle">
          Additional feature flags will appear here.
        </p>
      </section>

      {/* User management */}
      <section className="card mt-6 space-y-5" aria-label="User management">
        <h2 className="text-sm font-semibold text-content">User management</h2>

        <form onSubmit={handleUserSearch} className="flex gap-2">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Emoji ID (e.g. 🐉🌟🎯)"
            className="input flex-1 text-sm"
            aria-label="Search by Emoji ID"
          />
          <button
            type="submit"
            disabled={isSearching || !userSearch.trim()}
            className="btn-secondary text-sm"
          >
            {isSearching ? "Searching…" : "Look up"}
          </button>
        </form>

        {userSearchError && (
          <p className="text-sm text-error-text" role="alert">{userSearchError}</p>
        )}

        {userResult && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content emoji-spaced">{userResult.emojiId}</p>
                <p className="text-xs text-content-muted mt-0.5">
                  {userResult.pageCount} page{userResult.pageCount !== 1 ? "s" : ""} &middot; joined {new Date(userResult.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  userResult.tier === 'admin'
                    ? "bg-accent/20 text-accent-text"
                    : "bg-surface-overlay text-content-muted"
                }`}>
                  {userResult.tier}
                </span>
                <button
                  type="button"
                  onClick={handleTierToggle}
                  disabled={isUpdatingTier}
                  className="btn-secondary text-xs"
                >
                  {isUpdatingTier
                    ? "Updating…"
                    : userResult.tier === 'admin'
                    ? "Set to free"
                    : "Set to admin"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <p className="text-2xl font-semibold tabular-nums text-content">{value}</p>
      <p className="mt-1 text-xs text-content-muted">{label}</p>
    </div>
  );
}
