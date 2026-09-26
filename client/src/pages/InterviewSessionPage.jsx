import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../constants/interviewOptions.js';
import {
  completeInterviewSession,
  fetchInterviewSessionById,
  startInterviewSession,
  submitInterviewQuestionAnswer,
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

  // Question Runner State
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answersDraft, setAnswersDraft] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [isCompleting, setIsCompleting] = useState(false);

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

  // Sync draft answers from existing submitted answers if already populated
  useEffect(() => {
    if (session?.questions?.length) {
      setAnswersDraft((prev) => {
        const updated = { ...prev };
        for (const q of session.questions) {
          if (q.answer?.answerText && !updated[q.questionId]) {
            updated[q.questionId] = q.answer.answerText;
          }
        }
        return updated;
      });
    }
  }, [session]);

  async function handleStart() {
    if (isStarting || !session) return;
    setIsStarting(true);
    setActionError(null);

    try {
      const { session: startedSession } = await startInterviewSession(session.id);
      setSession(startedSession);
      setActiveQuestionIndex(startedSession.currentQuestionIndex || 0);
      setQuestionStartTime(Date.now());
    } catch (err) {
      setActionError(toMessage(err, 'Failed to start interview session.'));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleSubmitAnswer() {
    if (isSubmitting || !session) return;
    const questionsList = session.questions || [];
    const currentQIndex = Math.min(activeQuestionIndex, Math.max(0, questionsList.length - 1));
    const currentQuestion = questionsList[currentQIndex];
    if (!currentQuestion) return;

    if (currentQuestion.answer) {
      setSubmitError('This question has already been answered.');
      return;
    }

    const draft = (answersDraft[currentQuestion.questionId] || '').trim();
    if (draft.length < INTERVIEW_LIMITS.studentAnswer.min) {
      setSubmitError(`Answer must be at least ${INTERVIEW_LIMITS.studentAnswer.min} characters.`);
      return;
    }
    if (draft.length > INTERVIEW_LIMITS.studentAnswer.max) {
      setSubmitError(`Answer exceeds ${INTERVIEW_LIMITS.studentAnswer.max} character limit.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const elapsedSeconds = Math.max(
      1,
      Math.min(INTERVIEW_LIMITS.maxTimePerQuestionSeconds, Math.round((Date.now() - questionStartTime) / 1000)),
    );

    try {
      const result = await submitInterviewQuestionAnswer(
        session.id,
        currentQuestion.questionId,
        {
          answerText: draft,
          durationSeconds: elapsedSeconds,
        },
      );
      setSession(result.session);
    } catch (err) {
      setSubmitError(toMessage(err, 'Failed to submit answer. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompleteSession() {
    if (isCompleting || !session) return;
    setIsCompleting(true);
    setActionError(null);

    try {
      const result = await completeInterviewSession(session.id);
      setSession(result.session);
    } catch (err) {
      setActionError(toMessage(err, 'Failed to complete interview session.'));
    } finally {
      setIsCompleting(false);
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

  const questions = session.questions || [];
  const currentQIndex = Math.min(activeQuestionIndex, Math.max(0, questions.length - 1));
  const currentQuestion = questions[currentQIndex] || null;

  const currentDraft = currentQuestion ? (answersDraft[currentQuestion.questionId] ?? '') : '';
  const charCount = currentDraft.trim().length;
  const isAnswered = Boolean(currentQuestion?.answer);
  const allQuestionsAnswered = questions.length > 0 && questions.every((q) => Boolean(q.answer));

  // Compute aggregate statistics for the completed results view
  const evaluatedQuestions = questions.filter(
    (q) => q.evaluation && typeof q.evaluation.compositeScore === 'number',
  );

  const avgAccuracy = evaluatedQuestions.length
    ? Math.round(
        (evaluatedQuestions.reduce((s, q) => s + (q.evaluation.dimensions?.accuracy ?? 0), 0) /
          evaluatedQuestions.length) *
          100,
      )
    : null;

  const avgDepth = evaluatedQuestions.length
    ? Math.round(
        (evaluatedQuestions.reduce((s, q) => s + (q.evaluation.dimensions?.depth ?? 0), 0) /
          evaluatedQuestions.length) *
          100,
      )
    : null;

  const avgClarity = evaluatedQuestions.length
    ? Math.round(
        (evaluatedQuestions.reduce((s, q) => s + (q.evaluation.dimensions?.clarity ?? 0), 0) /
          evaluatedQuestions.length) *
          100,
      )
    : null;

  const avgRelevance = evaluatedQuestions.length
    ? Math.round(
        (evaluatedQuestions.reduce((s, q) => s + (q.evaluation.dimensions?.relevance ?? 0), 0) /
          evaluatedQuestions.length) *
          100,
      )
    : null;

  const allStrengths = [
    ...new Set(evaluatedQuestions.flatMap((q) => q.evaluation?.strengths || [])),
  ];
  const allGrowthAreas = [
    ...new Set(evaluatedQuestions.flatMap((q) => q.evaluation?.growthAreas || [])),
  ];

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

            {isInProgress && allQuestionsAnswered ? (
              <div>
                <button
                  type="button"
                  disabled={isCompleting}
                  onClick={handleCompleteSession}
                  aria-busy={isCompleting}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCompleting ? 'Finalizing Interview…' : 'Finalize & Complete Interview'}
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

        {/* Active Question Runner View */}
        {isInProgress && currentQuestion && (
          <div className="flex flex-col gap-4">
            {/* Question Navigation Stepper */}
            <nav aria-label="Interview questions" className="flex items-center gap-2 overflow-x-auto pb-1">
              {questions.map((q, idx) => {
                const qAnswered = Boolean(q.answer);
                const isCurrent = idx === currentQIndex;
                return (
                  <button
                    key={q.questionId || idx}
                    type="button"
                    onClick={() => {
                      setActiveQuestionIndex(idx);
                      setQuestionStartTime(Date.now());
                      setSubmitError(null);
                    }}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`Question ${idx + 1}${qAnswered ? ' (Answered)' : ''}`}
                    className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors duration-150 ${
                      isCurrent
                        ? 'border-2 border-brand bg-brand text-on-brand shadow-sm'
                        : qAnswered
                          ? 'border border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
                          : 'border border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {qAnswered && <span aria-hidden="true">✓</span>}
                      <span>Q{idx + 1}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <Card
              title={`Question ${currentQIndex + 1} of ${questions.length}`}
              description={`Skill: ${currentQuestion.targetSkill} · Type: ${currentQuestion.type}`}
            >
              <div className="flex flex-col gap-5">
                {/* Long Prompt Display with Wrapping & Scroll Guard */}
                <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-4">
                  <p className="text-base font-medium text-ink leading-relaxed break-words whitespace-pre-wrap max-h-72 overflow-y-auto">
                    {currentQuestion.prompt}
                  </p>
                </div>

                {currentQuestion.rubricCriteria?.length > 0 ? (
                  <div className="rounded-xl border border-orange-100 bg-surface p-3 text-xs text-ink-muted">
                    <span className="font-semibold text-ink">Rubric Focus: </span>
                    {currentQuestion.rubricCriteria.join(' · ')}
                  </div>
                ) : null}

                {/* If Question is Already Answered: Show Submitted Answer & Evaluation */}
                {isAnswered ? (
                  <div className="flex flex-col gap-5">
                    {/* Recorded Answer */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          Your Recorded Response
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-800">
                          Submitted (Attempt {currentQuestion.answer.attemptNumber || 1}/1)
                        </span>
                      </div>
                      <div className="rounded-xl border border-orange-100 bg-orange-50/10 p-4 text-sm text-ink leading-relaxed break-words whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {currentQuestion.answer.answerText}
                      </div>
                      {typeof currentQuestion.answer.durationSeconds === 'number' ? (
                        <p className="text-[11px] text-ink-muted">
                          Response time: {currentQuestion.answer.durationSeconds} seconds
                        </p>
                      ) : null}
                    </div>

                    {/* AI Rubric Evaluation Breakdown */}
                    {currentQuestion.evaluation ? (
                      <div className="flex flex-col gap-4 rounded-xl border border-orange-200 bg-surface p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-ink">AI Rubric Evaluation</h3>
                          {currentQuestion.evaluation.compositeScore !== null ? (
                            <span className="rounded-full bg-orange-100 px-3 py-0.5 text-xs font-bold text-brand-text">
                              Composite Score: {Math.round(currentQuestion.evaluation.compositeScore * 100)}%
                            </span>
                          ) : null}
                        </div>

                        {/* Dimensions Grid */}
                        {currentQuestion.evaluation.dimensions ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-2.5 text-center">
                              <p className="text-[11px] font-medium text-ink-muted">Technical Accuracy (35%)</p>
                              <p className="mt-1 text-base font-bold text-ink">
                                {Math.round((currentQuestion.evaluation.dimensions.accuracy ?? 0) * 100)}%
                              </p>
                            </div>
                            <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-2.5 text-center">
                              <p className="text-[11px] font-medium text-ink-muted">Knowledge Depth (30%)</p>
                              <p className="mt-1 text-base font-bold text-ink">
                                {Math.round((currentQuestion.evaluation.dimensions.depth ?? 0) * 100)}%
                              </p>
                            </div>
                            <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-2.5 text-center">
                              <p className="text-[11px] font-medium text-ink-muted">Clarity (20%)</p>
                              <p className="mt-1 text-base font-bold text-ink">
                                {Math.round((currentQuestion.evaluation.dimensions.clarity ?? 0) * 100)}%
                              </p>
                            </div>
                            <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-2.5 text-center">
                              <p className="text-[11px] font-medium text-ink-muted">Relevance (15%)</p>
                              <p className="mt-1 text-base font-bold text-ink">
                                {Math.round((currentQuestion.evaluation.dimensions.relevance ?? 0) * 100)}%
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {currentQuestion.evaluation.feedback ? (
                          <div className="rounded-lg border border-orange-100 bg-surface p-3 text-xs text-ink leading-relaxed break-words whitespace-pre-wrap">
                            <p className="font-semibold text-ink-muted uppercase text-[10px] tracking-wider mb-1">
                              Feedback Summary
                            </p>
                            {currentQuestion.evaluation.feedback}
                          </div>
                        ) : null}

                        {currentQuestion.evaluation.strengths?.length > 0 ? (
                          <div>
                            <p className="text-xs font-semibold text-ink-muted">Key Strengths:</p>
                            <ul className="mt-1 list-disc list-inside text-xs text-ink space-y-0.5">
                              {currentQuestion.evaluation.strengths.map((str, i) => (
                                <li key={i} className="break-words">{str}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {currentQuestion.evaluation.growthAreas?.length > 0 ? (
                          <div>
                            <p className="text-xs font-semibold text-ink-muted">Growth Areas:</p>
                            <ul className="mt-1 list-disc list-inside text-xs text-ink space-y-0.5">
                              {currentQuestion.evaluation.growthAreas.map((area, i) => (
                                <li key={i} className="break-words">{area}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Navigation Buttons for Answered State */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                      <button
                        type="button"
                        disabled={currentQIndex === 0}
                        onClick={() => {
                          setActiveQuestionIndex((prev) => Math.max(0, prev - 1));
                          setQuestionStartTime(Date.now());
                          setSubmitError(null);
                        }}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ← Previous Question
                      </button>

                      {currentQIndex < questions.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1));
                            setQuestionStartTime(Date.now());
                            setSubmitError(null);
                          }}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-soft"
                        >
                          Next Question →
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isCompleting}
                          onClick={handleCompleteSession}
                          aria-busy={isCompleting}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {isCompleting ? 'Finalizing Interview…' : 'Complete Interview'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* If Question is NOT Answered: Show Input Form with Safe Submission */
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="interview-answer-input"
                        className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
                      >
                        Your Response:
                      </label>
                      <span
                        className={`text-xs ${
                          charCount > INTERVIEW_LIMITS.studentAnswer.max
                            ? 'font-bold text-danger-text'
                            : charCount >= INTERVIEW_LIMITS.studentAnswer.min
                              ? 'text-ink-muted'
                              : 'text-amber-700'
                        }`}
                      >
                        {charCount} / {INTERVIEW_LIMITS.studentAnswer.max} characters
                        {charCount < INTERVIEW_LIMITS.studentAnswer.min && (
                          <span className="ml-1">({INTERVIEW_LIMITS.studentAnswer.min - charCount} more needed)</span>
                        )}
                      </span>
                    </div>

                    <textarea
                      id="interview-answer-input"
                      name="answerText"
                      rows={8}
                      value={currentDraft}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAnswersDraft((prev) => ({ ...prev, [currentQuestion.questionId]: val }));
                        if (submitError) setSubmitError(null);
                      }}
                      disabled={isSubmitting}
                      placeholder="Explain your approach, architectural trade-offs, and reasoning in detail (minimum 10 characters)…"
                      className="w-full rounded-xl border border-orange-200 bg-surface p-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 min-h-[160px] max-h-[380px] overflow-y-auto break-words resize-y disabled:cursor-not-allowed disabled:opacity-60"
                    />

                    {/* Inline Error & Retry on Failure */}
                    {submitError && (
                      <div
                        role="alert"
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-red-200 bg-red-50/50 p-3.5 text-xs text-danger-text"
                      >
                        <span className="break-words">{submitError}</span>
                        <button
                          type="button"
                          onClick={handleSubmitAnswer}
                          disabled={
                            isSubmitting ||
                            charCount < INTERVIEW_LIMITS.studentAnswer.min ||
                            charCount > INTERVIEW_LIMITS.studentAnswer.max
                          }
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-red-300 bg-surface px-4 py-2 font-semibold text-danger-text hover:bg-red-50 disabled:opacity-50"
                        >
                          Retry Submission
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={currentQIndex === 0 || isSubmitting}
                          onClick={() => {
                            setActiveQuestionIndex((prev) => Math.max(0, prev - 1));
                            setQuestionStartTime(Date.now());
                            setSubmitError(null);
                          }}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ← Previous Question
                        </button>
                        {currentQIndex < questions.length - 1 && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => {
                              setActiveQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1));
                              setQuestionStartTime(Date.now());
                              setSubmitError(null);
                            }}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Next Question →
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        id="submit-interview-answer-btn"
                        disabled={
                          isSubmitting ||
                          charCount < INTERVIEW_LIMITS.studentAnswer.min ||
                          charCount > INTERVIEW_LIMITS.studentAnswer.max
                        }
                        onClick={handleSubmitAnswer}
                        aria-busy={isSubmitting}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                      >
                        {isSubmitting ? 'Submitting & Evaluating…' : 'Submit Answer for Evaluation'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Completed & Comprehensive Results View */}
        {isCompleted && (
          <div className="flex flex-col gap-6">
            {/* Header Score Card */}
            <Card>
              <div className="flex flex-col items-center py-6 text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3.5 py-1 text-xs font-semibold text-green-700">
                    Evaluation Complete
                  </span>
                  <span className={`inline-flex rounded-full border px-3.5 py-1 text-xs font-semibold ${
                    session.evaluatorType === 'human'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                      : 'border-orange-200 bg-orange-50 text-brand-text'
                  }`}>
                    {session.evaluatorType === 'human' ? 'Human Evaluator' : 'AI Formative Evaluation'}
                  </span>
                </div>

                {session.overallScore !== null ? (
                  <div className="mt-4 flex flex-col items-center">
                    <span className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                      {Math.round(session.overallScore * 100)}%
                    </span>
                    <span className="mt-1 text-sm font-medium text-ink-muted">Overall Technical Score</span>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-0.5 text-xs font-semibold ${
                      session.overallScore >= 0.7
                        ? 'border border-green-200 bg-green-50 text-green-800'
                        : 'border border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      {session.overallScore >= 0.7 ? 'Strong Competency' : 'Needs Reinforcement'}
                    </span>
                  </div>
                ) : (
                  <p className="mt-4 text-base font-semibold text-ink-muted">Evaluation in progress or pending.</p>
                )}

                <p className="mt-3 max-w-lg text-sm text-ink-muted leading-relaxed">
                  Results computed across {evaluatedQuestions.length} answered questions targeting{' '}
                  <strong className="text-ink">{session.targetSkills.join(', ')}</strong>.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    to="/interviews"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft shadow-sm"
                  >
                    Back to Interviews
                  </Link>
                  <Link
                    to="/career-twin"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-6 py-2.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
                  >
                    View CareerTwin Profile
                  </Link>
                </div>
              </div>
            </Card>

            {/* Skill Evidence & Credential Status Card */}
            <Card title="Skill Evidence Status" description="Evaluation authority and verified credential eligibility">
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {session.targetSkills.map((skill) => (
                    <div
                      key={skill}
                      className="flex flex-col justify-between rounded-xl border border-orange-100 bg-orange-50/20 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink text-sm">{skill}</span>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          session.evaluatorType === 'human' && (session.overallScore ?? 0) >= 0.7
                            ? 'border-green-200 bg-green-50 text-green-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}>
                          {session.evaluatorType === 'human' && (session.overallScore ?? 0) >= 0.7
                            ? 'Verified Credential'
                            : 'Formative Evidence'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-ink-muted leading-relaxed">
                        {session.evaluatorType === 'human' && (session.overallScore ?? 0) >= 0.7
                          ? 'Evidence granted with institutional verified credential status.'
                          : 'Recorded as formative interview practice. Institutional verification requires human evaluator sign-off.'}
                      </p>
                    </div>
                  ))}
                </div>

                {session.evidenceCheck ? (
                  <p className="text-xs text-ink-muted">
                    Skill Evidence Check ID: <code className="font-mono text-ink">{session.evidenceCheck}</code>
                  </p>
                ) : null}
              </div>
            </Card>

            {/* Multi-Dimensional Aggregate Performance Card */}
            {evaluatedQuestions.length > 0 && (
              <Card title="Rubric Dimensions Breakdown" description="Aggregate average score across all answered questions">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3.5 text-center">
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Accuracy (35%)</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{avgAccuracy ?? '—'}%</p>
                    <p className="mt-1 text-[11px] text-ink-muted">Technical precision</p>
                  </div>
                  <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3.5 text-center">
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Depth (30%)</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{avgDepth ?? '—'}%</p>
                    <p className="mt-1 text-[11px] text-ink-muted">Trade-offs & architecture</p>
                  </div>
                  <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3.5 text-center">
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Clarity (20%)</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{avgClarity ?? '—'}%</p>
                    <p className="mt-1 text-[11px] text-ink-muted">Structured reasoning</p>
                  </div>
                  <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3.5 text-center">
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Relevance (15%)</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{avgRelevance ?? '—'}%</p>
                    <p className="mt-1 text-[11px] text-ink-muted">Scope alignment</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Consolidated Strengths & Growth Areas */}
            {(allStrengths.length > 0 || allGrowthAreas.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {allStrengths.length > 0 && (
                  <Card title="Demonstrated Strengths">
                    <ul className="list-disc list-inside space-y-1.5 text-xs text-ink leading-relaxed">
                      {allStrengths.map((str, i) => (
                        <li key={i} className="break-words">{str}</li>
                      ))}
                    </ul>
                  </Card>
                )}
                {allGrowthAreas.length > 0 && (
                  <Card title="Recommended Growth Areas">
                    <ul className="list-disc list-inside space-y-1.5 text-xs text-ink leading-relaxed">
                      {allGrowthAreas.map((area, i) => (
                        <li key={i} className="break-words">{area}</li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )}

            {/* Detailed Per-Question Evaluation Breakdown */}
            <Card title="Question-by-Question Evaluation Breakdown" description="Detailed review of your answers and evaluator feedback">
              <div className="flex flex-col gap-6">
                {session.questions.map((q, idx) => (
                  <div
                    key={q.questionId || idx}
                    className="flex flex-col gap-3 rounded-xl border border-orange-100 bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-sm">Question {idx + 1}</span>
                        <span className="rounded-full border border-orange-200 bg-orange-50/50 px-2 py-0.5 text-[11px] font-medium text-ink">
                          {q.targetSkill}
                        </span>
                      </div>
                      {q.evaluation?.compositeScore !== null && q.evaluation?.compositeScore !== undefined ? (
                        <span className="rounded-full bg-orange-100 px-3 py-0.5 text-xs font-bold text-brand-text">
                          Score: {Math.round(q.evaluation.compositeScore * 100)}%
                        </span>
                      ) : (
                        <span className="text-xs text-ink-muted">Not answered</span>
                      )}
                    </div>

                    <p className="text-sm font-medium text-ink leading-relaxed break-words whitespace-pre-wrap">
                      {q.prompt}
                    </p>

                    {q.answer ? (
                      <div className="flex flex-col gap-1.5 rounded-lg border border-orange-100 bg-orange-50/10 p-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                          Your Answer:
                        </span>
                        <p className="text-xs text-ink leading-relaxed break-words whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {q.answer.answerText}
                        </p>
                      </div>
                    ) : null}

                    {q.evaluation ? (
                      <div className="flex flex-col gap-3 pt-1">
                        {q.evaluation.dimensions ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-xs">
                            <div className="rounded bg-surface border border-orange-100 p-2">
                              <p className="text-[10px] text-ink-muted">Accuracy</p>
                              <p className="font-bold text-ink">
                                {Math.round((q.evaluation.dimensions.accuracy ?? 0) * 100)}%
                              </p>
                            </div>
                            <div className="rounded bg-surface border border-orange-100 p-2">
                              <p className="text-[10px] text-ink-muted">Depth</p>
                              <p className="font-bold text-ink">
                                {Math.round((q.evaluation.dimensions.depth ?? 0) * 100)}%
                              </p>
                            </div>
                            <div className="rounded bg-surface border border-orange-100 p-2">
                              <p className="text-[10px] text-ink-muted">Clarity</p>
                              <p className="font-bold text-ink">
                                {Math.round((q.evaluation.dimensions.clarity ?? 0) * 100)}%
                              </p>
                            </div>
                            <div className="rounded bg-surface border border-orange-100 p-2">
                              <p className="text-[10px] text-ink-muted">Relevance</p>
                              <p className="font-bold text-ink">
                                {Math.round((q.evaluation.dimensions.relevance ?? 0) * 100)}%
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {q.evaluation.feedback ? (
                          <div className="rounded-lg border border-orange-100 bg-surface p-3 text-xs text-ink leading-relaxed break-words whitespace-pre-wrap">
                            <p className="font-semibold text-ink-muted uppercase text-[10px] tracking-wider mb-1">
                              Feedback
                            </p>
                            {q.evaluation.feedback}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex flex-wrap gap-3 pt-3">
              <Link
                to="/opportunities"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand hover:bg-brand-soft"
              >
                Explore Matched Opportunities →
              </Link>
              <Link
                to="/career-twin"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-brand"
              >
                View CareerTwin Evidence →
              </Link>
              <Link
                to="/interviews"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-brand"
              >
                Back to Interviews
              </Link>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
