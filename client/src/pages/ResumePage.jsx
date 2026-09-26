import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import { FieldShell, controlClassName } from '../components/FieldShell.jsx';
import { FormAlert } from '../components/FormAlert.jsx';
import { FormField } from '../components/FormField.jsx';
import { FormTextarea } from '../components/FormTextarea.jsx';
import { ProcessingStatus } from '../components/resume/ProcessingStatus.jsx';
import {
  FILE_UPLOAD_AVAILABLE,
  RESUMES_PER_USER,
  RESUME_LABEL_MAX,
  RESUME_TEXT_LIMITS,
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_MAX_BYTES,
  RESUME_UPLOAD_TYPES,
} from '../constants/resumeOptions.js';
import { ApiRequestError } from '../services/apiClient.js';
import { createResume, createResumeFromFile, fetchResumes } from '../services/resume.service.js';
import { formatDate } from '../utils/dateFormat.js';
import { toMessage } from '../utils/errorMessage.js';

// Re-export for backward compatibility — other pages historically imported
// these from ResumePage. New code should import from utils/ directly.
export { formatDate, toMessage };

/**
 * /resume — the student's stored resumes, and the form that adds one.
 *
 * Storing a resume and analysing it are separate actions on the backend, and
 * they stay separate here: this page only ever stores pasted or extracted
 * text. Analysis lives on the detail page, behind a deliberate press, because
 * it costs money and a student who only wanted to keep a copy should not spend
 * it by accident.
 */

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function ResumePage() {
  const [resumes, setResumes] = useState([]);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);

    try {
      const result = await fetchResumes({ signal });
      if (signal?.aborted) return;

      setResumes(result);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (error) {
      if (signal?.aborted) return;

      setLoadError(toMessage(error, 'Your resumes could not be loaded.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Loading your resumes…" rows={2} />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title="Your resumes could not be loaded"
          message={loadError}
          onRetry={() => load()}
        />
      </PageShell>
    );
  }

  const isFull = resumes.length >= RESUMES_PER_USER;

  return (
    <PageShell>
      <PageHeader title="Resume">
        {resumes.length === 0
          ? 'Nothing saved yet. Paste a resume below and Nexora can read it into structured skills, projects and experience.'
          : `${resumes.length} of ${RESUMES_PER_USER} saved.`}
      </PageHeader>

      <div className="flex flex-col gap-5">
        <Card title="Saved resumes" description="Newest first. Open one to analyse or delete it.">
          {resumes.length === 0 ? (
            <EmptyState>No resumes saved yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {resumes.map((resume) => (
                <li key={resume.id}>
                  <ResumeRow resume={resume} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <AddResumeCard
          isFull={isFull}
          onAdded={(resume) => setResumes((current) => [resume, ...current])}
        />
      </div>
    </PageShell>
  );
}

/** One row in the list — enough to tell resumes apart and see where each is. */
function ResumeRow({ resume }) {
  return (
    <Link
      to={`/resume/${resume.id}`}
      className="animate-rise block rounded-xl border border-orange-100 bg-orange-50/30 p-4 transition-colors duration-200 hover:border-brand hover:bg-orange-50"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">{resume.label ?? 'Untitled resume'}</p>
        <p className="text-xs text-ink-muted">{formatDate(resume.createdAt)}</p>
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        {resume.textLength.toLocaleString('en')} characters
        {resume.file.originalName ? ` · ${resume.file.originalName}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <ProcessingStatus step={resume.extraction} name="Text" />
        <ProcessingStatus step={resume.analysis} name="Analysis" />
      </div>
    </Link>
  );
}

/**
 * The paste form.
 *
 * Length is checked here as well as on the server — not to replace the
 * server's answer, but because "too short" is knowable without a round trip
 * and a counter that cannot say how much is left is not much of a counter.
 * The server's rejection still wins: it is what sets the field error.
 */
function AddResumeCard({ isFull, onAdded }) {
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saved, setSaved] = useState(null);

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < RESUME_TEXT_LIMITS.min;

  function clearResult() {
    setError(null);
    setIsRetryable(false);
    setSaved(null);
  }

  async function submit() {
    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    setSaved(null);

    try {
      const resume = await createResume({ label: label.trim(), text });

      onAdded(resume);
      setSaved(resume);
      setLabel('');
      setText('');
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.details) {
        setFieldErrors(Object.fromEntries(failure.details.map((d) => [d.field, d.message])));
        setError('Some fields need attention. They are marked below.');
      } else {
        setError(toMessage(failure, 'Your resume could not be saved.'));
        // A conflict is a state to resolve, not a hiccup to retry through.
        setIsRetryable(!(failure instanceof ApiRequestError) || failure.status !== 409);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (isSaving || isFull) return;
    submit();
  }

  async function submitFile() {
    if (!file) return;

    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    setSaved(null);

    try {
      const resume = await createResumeFromFile({ label: label.trim(), file });

      onAdded(resume);
      setSaved(resume);
      setLabel('');
      setFile(null);
      fileInputRef.current.value = '';
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.details) {
        setFieldErrors(Object.fromEntries(failure.details.map((d) => [d.field, d.message])));
        setError('Some fields need attention. They are marked below.');
      } else {
        setError(toMessage(failure, 'Your resume could not be uploaded.'));
        setIsRetryable(!(failure instanceof ApiRequestError) || failure.status !== 409);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null;
    clearResult();

    if (!nextFile) {
      setFile(null);
      setFieldErrors({});
      return;
    }

    const validationError = validateUploadFile(nextFile);
    if (validationError) {
      setFile(null);
      setFieldErrors({ file: validationError });
      return;
    }

    setFile(nextFile);
    setFieldErrors({});
  }
  return (
    <Card
      title="Add a resume"
      description="Paste the text of your resume. Nexora stores it as-is; analysing it is a separate step."
    >
      {isFull ? (
        <EmptyState>
          You have reached the limit of {RESUMES_PER_USER} saved resumes. Delete one before adding
          another.
        </EmptyState>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormAlert
            message={error}
            action={
              isRetryable && !isSaving
                ? { label: 'Try again', onClick: file ? submitFile : submit }
                : undefined
            }
          />

          {saved ? (
            <FormAlert
              tone="success"
              message={`${saved.source === 'file_upload' ? 'Uploaded' : 'Saved'} “${saved.label ?? 'Untitled resume'}”. Open it to run the analysis.`}
            />
          ) : null}

          <FormField
            label="Label"
            value={label}
            onChange={(value) => {
              setLabel(value);
              clearResult();
            }}
            error={fieldErrors.label}
            maxLength={RESUME_LABEL_MAX}
            hint="Something you will recognise later, like “Backend — March 2026”."
            placeholder="Backend internships"
            required={false}
            disabled={isSaving}
          />

          <FormTextarea
            label="Resume text"
            value={text}
            onChange={(value) => {
              setText(value);
              clearResult();
            }}
            error={fieldErrors.text ?? (tooShort ? shortMessage(trimmed.length) : undefined)}
            maxLength={RESUME_TEXT_LIMITS.max}
            rows={12}
            hint={`Between ${RESUME_TEXT_LIMITS.min} and ${RESUME_TEXT_LIMITS.max.toLocaleString('en')} characters. Layout is kept — paste it exactly as it is.`}
            required={false}
            disabled={isSaving}
          />

          {FILE_UPLOAD_AVAILABLE ? (
            <FieldShell
              label="Resume file"
              error={fieldErrors.file}
              hint="PDF, DOCX or plain text. Maximum size: 5 MB."
              required={false}
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  ref={fileInputRef}
                  type="file"
                  accept={RESUME_UPLOAD_ACCEPT}
                  onChange={handleFileChange}
                  disabled={isSaving}
                  aria-invalid={invalid ? 'true' : undefined}
                  aria-describedby={describedBy}
                  className={controlClassName(invalid)}
                />
              )}
            </FieldShell>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSaving || trimmed.length < RESUME_TEXT_LIMITS.min}
              aria-busy={isSaving}
              className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-ink-muted sm:w-auto sm:px-8"
            >
              {isSaving ? 'Saving…' : 'Save resume'}
            </button>

            {FILE_UPLOAD_AVAILABLE ? (
              <button
                type="button"
                onClick={submitFile}
                disabled={isSaving || !file}
                aria-busy={isSaving}
                className="w-full rounded-xl border border-brand px-5 py-3 text-sm font-semibold text-brand-text transition-colors duration-200 hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-ink-muted disabled:text-ink-muted sm:w-auto sm:px-8"
              >
                {isSaving ? 'Uploading…' : 'Upload resume'}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </Card>
  );
}

function validateUploadFile(file) {
  if (file.size > RESUME_UPLOAD_MAX_BYTES) {
    return 'That file is larger than the 5 MB limit.';
  }

  const type = RESUME_UPLOAD_TYPES[file.type];
  const name = file.name.toLowerCase();
  if (!type || !type.extensions.some((extension) => name.endsWith(extension))) {
    return 'Choose a PDF, DOCX or plain text resume file.';
  }

  return null;
}

function shortMessage(length) {
  const needed = RESUME_TEXT_LIMITS.min - length;
  return `Too short to be a resume — ${needed} more character${needed === 1 ? '' : 's'} needed.`;
}
