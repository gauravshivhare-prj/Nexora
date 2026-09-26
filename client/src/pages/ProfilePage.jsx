import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { FormAlert } from '../components/FormAlert.jsx';
import { FormField } from '../components/FormField.jsx';
import { FormSelect } from '../components/FormSelect.jsx';
import { FormTextarea } from '../components/FormTextarea.jsx';
import { TagListField } from '../components/TagListField.jsx';
import { CertificationsEditor } from '../components/profile/CertificationsEditor.jsx';
import { ProfileCard } from '../components/profile/ProfileCard.jsx';
import { ProjectsEditor } from '../components/profile/ProjectsEditor.jsx';
import { SkillsEditor } from '../components/profile/SkillsEditor.jsx';
import {
  FIELD_LIMITS,
  GENDER_OPTIONS,
  LIST_LIMITS,
  SEMESTER_OPTIONS,
} from '../constants/profileOptions.js';
import { blankProfile, fetchProfile, saveProfile } from '../services/profile.service.js';
import { toMessage } from '../utils/errorMessage.js';

/**
 * /profile — the student's own profile.
 *
 * Every field is optional. A profile is something a student fills in over
 * time, and a form that refuses to save until it is complete would stop
 * someone recording the three things they know today.
 *
 * Field-level errors come from the server, keyed by the same dotted paths the
 * API returns (`skills[0].name`). The form does not re-implement the server's
 * rules: duplicating them would mean two sets of limits to keep in step, and
 * the server has to check them anyway.
 */

/** What the page is currently doing. Distinct states, not a pile of booleans. */
const LOAD_STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
};

export function ProfilePage() {
  const [values, setValues] = useState(blankProfile);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);
  const [exists, setExists] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedMessage, setSavedMessage] = useState(null);
  /** Whether the last failure was one that simply trying again could clear. */
  const [isRetryable, setIsRetryable] = useState(false);
  /** Server field failures, keyed by dotted path. */
  const [fieldErrors, setFieldErrors] = useState({});

  const formRef = useRef(null);
  /**
   * Bumped on every rejected save, so the focus effect below re-runs even
   * when the server returns the same errors twice in a row.
   */
  const [rejectionCount, setRejectionCount] = useState(0);

  const load = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);

    try {
      const result = await fetchProfile({ signal });
      if (signal?.aborted) return;

      setValues(result.values);
      setExists(result.exists);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (error) {
      if (signal?.aborted) return;

      setLoadError(toMessage(error, 'Something went wrong while loading your profile.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /**
   * Sends focus to the first rejected field after a failed save.
   *
   * The form is six sections tall, so the field the server objected to is
   * very often off-screen — and a keyboard or screen-reader user is left at
   * the Save button with an announcement and no way to reach what it refers
   * to. Nothing is scrolled when there are no field errors, so a network
   * failure leaves the caret where the student had it.
   */
  useEffect(() => {
    if (rejectionCount === 0) return;

    const firstInvalid = formRef.current?.querySelector('[aria-invalid="true"]');
    if (!firstInvalid) return;

    firstInvalid.focus({ preventScroll: true });
    // The CSS reduced-motion override cannot reach a scroll started from JS,
    // so the preference is read here instead.
    firstInvalid.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  }, [rejectionCount]);

  /** Reads a server error for one dotted path, for passing to a field. */
  const errorFor = useCallback((path) => fieldErrors[path], [fieldErrors]);

  /**
   * Clears the previous result the moment anything is edited.
   *
   * Leaving "Profile saved" on screen while the student types makes it a
   * claim about the current contents, which it no longer is.
   */
  const clearResult = useCallback(() => {
    setSavedMessage(null);
    setSaveError(null);
    setIsRetryable(false);
  }, []);

  const setSectionField = useCallback(
    (section, field) => (value) => {
      setValues((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
      setFieldErrors((current) => ({ ...current, [`${section}.${field}`]: undefined }));
      clearResult();
    },
    [clearResult],
  );

  const setList = useCallback(
    (name) => (entries) => {
      setValues((current) => ({ ...current, [name]: entries }));
      // Field errors are keyed by position, so any change to a list's shape
      // invalidates them. Keeping them would pin a message to the wrong row.
      setFieldErrors((current) => dropErrorsFor(current, name));
      clearResult();
    },
    [clearResult],
  );

  /**
   * Sends the form.
   *
   * Separate from the submit handler so the alert's "Try again" can re-run
   * exactly the same save without synthesising a submit event.
   */
  async function save() {
    setIsSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    setFieldErrors({});

    try {
      const result = await saveProfile(values);
      // Show what the server stored, not what was typed: it has trimmed
      // whitespace, rounded the CGPA and dropped blank rows.
      setValues(result.values);
      setExists(true);
      setSavedMessage('Profile saved.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.details) {
        setFieldErrors(byField(error.details));
        setSaveError('Some fields need attention. They are marked below.');
        // A rejected field is something to go and fix, so no retry is
        // offered here — pressing it again would fail identically.
        setRejectionCount((count) => count + 1);
      } else {
        setSaveError(toMessage(error, 'Something went wrong while saving. Your changes have not been lost — try again.'));
        setIsRetryable(true);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;
    setIsRetryable(false);
    save();
  }

  const summary = useMemo(() => describeCompleteness(values), [values]);

  if (loadStatus === LOAD_STATUS.LOADING) return <ProfileSkeleton />;

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageFrame>
        <div
          role="alert"
          className="animate-rise rounded-2xl border border-red-200 bg-surface p-6 text-center sm:p-8"
        >
          <p className="text-base font-semibold text-ink">Your profile could not be loaded</p>
          <p className="mt-2 text-sm text-ink-muted">{loadError}</p>

          <button
            type="button"
            onClick={() => load()}
            className="mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft"
          >
            Try again
          </button>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <header className="animate-rise mb-6">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-brand-text"
        >
          <span aria-hidden="true">←</span>
          Back
        </Link>

        {/* The same brand eyebrow the signed-in landing page carries, so the
            profile reads as part of Nexora rather than a standalone form. */}
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-brand-text uppercase">
          Nexora
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
          Your profile
        </h1>

        <p className="mt-2 text-sm text-ink-muted">
          {exists
            ? summary
            : 'Nothing saved yet. Fill in what you know — every field is optional, and you can come back to the rest.'}
        </p>
      </header>

      <FormAlert
        message={saveError}
        action={isRetryable && !isSaving ? { label: 'Try again', onClick: save } : undefined}
      />
      <FormAlert message={savedMessage} tone="success" />

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <ProfileCard title="Personal" description="How Nexora can reach you, and where you are.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Phone"
              type="tel"
              value={values.personal.phone}
              onChange={setSectionField('personal', 'phone')}
              error={errorFor('personal.phone')}
              maxLength={FIELD_LIMITS.phone}
              autoComplete="tel"
              placeholder="+91 98765 43210"
              required={false}
              disabled={isSaving}
            />

            <FormField
              label="Date of birth"
              type="date"
              value={values.personal.dateOfBirth}
              onChange={setSectionField('personal', 'dateOfBirth')}
              error={errorFor('personal.dateOfBirth')}
              autoComplete="bday"
              required={false}
              disabled={isSaving}
            />

            <FormSelect
              label="Gender"
              value={values.personal.gender}
              onChange={setSectionField('personal', 'gender')}
              options={GENDER_OPTIONS}
              placeholder="Not specified"
              error={errorFor('personal.gender')}
              required={false}
              disabled={isSaving}
            />

            <FormField
              label="City"
              value={values.personal.city}
              onChange={setSectionField('personal', 'city')}
              error={errorFor('personal.city')}
              maxLength={FIELD_LIMITS.city}
              autoComplete="address-level2"
              placeholder="Bhopal"
              required={false}
              disabled={isSaving}
            />

            <FormField
              label="State"
              value={values.personal.state}
              onChange={setSectionField('personal', 'state')}
              error={errorFor('personal.state')}
              maxLength={FIELD_LIMITS.state}
              autoComplete="address-level1"
              placeholder="Madhya Pradesh"
              required={false}
              disabled={isSaving}
            />
          </div>
        </ProfileCard>

        <ProfileCard
          title="Academic"
          description="Your course and progress through it. Later phases use this to judge what is realistic by when."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                label="College"
                value={values.academic.collegeName}
                onChange={setSectionField('academic', 'collegeName')}
                error={errorFor('academic.collegeName')}
                maxLength={FIELD_LIMITS.collegeName}
                placeholder="Maulana Azad National Institute of Technology"
                required={false}
                disabled={isSaving}
              />
            </div>

            <FormField
              label="Degree"
              value={values.academic.degree}
              onChange={setSectionField('academic', 'degree')}
              error={errorFor('academic.degree')}
              maxLength={FIELD_LIMITS.degree}
              placeholder="B.Tech"
              required={false}
              disabled={isSaving}
            />

            <FormField
              label="Branch"
              value={values.academic.branch}
              onChange={setSectionField('academic', 'branch')}
              error={errorFor('academic.branch')}
              maxLength={FIELD_LIMITS.branch}
              placeholder="Computer Science and Engineering"
              required={false}
              disabled={isSaving}
            />

            <FormSelect
              label="Current semester"
              value={values.academic.currentSemester}
              onChange={setSectionField('academic', 'currentSemester')}
              options={SEMESTER_OPTIONS}
              placeholder="Not specified"
              error={errorFor('academic.currentSemester')}
              required={false}
              disabled={isSaving}
            />

            <FormField
              label="Graduation year"
              type="number"
              value={values.academic.graduationYear}
              onChange={setSectionField('academic', 'graduationYear')}
              error={errorFor('academic.graduationYear')}
              placeholder="2027"
              required={false}
              disabled={isSaving}
            />

            <FormField
              label="CGPA"
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={values.academic.cgpa}
              onChange={setSectionField('academic', 'cgpa')}
              error={errorFor('academic.cgpa')}
              hint="On a 10-point scale."
              placeholder="8.4"
              required={false}
              disabled={isSaving}
            />
          </div>
        </ProfileCard>

        <ProfileCard
          title="Career direction"
          description="Where you want to go. This is what your recommendations and roadmap will be measured against."
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Target role"
                value={values.career.targetRole}
                onChange={setSectionField('career', 'targetRole')}
                error={errorFor('career.targetRole')}
                maxLength={FIELD_LIMITS.targetRole}
                placeholder="Backend Developer"
                required={false}
                disabled={isSaving}
              />

              <FormField
                label="Preferred location"
                value={values.career.preferredLocation}
                onChange={setSectionField('career', 'preferredLocation')}
                error={errorFor('career.preferredLocation')}
                maxLength={FIELD_LIMITS.preferredLocation}
                placeholder="Bengaluru"
                required={false}
                disabled={isSaving}
              />
            </div>

            <TagListField
              label="Career interests"
              values={values.career.careerInterests}
              onChange={(entries) => {
                setValues((current) => ({
                  ...current,
                  career: { ...current.career, careerInterests: entries },
                }));
                clearResult();
              }}
              maxItems={LIST_LIMITS.careerInterests.maxItems}
              maxLength={LIST_LIMITS.careerInterests.maxLength}
              placeholder="Distributed systems"
              disabled={isSaving}
            />

            <FormTextarea
              label="About you"
              value={values.career.bio}
              onChange={setSectionField('career', 'bio')}
              error={errorFor('career.bio')}
              maxLength={FIELD_LIMITS.bio}
              hint="A few lines on what you are working towards."
              disabled={isSaving}
            />
          </div>
        </ProfileCard>

        <ProfileCard
          title="Skills"
          description="What you would claim today. Nexora looks to your projects and, later, your assessments to back a claim up."
        >
          <SkillsEditor
            skills={values.skills}
            onChange={setList('skills')}
            errorFor={errorFor}
            disabled={isSaving}
          />
        </ProfileCard>

        <ProfileCard title="Projects" description="What you have actually built.">
          <ProjectsEditor
            projects={values.projects}
            onChange={setList('projects')}
            errorFor={errorFor}
            disabled={isSaving}
          />
        </ProfileCard>

        <ProfileCard title="Certifications" description="Credentials you hold.">
          <CertificationsEditor
            certifications={values.certifications}
            onChange={setList('certifications')}
            errorFor={errorFor}
            disabled={isSaving}
          />
        </ProfileCard>

        {/*
          Sticky on small screens, where six sections are a long scroll and
          Save would otherwise be a destination. From `sm` up the form is
          short enough relative to the viewport that a pinned bar would only
          be spending space the content wants.
        */}
        <div className="sticky bottom-0 -mx-1 rounded-t-2xl border-t border-orange-100 bg-canvas/95 px-1 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
          <button
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving}
            className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-ink-muted sm:w-auto sm:px-8"
          >
            {isSaving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </PageFrame>
  );
}

/** Shared page width and padding, so every state lines up with the others. */
function PageFrame({ children }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">{children}</main>
  );
}

/**
 * Loading state.
 *
 * Skeleton blocks in the shape of the cards that are coming, rather than a
 * spinner: the page does not jump when the content arrives.
 */
function ProfileSkeleton() {
  return (
    <PageFrame>
      <div aria-busy="true" className="flex flex-col gap-5">
        <p role="status" className="sr-only">
          Loading your profile…
        </p>

        <div className="h-9 w-48 animate-pulse rounded-lg bg-orange-100" />

        {[0, 1, 2].map((card) => (
          <div key={card} className="rounded-2xl border border-orange-100 bg-surface p-6">
            <div className="h-5 w-32 animate-pulse rounded bg-orange-100" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="h-11 animate-pulse rounded-xl bg-orange-50" />
              <div className="h-11 animate-pulse rounded-xl bg-orange-50" />
            </div>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}

/** Turns the API's `details` array into a lookup by dotted field path. */
function byField(details) {
  return Object.fromEntries(details.map(({ field, message }) => [field, message]));
}

/** Removes every error belonging to one list, whatever its index. */
function dropErrorsFor(errors, listName) {
  return Object.fromEntries(
    Object.entries(errors).filter(([path]) => !path.startsWith(`${listName}[`)),
  );
}

/**
 * A short, honest line about what is filled in.
 *
 * Counts only what the student actually entered. It deliberately does not
 * compute a "profile completeness" percentage: that number would have to
 * weight the fields against each other, and any weighting we invented now
 * would be arbitrary.
 */
function describeCompleteness({ skills, projects, certifications }) {
  const parts = [
    countOf(skills.length, 'skill'),
    countOf(projects.length, 'project'),
    countOf(certifications.length, 'certification'),
  ].filter(Boolean);

  if (parts.length === 0) return 'Saved. Add skills and projects to give Nexora something to work with.';

  return `Saved — ${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(parts)}.`;
}

/** `smooth`, unless the visitor has asked for less motion. */
function scrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function countOf(count, noun) {
  if (count === 0) return null;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
