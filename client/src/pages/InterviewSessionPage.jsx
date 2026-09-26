import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  INTERVIEW_DIFFICULTY_PRESENTATION,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../constants/interviewOptions.js';
import {
  fetchInterviewSessionById,
  startInterviewSession,
} from '../services/interview.service.js';
import { toMessage } from '../utils/errorMessage.js';

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function InterviewSessionPage() {
  const { sessionId } = useParams();

  const [session, setSession] = useState(null);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const loadSession = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);
    try {
      const { session: fetchedSession } = await fetchInterviewSessionById(sessionId, { signal });
      if (signal?.aborted) return;
      setSession(fetchedSession);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (err) {
      if (signal?.aborted) return;
      setLoadError(toMessage(err, 'Failed to load interview session.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, [sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  async function handleStart() {
    if (isStarting || !session) return;
    setIsStarting(true);
    setActionError(null);

    try {
      const { session: startedSession } = await startInterviewSession(session.id);
      setSession(startedSession);
    } catch (err) {
      setActionError(toMessage(err, 'Failed to start interview session.'));
    } finally {
      setIsStarting(false);
    }
  }

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Loading interview session…" rows={4} />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <PageHeader backTo="/interviews" backLabel="Interviews" title="Interview Unavailable">
          Could not load the requested session.
        </PageHeader>
        <ErrorState title="Session Load Error" message={loadError} onRetry={() => loadSession()} />
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell>
        <EmptyState>No interview session found.</EmptyState>
      </PageShell>
    );
  }

  const diffPres = INTERVIEW_DIFFICULTY_PRESENTATION[session.difficulty] ?? {
    label: session.difficulty,
    badgeClass: 'border-orange-200 bg-surface text-ink',
  };

  const statusPres = SESSION_STATUS_PRESENTATION[session.status] ?? {
    label: session.status,
    badgeClass: 'border-orange-200 bg-orange-50 text-ink',
  };

  const isInitialized = session.status === SESSION_STATUS.INITIALIZED;
  const isInProgress = session.status === SESSION_STATUS.IN_PROGRESS;
  const isCompleted = session.status === SESSION_STATUS.COMPLETED;

  const currentQIndex = session.currentQuestionIndex || 0;
  const currentQuestion = session.questions[currentQIndex] || session.questions[0] || null;

  return (
    <PageShell>
      <PageHeader
        backTo="/interviews"
        backLabel="Interviews"
        title={`Technical Interview — ${session.targetRole.replace('-', ' ')}`}
      >
        <span className="capitalize">{diffPres.label}</span> difficulty ·{' '}
        {session.questionCount} Questions · Evaluator: AI Rubric
      </PageHeader>

      <div className="flex flex-col gap-6">
        {actionError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-surface p-4 text-sm text-danger-text">
            {actionError}
          </div>
        ) : null}

        {/* Session Status & Overview Banner */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusPres.badgeClass}`}>
                  {statusPres.label}
                </span>
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${diffPres.badgeClass}`}>
                  {diffPres.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Focal Skills: <strong className="text-ink">{session.targetSkills.join(', ')}</strong>
              </p>
            </div>

            {isInitialized ? (
              <div>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={handleStart}
                  aria-busy={isStarting}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStarting ? 'Starting Session…' : 'Begin Interview Session'}
                </button>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Truthful Provider & Advisory Information */}
        <div className="rounded-2xl border border-orange-100 bg-orange-50/20 p-5">
          <div className="flex items-start gap-3 text-xs text-ink-muted">
            <span className="text-base" aria-hidden="true">ℹ️</span>
            <div>
              <p className="font-semibold text-ink">Advisory AI Evaluation Notice</p>
              <p className="mt-0.5 leading-relaxed">
                This interview uses structured multi-dimensional AI rubric evaluation for practice and feedback.
                AI interview scores reflect preparedness and do not constitute deterministic or institutional verified credentials without human evaluator review.
              </p>
            </div>
          </div>
        </div>

        {/* Initialized State Preview */}
        {isInitialized && (
          <Card title="Session Ready">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink leading-relaxed">
                Your session has been prepared with {session.questions.length} tailored interview questions covering{' '}
                {session.targetSkills.join(', ')}. When you click &ldquo;Begin Interview Session&rdquo;, the timer begins and you can submit structured responses for each prompt.
              </p>

              <div className="rounded-xl border border-orange-100 bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase text-ink-muted">Evaluation Dimensions:</h3>
                <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2 text-ink">
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    <strong>Technical Accuracy (35%)</strong> — correctness & depth of concept
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    <strong>Knowledge Depth (30%)</strong> — architecture & trade-off awareness
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    <strong>Communication Clarity (20%)</strong> — structured explanation
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    <strong>Relevance (15%)</strong> — alignment with prompt scope
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        )}

        {/* Active Question View (when in progress) */}
        {isInProgress && currentQuestion && (
          <Card
            title={`Question ${currentQIndex + 1} of ${session.questions.length}`}
            description={`Skill: ${currentQuestion.targetSkill} · Type: ${currentQuestion.type}`}
          >
            <div className="flex flex-col gap-4">
              <p className="text-base font-semibold text-ink break-words">
                {currentQuestion.prompt}
              </p>

              {currentQuestion.rubricCriteria?.length > 0 ? (
                <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3 text-xs text-ink-muted">
                  <span className="font-semibold text-ink">Rubric Focus: </span>
                  {currentQuestion.rubricCriteria.join(' · ')}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="interview-answer-input"
                  className="text-xs font-semibold text-ink-muted uppercase"
                >
                  Your Response:
                </label>
                <textarea
                  id="interview-answer-input"
                  rows={6}
                  placeholder="Explain your approach, architectural trade-offs, and reasoning in detail (minimum 10 characters)…"
                  className="w-full rounded-xl border border-orange-200 bg-surface p-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Link
                  to="/interviews"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text"
                >
                  Return to Interview Overview
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Completed View */}
        {isCompleted && (
          <Card title="Interview Complete & Evaluated">
            <div className="flex flex-col items-center py-6 text-center">
              <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-4 py-1 text-sm font-semibold text-green-700">
                Evaluation Complete
              </span>

              {session.overallScore !== null ? (
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink">
                  Overall Score: {Math.round(session.overallScore * 100)}%
                </h2>
              ) : null}

              <p className="mt-2 max-w-md text-sm text-ink-muted">
                Your interview has been processed and analyzed according to the technical evaluation rubric.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/interviews"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-soft"
                >
                  Back to Interviews
                </Link>
                <Link
                  to="/career-twin"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text"
                >
                  View CareerTwin Profile
                </Link>
              </div>
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
