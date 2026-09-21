import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import { FormAlert } from '../components/FormAlert.jsx';
import { ParsedResume } from '../components/resume/ParsedResume.jsx';
import { ProcessingStatus, StepFailure } from '../components/resume/ProcessingStatus.jsx';
import { ApiRequestError } from '../services/apiClient.js';
import { PROCESSING_STATUS, analyseResume, deleteResume, fetchResume } from '../services/resume.service.js';
import { formatDate, toMessage } from './ResumePage.jsx';

/**
 * /resume/:resumeId — one stored resume, and what analysing it produced.
 *
 * The page has to be honest about three different things at once: whether
 * the text was stored, whether an analysis has been run, and how much of
 * that analysis survived grounding. They are shown separately because they
 * fail separately.
 */

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function ResumeDetailPage() {
  const { resumeId } = useParams();
  const navigate = useNavigate();

  const [resume, setResume] = useState(null);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);
  const [isMissing, setIsMissing] = useState(false);

  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [isRetryable, setIsRetryable] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(
    async (signal) => {
      setLoadStatus(LOAD_STATUS.LOADING);
      setLoadError(null);
      setIsMissing(false);

      try {
        const result = await fetchResume(resumeId, { signal });
        if (signal?.aborted) return;

        setResume(result);
        setLoadStatus(LOAD_STATUS.READY);
      } catch (error) {
        if (signal?.aborted) return;

        // A 404 here means "no resume of yours has that id" — the backend
        // deliberately answers the same way for someone else's resume. It is
        // not a failure to retry, so it gets its own state.
        if (error instanceof ApiRequestError && error.status === 404) setIsMissing(true);

        setLoadError(toMessage(error, 'This resume could not be loaded.'));
        setLoadStatus(LOAD_STATUS.FAILED);
      }
    },
    [resumeId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function analyse() {
    setIsAnalysing(true);
    setAnalysisError(null);

    try {
      setResume(await analyseResume(resumeId));
    } catch (error) {
      setAnalysisError(toMessage(error, 'The analysis could not be run.'));

      // 503 is a deployment state that can change, and 409 clears once the
      // run in flight finishes — both are worth trying again. A 502 means
      // the model produced something unusable, and an immediate retry would
      // very likely produce the same thing.
      const status = error instanceof ApiRequestError ? error.status : null;
      setIsRetryable(status === null || status === 503 || status === 409);

      // The server records the failure on the document, so reload to show
      // the stored status rather than leaving a stale "in progress" badge.
      try {
        setResume(await fetchResume(resumeId));
      } catch {
        // Keeping the analysis error on screen matters more than refreshing
        // the badge; the reload is a nicety, not the point of the action.
      }
    } finally {
      setIsAnalysing(false);
    }
  }

  async function remove() {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteResume(resumeId);
      navigate('/resume', { replace: true });
    } catch (error) {
      setDeleteError(toMessage(error, 'This resume could not be deleted.'));
      setIsDeleting(false);
    }
  }

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Loading this resume…" rows={2} />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title={isMissing ? 'That resume is not there' : 'This resume could not be loaded'}
          message={loadError}
          onRetry={isMissing ? () => navigate('/resume') : () => load()}
          retryLabel={isMissing ? 'Back to your resumes' : 'Try again'}
        />
      </PageShell>
    );
  }

  const hasRun = resume.analysis.status === PROCESSING_STATUS.COMPLETED;

  return (
    <PageShell>
      <PageHeader
        backTo="/resume"
        backLabel="All resumes"
        title={resume.label ?? 'Untitled resume'}
      >
        Saved {formatDate(resume.createdAt)} · {resume.textLength.toLocaleString('en')} characters
      </PageHeader>

      <div className="flex flex-col gap-5">
        <Card title="Status">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <ProcessingStatus step={resume.extraction} name="Text" />
              <ProcessingStatus step={resume.analysis} name="Analysis" />
            </div>

            <StepFailure step={resume.extraction}>
              The text of this resume could not be read.
            </StepFailure>
            <StepFailure step={resume.analysis}>The last analysis failed.</StepFailure>

            <FormAlert
              message={analysisError}
              action={
                isRetryable && !isAnalysing ? { label: 'Try again', onClick: analyse } : undefined
              }
            />

            <div>
              <button
                type="button"
                onClick={analyse}
                disabled={isAnalysing}
                aria-busy={isAnalysing}
                className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-ink-muted sm:w-auto sm:px-8"
              >
                {isAnalysing ? 'Analysing…' : hasRun ? 'Analyse again' : 'Analyse this resume'}
              </button>

              {/*
                Said before the press, not after. Analysis calls a model, and
                a student deserves to know that is what the button does.
              */}
              <p className="mt-2 text-xs text-ink-muted">
                Sends the text above to the configured AI provider, which reads it into structured
                fields. Anything it reports that Nexora cannot find in your own text is dropped.
              </p>
            </div>
          </div>
        </Card>

        {/*
          Warnings come before the results. They are the record of what the
          grounding step threw away, and a student who reads the extraction
          without them has been given a more confident picture than the data
          supports.
        */}
        {resume.warnings.length > 0 ? (
          <Card
            title={`${resume.warnings.length} value${resume.warnings.length === 1 ? '' : 's'} dropped`}
            description="The analysis reported these, but Nexora could not find them in your resume text, so they were not kept."
          >
            <ul className="flex flex-col gap-2">
              {resume.warnings.map((warning, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-2.5 text-sm text-ink"
                >
                  <span aria-hidden="true" className="font-bold text-warning-text">
                    !
                  </span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card title="What the analysis read">
          {resume.parsed ? (
            <ParsedResume parsed={resume.parsed} analysedBy={resume.analysedBy} />
          ) : (
            <EmptyState>
              {resume.analysis.status === PROCESSING_STATUS.FAILED
                ? 'No structured data was stored, because the analysis did not finish.'
                : 'Not analysed yet. Run the analysis above to read this resume into structured skills, projects and experience.'}
            </EmptyState>
          )}
        </Card>

        <Card title="Stored text" description="Exactly what was saved, and what gets analysed.">
          <pre className="max-h-96 overflow-auto rounded-xl border border-orange-100 bg-orange-50/30 p-4 text-xs whitespace-pre-wrap text-ink">
            {resume.extractedText}
          </pre>
        </Card>

        <Card title="Delete" description="Removes this resume and anything the analysis produced.">
          <FormAlert message={deleteError} />

          {confirmingDelete ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={remove}
                disabled={isDeleting}
                aria-busy={isDeleting}
                className="rounded-xl bg-danger px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-ink-muted"
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete this resume'}
              </button>

              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={isDeleting}
                className="rounded-xl border border-orange-200 px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-danger-text transition-colors duration-200 hover:bg-red-50"
            >
              Delete this resume
            </button>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
