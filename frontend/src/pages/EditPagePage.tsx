import { FormEvent, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  listPages,
  updatePage,
  type DashboardPage,
} from "../services/dashboard";

export function EditPagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState<DashboardPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [bio, setBio] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [clearEmail, setClearEmail] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [dateRangeDays, setDateRangeDays] = useState(60);
  const [minNoticeHours, setMinNoticeHours] = useState(8);
  const [includeWeekends, setIncludeWeekends] = useState(false);

  // UI state
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarValid, setCalendarValid] = useState<boolean | null>(null);
  const [calendarEventCount, setCalendarEventCount] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Edit page - CalAnywhere";

    let cancelled = false;

    async function load() {
      try {
        const data = await listPages();
        if (cancelled) return;
        const found = data.pages.find((p) => p.id === id);
        if (!found) {
          setLoadError("Page not found.");
          return;
        }
        setPage(found);
        setTitle(found.title ?? "");
        setOwnerName(found.ownerName);
        setBio(found.bio ?? "");
        setCalendarUrl(found.calendarUrls[0] ?? "");
        setDefaultDurationMinutes(found.defaultDurationMinutes);
        setBufferMinutes(found.bufferMinutes);
        setDateRangeDays(found.dateRangeDays);
        setMinNoticeHours(found.minNoticeHours);
        setIncludeWeekends(found.includeWeekends);
      } catch {
        if (!cancelled) setLoadError("Could not load page details. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const validateCalendarUrl = useCallback(async (url: string) => {
    if (!url.trim()) {
      setCalendarValid(null);
      setCalendarEventCount(null);
      return;
    }
    setIsValidating(true);
    setCalendarValid(null);
    setCalendarEventCount(null);
    try {
      const resp = await axios.post<{ eventCount: number }>("/api/pages/validate", {
        calendarUrls: [url.trim()],
      });
      setCalendarValid(true);
      setCalendarEventCount(resp.data.eventCount);
    } catch {
      setCalendarValid(false);
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = ownerName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError("Display name is required (at least 2 characters).");
      return;
    }

    const trimmedUrl = calendarUrl.trim();
    if (!trimmedUrl) {
      setError("Please provide a calendar URL.");
      return;
    }

    setIsSubmitting(true);
    try {
      const patch: Parameters<typeof updatePage>[1] = {
        title: title.trim() || undefined,
        ownerName: trimmedName,
        bio: bio.trim() || undefined,
        calendarUrls: [trimmedUrl],
        defaultDurationMinutes,
        bufferMinutes,
        dateRangeDays,
        minNoticeHours,
        includeWeekends,
      };

      if (clearEmail) {
        patch.notificationEmail = null;
      } else if (notificationEmail.trim()) {
        patch.notificationEmail = notificationEmail.trim();
      }
      // Blank and not clearing: omit to preserve existing

      await updatePage(id!, patch);
      navigate("/dashboard");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10"
      >
        <div className="alert-error" role="alert">
          {loadError}
        </div>
        <Link
          to="/dashboard"
          className="mt-4 text-sm text-content-muted hover:text-content"
        >
          &larr; Back to dashboard
        </Link>
      </main>
    );
  }

  if (!page) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-10"
      >
        <p className="text-sm text-content-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10"
    >
      <header className="mb-8">
        <Link
          to="/dashboard"
          className="text-sm text-content-muted hover:text-content"
        >
          &larr; Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-content">
          Edit page
        </h1>
        <p className="mt-1 text-sm text-content-muted">/s/{page.slug}</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* --- Basic info --- */}
        <section className="card space-y-5">
          <h2 className="text-base font-semibold text-content">
            Basic information
          </h2>

          <div>
            <label htmlFor="owner-name" className="label required-indicator">
              Display name
            </label>
            <input
              id="owner-name"
              type="text"
              required
              maxLength={100}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="input mt-2"
              aria-describedby="owner-name-hint"
            />
            <p id="owner-name-hint" className="label-hint">
              Shown to visitors on your scheduling page.
            </p>
          </div>

          <div>
            <label htmlFor="page-title" className="label">
              Page title
            </label>
            <input
              id="page-title"
              type="text"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office hours, 1:1 catch-up"
              className="input mt-2"
              aria-describedby="page-title-hint"
            />
            <p id="page-title-hint" className="label-hint">
              Optional. Helps you tell pages apart in the dashboard.
            </p>
          </div>

          <div>
            <label htmlFor="bio" className="label">
              Bio
            </label>
            <textarea
              id="bio"
              maxLength={200}
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input mt-2 resize-none"
              aria-describedby="bio-hint"
            />
            <p id="bio-hint" className="label-hint">
              Optional. Up to 200 characters.
            </p>
          </div>
        </section>

        {/* --- Calendar --- */}
        <section className="card space-y-5">
          <h2 className="text-base font-semibold text-content">Calendar</h2>

          <div>
            <label htmlFor="calendar-url" className="label required-indicator">
              iCal subscription URL
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="calendar-url"
                type="url"
                required
                value={calendarUrl}
                onChange={(e) => {
                  setCalendarUrl(e.target.value);
                  setCalendarValid(null);
                  setCalendarEventCount(null);
                }}
                placeholder="https://calendar.example.com/your-calendar.ics"
                className="input flex-1"
                aria-describedby="calendar-url-hint"
              />
              <button
                type="button"
                onClick={() => validateCalendarUrl(calendarUrl)}
                disabled={isValidating || !calendarUrl.trim()}
                className="btn-secondary shrink-0"
              >
                {isValidating ? "Checking..." : "Validate"}
              </button>
            </div>
            <p id="calendar-url-hint" className="label-hint">
              CalAnywhere reads your busy/free times from this feed. It is never
              stored in plain text.
            </p>

            {calendarValid === true && (
              <p className="mt-2 text-sm text-green-400" role="status">
                Calendar loaded successfully
                {calendarEventCount !== null &&
                  ` (${calendarEventCount} event${calendarEventCount !== 1 ? "s" : ""} found)`}
                .
              </p>
            )}
            {calendarValid === false && (
              <p className="mt-2 text-sm text-red-400" role="alert">
                Could not load or parse the calendar. Please check the URL and
                try again.
              </p>
            )}
          </div>
        </section>

        {/* --- Scheduling settings --- */}
        <section className="card space-y-5">
          <h2 className="text-base font-semibold text-content">
            Scheduling settings
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="duration" className="label">
                Meeting duration
              </label>
              <select
                id="duration"
                value={defaultDurationMinutes}
                onChange={(e) =>
                  setDefaultDurationMinutes(Number(e.target.value))
                }
                className="input mt-2"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
            </div>

            <div>
              <label htmlFor="buffer" className="label">
                Buffer between meetings
              </label>
              <select
                id="buffer"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="input mt-2"
              >
                <option value={0}>No buffer</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>

            <div>
              <label htmlFor="date-range" className="label">
                Show availability for
              </label>
              <select
                id="date-range"
                value={dateRangeDays}
                onChange={(e) => setDateRangeDays(Number(e.target.value))}
                className="input mt-2"
              >
                <option value={7}>Next 7 days</option>
                <option value={14}>Next 14 days</option>
                <option value={30}>Next 30 days</option>
                <option value={60}>Next 60 days</option>
                <option value={90}>Next 90 days</option>
              </select>
            </div>

            <div>
              <label htmlFor="notice" className="label">
                Minimum notice
              </label>
              <select
                id="notice"
                value={minNoticeHours}
                onChange={(e) => setMinNoticeHours(Number(e.target.value))}
                className="input mt-2"
              >
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
                <option value={4}>4 hours</option>
                <option value={8}>8 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
              </select>
              <p className="label-hint">
                How much advance notice you need before a meeting.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="weekends"
              type="checkbox"
              checked={includeWeekends}
              onChange={(e) => setIncludeWeekends(e.target.checked)}
              className="checkbox"
            />
            <label htmlFor="weekends" className="text-sm text-content">
              Include weekends
            </label>
          </div>
        </section>

        {/* --- Notifications --- */}
        <section className="card space-y-5">
          <h2 className="text-base font-semibold text-content">
            Notifications
          </h2>

          <div>
            <label htmlFor="notification-email" className="label">
              Notification email
            </label>
            <input
              id="notification-email"
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              disabled={clearEmail}
              placeholder={
                page.hasNotificationEmail
                  ? "Enter a new address to change"
                  : "you@example.com"
              }
              className="input mt-2 disabled:opacity-50"
              aria-describedby="notification-email-hint"
            />
            <p id="notification-email-hint" className="label-hint">
              {page.hasNotificationEmail
                ? "Email notifications are currently enabled. Leave blank to keep the existing address."
                : "Optional. Get an email when someone requests a meeting."}{" "}
              This address is encrypted and never shared.
            </p>
          </div>

          {page.hasNotificationEmail && (
            <div className="flex items-center gap-3">
              <input
                id="clear-email"
                type="checkbox"
                checked={clearEmail}
                onChange={(e) => {
                  setClearEmail(e.target.checked);
                  if (e.target.checked) setNotificationEmail("");
                }}
                className="checkbox"
              />
              <label htmlFor="clear-email" className="text-sm text-content">
                Remove notification email
              </label>
            </div>
          )}
        </section>

        {/* --- Error + Submit --- */}
        {error && (
          <div className="alert-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="btn-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="btn-primary"
          >
            {isSubmitting ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </main>
  );
}
