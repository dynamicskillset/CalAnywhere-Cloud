import { FormEvent, useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { createPage } from "../services/dashboard";

const EXPIRY_PRESETS = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

const ICAL_GUIDES: { provider: string; steps: string }[] = [
  {
    provider: "Google Calendar",
    steps:
      'Open Google Calendar \u2192 Settings (cog icon) \u2192 select your calendar under "Settings for my calendars" \u2192 "Integrate calendar" \u2192 copy the "Secret address in iCal format" link.',
  },
  {
    provider: "Apple / iCloud",
    steps:
      'Open the Calendar app \u2192 right-click your calendar \u2192 Share Calendar \u2192 tick "Public Calendar" \u2192 copy the URL that appears.',
  },
  {
    provider: "Proton Calendar",
    steps:
      'Open Proton Calendar \u2192 Settings \u2192 Calendars \u2192 select your calendar \u2192 scroll to "Share outside Proton" \u2192 create a link \u2192 copy the iCal URL.',
  },
  {
    provider: "Fastmail",
    steps:
      'Open Fastmail \u2192 Calendars \u2192 click the sharing icon next to your calendar \u2192 under "Share with anyone" copy the ICS link.',
  },
];

export function CreatePagePage() {
  const navigate = useNavigate();

  // Form fields
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [bio, setBio] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [calendarUrls, setCalendarUrls] = useState<string[]>([""]);
  const [calendarValidation, setCalendarValidation] = useState<
    Array<{ valid: boolean | null; eventCount: number | null }>
  >([{ valid: null, eventCount: null }]);
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [dateRangeDays, setDateRangeDays] = useState(60);
  const [minNoticeHours, setMinNoticeHours] = useState(8);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);

  // UI state
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Create a page - CalAnywhere";
  }, []);

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
      const resp = await axios.post<{ eventCount: number }>(
        "/api/pages/validate",
        { calendarUrls: [url.trim()] }
      );
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
      await createPage({
        title: title.trim() || undefined,
        ownerName: trimmedName,
        bio: bio.trim() || undefined,
        notificationEmail: notificationEmail.trim() || undefined,
        calendarUrls: filledUrls,
        defaultDurationMinutes,
        bufferMinutes,
        dateRangeDays,
        minNoticeHours,
        includeWeekends,
        expiryDays,
      });
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
          Create a scheduling page
        </h1>
        <p className="mt-2 text-sm text-content-muted">
          Set up a page where people can see your availability and request a
          time to meet.
        </p>
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
              placeholder="Jane Smith"
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
              placeholder="A short note visitors will see on your page."
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

          {/* Provider guides */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-content/90">
              Where do I find my iCal URL?
            </p>
            {ICAL_GUIDES.map((guide) => (
              <div
                key={guide.provider}
                className="border-b border-border/30 last:border-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGuide(
                      expandedGuide === guide.provider
                        ? null
                        : guide.provider
                    )
                  }
                  className="flex w-full items-center justify-between py-2 text-left text-sm text-content-muted hover:text-content"
                  aria-expanded={expandedGuide === guide.provider}
                >
                  <span>{guide.provider}</span>
                  <span
                    className="text-xs transition-transform"
                    aria-hidden="true"
                  >
                    {expandedGuide === guide.provider ? "\u25BE" : "\u25B8"}
                  </span>
                </button>
                {expandedGuide === guide.provider && (
                  <p className="pb-3 text-xs text-content-subtle leading-relaxed">
                    {guide.steps}
                  </p>
                )}
              </div>
            ))}
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
              placeholder="you@example.com"
              className="input mt-2"
              aria-describedby="notification-email-hint"
            />
            <p id="notification-email-hint" className="label-hint">
              Optional. Get an email when someone requests a meeting. This
              address is encrypted and never shared. You can always check your
              dashboard instead.
            </p>
          </div>
        </section>

        {/* --- Expiry --- */}
        <section className="card space-y-5">
          <h2 className="text-base font-semibold text-content">Page expiry</h2>

          <fieldset>
            <legend className="label">How long should this page stay active?</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {EXPIRY_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setExpiryDays(preset.days)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    expiryDays === preset.days
                      ? "border-accent-text bg-accent-text/10 text-accent-text"
                      : "border-border text-content-muted hover:border-content-muted hover:text-content"
                  }`}
                  role="radio"
                  aria-checked={expiryDays === preset.days}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="label-hint mt-3">
              Free tier: up to 30 days. After expiry, visitors will see a
              message that the page is no longer active. You can create a new
              page at any time.
            </p>
          </fieldset>
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
            {isSubmitting ? "Creating page..." : "Create page"}
          </button>
        </div>
      </form>
    </main>
  );
}
