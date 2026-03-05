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
  const [calendarUrls, setCalendarUrls] = useState<string[]>([""]);
  const [calendarValidation, setCalendarValidation] = useState<
    Array<{ valid: boolean | null; eventCount: number | null }>
  >([{ valid: null, eventCount: null }]);
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [dateRangeDays, setDateRangeDays] = useState(60);
  const [minNoticeHours, setMinNoticeHours] = useState(8);
  const [includeWeekends, setIncludeWeekends] = useState(false);

  // UI state
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const urls = found.calendarUrls.length > 0 ? found.calendarUrls : [""];
        setCalendarUrls(urls);
        setCalendarValidation(urls.map(() => ({ valid: null, eventCount: null })));
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

  const updateCalendarUrl = (index: number, value: string) => {
    setCalendarUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
    setCalendarValidation((prev) =>
      prev.map((v, i) => (i === index ? { valid: null, eventCount: null } : v))
    );
  };

  const addCalendarUrl = () => {
    setCalendarUrls((prev) => [...prev, ""]);
    setCalendarValidation((prev) => [...prev, { valid: null, eventCount: null }]);
  };

  const removeCalendarUrl = (index: number) => {
    setCalendarUrls((prev) => prev.filter((_, i) => i !== index));
    setCalendarValidation((prev) => prev.filter((_, i) => i !== index));
  };

  const validateCalendarUrl = useCallback(async (url: string, index: number) => {
    if (!url.trim()) return;
    setIsValidating(true);
    setCalendarValidation((prev) =>
      prev.map((v, i) => (i === index ? { valid: null, eventCount: null } : v))
    );
    try {
      const resp = await axios.post<{ eventCount: number }>("/api/pages/validate", {
        calendarUrls: [url.trim()],
      });
      setCalendarValidation((prev) =>
        prev.map((v, i) =>
          i === index ? { valid: true, eventCount: resp.data.eventCount } : v
        )
      );
    } catch {
      setCalendarValidation((prev) =>
        prev.map((v, i) => (i === index ? { valid: false, eventCount: null } : v))
      );
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = ownerName.trim();
    const filledUrls = calendarUrls.map((u) => u.trim()).filter(Boolean);

    if (!trimmedName || trimmedName.length < 2) {
      setError("Display name is required (at least 2 characters).");
      return;
    }

    if (filledUrls.length === 0) {
      setError("Please provide at least one iCal link.");
      return;
    }

    setIsSubmitting(true);
    try {
      const patch: Parameters<typeof updatePage>[1] = {
        title: title.trim() || undefined,
        ownerName: trimmedName,
        bio: bio.trim() || undefined,
        calendarUrls: filledUrls,
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

          {calendarUrls.map((url, index) => (
            <div key={index}>
              <label
                htmlFor={`calendar-url-${index}`}
                className="label required-indicator"
              >
                {index === 0 ? "iCal subscription URL" : "Second iCal link"}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id={`calendar-url-${index}`}
                  type="url"
                  required={index === 0}
                  value={url}
                  onChange={(e) => updateCalendarUrl(index, e.target.value)}
                  placeholder="https://calendar.example.com/your-calendar.ics"
                  className="input flex-1"
                  aria-describedby={index === 0 ? "calendar-url-hint" : undefined}
                />
                <button
                  type="button"
                  onClick={() => validateCalendarUrl(url, index)}
                  disabled={isValidating || !url.trim()}
                  className="btn-secondary shrink-0"
                >
                  {isValidating ? "Checking..." : "Validate"}
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => removeCalendarUrl(index)}
                    className="btn-ghost text-xs"
                    aria-label="Remove second iCal link"
                  >
                    Remove
                  </button>
                )}
              </div>
              {calendarValidation[index]?.valid === true && (
                <p className="mt-2 text-sm text-success-text" role="status">
                  Calendar loaded successfully
                  {calendarValidation[index].eventCount !== null &&
                    ` (${calendarValidation[index].eventCount} event${calendarValidation[index].eventCount !== 1 ? "s" : ""} found)`}
                  .
                </p>
              )}
              {calendarValidation[index]?.valid === false && (
                <p className="mt-2 text-sm text-error-text" role="alert">
                  Could not load or parse the calendar. Please check the URL and
                  try again.
                </p>
              )}
            </div>
          ))}

          {calendarUrls.length < 2 && (
            <button
              type="button"
              onClick={addCalendarUrl}
              className="btn-ghost text-sm"
            >
              + Add a second iCal link
            </button>
          )}

          <p id="calendar-url-hint" className="label-hint">
            CalAnywhere reads your busy/free times from this feed. Links are
            never stored in plain text. Free tier: up to 2 iCal links per page.
          </p>
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
