import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  listPages,
  deletePage,
  type DashboardPage,
  type PagesListResponse,
} from "../services/dashboard";

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry";
  const exp = new Date(expiresAt);
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return "Less than 1h remaining";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [data, setData] = useState<PagesListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listPages();
      setData(result);
    } catch {
      setError("Could not load your pages. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Dashboard - CalAnywhere";
    fetchPages();
  }, [fetchPages]);

  const handleDelete = useCallback(
    async (page: DashboardPage) => {
      const confirmed = window.confirm(
        `Delete "${page.title || page.slug}"? This cannot be undone.`
      );
      if (!confirmed) return;

      setDeletingId(page.id);
      try {
        await deletePage(page.id);
        await fetchPages();
      } catch {
        setError("Could not delete the page. Please try again.");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchPages]
  );

  const handleCopyLink = useCallback((slug: string) => {
    const url = `${window.location.origin}/s/${slug}`;
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback: select text for manual copy
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    });
  }, []);

  const atLimit = data ? (data.maxPages !== null && data.activeCount >= data.maxPages) : false;

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10"
    >
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">
            Your pages
          </h1>
          {data && (
            <p className="mt-1 text-sm text-content-muted">
              {data.maxPages === null
                ? `${data.activeCount} active page${data.activeCount !== 1 ? "s" : ""} (unlimited)`
                : `${data.activeCount} of ${data.maxPages} active page${data.maxPages !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>

        {session && (
          <div className="flex items-center gap-3 text-sm text-content-muted">
            <span className="emoji-spaced text-lg">{session.emojiId}</span>
          </div>
        )}
      </header>

      {error && (
        <div className="alert-error mb-6" role="alert">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-content-muted">Loading your pages...</p>
        </div>
      )}

      {!isLoading && data && data.pages.length === 0 && (
        <section className="card py-12 text-center">
          <h2 className="text-lg font-semibold text-content">
            Create your first scheduling page
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-content-muted">
            A scheduling page lets people see when you're free and request a
            time to meet. Share the link and let your calendar do the talking.
          </p>
          <button
            onClick={() => navigate("/dashboard/new")}
            className="btn-primary mt-6"
          >
            Create a page
          </button>
        </section>
      )}

      {!isLoading && data && data.pages.length > 0 && (
        <>
          <div className="mb-6">
            <button
              onClick={() => navigate("/dashboard/new")}
              disabled={atLimit}
              className="btn-primary"
              title={
                atLimit
                  ? `You've reached the limit of ${data.maxPages} active page(s)`
                  : undefined
              }
            >
              Create a page
            </button>
            {atLimit && data.maxPages !== null && (
              <p className="mt-2 text-xs text-content-muted">
                Free tier: {data.maxPages} active page
                {data.maxPages !== 1 ? "s" : ""}. Delete or wait for an
                existing page to expire.
              </p>
            )}
          </div>

          <ul className="space-y-4" role="list">
            {data.pages.map((page) => (
              <li key={page.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-content">
                        {page.title || page.ownerName}
                      </h2>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          page.isActive
                            ? "bg-green-900/30 text-green-400"
                            : "bg-red-900/30 text-red-400"
                        }`}
                      >
                        {page.isActive ? "Active" : "Expired"}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-content-muted">
                      /s/{page.slug}
                    </p>

                    {page.bio && (
                      <p className="mt-1 truncate text-sm text-content-subtle">
                        {page.bio}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                      <span>Created {formatDate(page.createdAt)}</span>
                      <span>
                        {page.isActive
                          ? formatExpiry(page.expiresAt)
                          : `Expired ${page.expiresAt ? formatDate(page.expiresAt) : ""}`}
                      </span>
                      <span>{page.defaultDurationMinutes}min slots</span>
                      {page.hasNotificationEmail && (
                        <span>Email notifications on</span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {page.isActive && (
                      <button
                        onClick={() => handleCopyLink(page.slug)}
                        className="btn-secondary text-xs"
                      >
                        Copy link
                      </button>
                    )}
                    <Link
                      to={`/dashboard/pages/${page.id}/requests`}
                      className="btn-ghost text-center text-xs"
                    >
                      Requests
                    </Link>
                    <Link
                      to={`/dashboard/edit/${page.id}`}
                      className="btn-ghost text-center text-xs"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(page)}
                      disabled={deletingId === page.id}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {deletingId === page.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
