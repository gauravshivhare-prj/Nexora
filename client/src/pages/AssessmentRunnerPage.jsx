import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  ATTEMPT_STATUS,
  DIFFICULTY_PRESENTATION,
  QUESTION_RESULT_STATUS,
  QUESTION_TYPES,
} from '../constants/assessmentOptions.js';
import {
  fetchAssessmentById,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from '../services/assessment.service.js';
import { toMessage } from '../utils/errorMessage.js';

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function AssessmentRunnerPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);
  const [isLimitReached, setIsLimitReached] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const initAttempt = useCallback(
    async (signal) => {
      setLoadStatus(LOAD_STATUS.LOADING);
      setLoadError(null);
      setSubmitError(null);
      setIsLimitReached(false);

      try {
        const [assessmentRes, attemptRes] = await Promise.all([
          fetchAssessmentById(assessmentId, { signal }),
          startAssessmentAttempt(assessmentId, { signal }),
        ]);

        if (signal?.aborted) return;

        setAssessment(assessmentRes.assessment);
        setAttempt(attemptRes.attempt);

        // If attempt is already evaluated or timed out, capture its result
        if (
          attemptRes.attempt.status === ATTEMPT_STATUS.EVALUATED ||
          attemptRes.attempt.status === ATTEMPT_STATUS.TIMED_OUT ||
          attemptRes.attempt.result
        ) {
          setSubmissionResult({
            attempt: attemptRes.attempt,
            result: attemptRes.attempt.result || attemptRes.attempt,
          });
        }

        // Restore any previously answered questions if resuming
        if (attemptRes.attempt.answers && typeof attemptRes.attempt.answers === 'object') {
          const initialAnswers = {};
          if (Array.isArray(attemptRes.attempt.answers)) {
            for (const item of attemptRes.attempt.answers) {
              if (item?.questionId) initialAnswers[item.questionId] = item.answer;
            }
          } else {
            Object.assign(initialAnswers, attemptRes.attempt.answers);
          }
          setAnswers(initialAnswers);
        }

        setLoadStatus(LOAD_STATUS.READY);
      } catch (err) {
        if (signal?.aborted) return;
        const msg = toMessage(err, 'Failed to initialize assessment attempt.');
        if (/Maximum number of attempts/i.test(msg)) {
          setIsLimitReached(true);
        }
        setLoadError(msg);
        setLoadStatus(LOAD_STATUS.FAILED);
      }
    },
    [assessmentId],
  );

  useEffect(() => {
    const controller = new AbortController();
    initAttempt(controller.signal);
    return () => controller.abort();
  }, [initAttempt]);

  const handleSubmit = useCallback(
    async (isTimeout = false) => {
      if (isSubmitting || !attempt || attempt.status === ATTEMPT_STATUS.EVALUATED) return;
      setIsSubmitting(true);
      setSubmitError(null);
      if (isTimeout) {
        setAutoSubmitted(true);
      }

      // Format answers array
      const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));

      try {
        const response = await submitAssessmentAttempt(attempt.attemptId || attempt.id, {
          answers: formattedAnswers,
        });

        setSubmissionResult(response);
        setAttempt(response.attempt);
      } catch (err) {
        setSubmitError(toMessage(err, 'Failed to submit assessment answers. Please try again.'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, attempt, answers],
  );

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Preparing your assessment session…" rows={4} />
      </PageShell>
    );
  }

  if (isLimitReached) {
    return (
      <PageShell>
        <PageHeader backTo="/assessments" backLabel="Assessments" title="Attempt Limit Reached">
          Maximum attempts limit.
        </PageHeader>
        <Card title="Maximum Attempts (5 of 5) Reached">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              You have already reached the maximum allowed attempts (5) for this assessment.
              Attempt limits ensure evaluation validity and rigor.
            </p>
            <div>
              <Link
                to="/assessments"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-soft"
              >
                Back to Assessments
              </Link>
            </div>
          </div>
        </Card>
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title="Could not load assessment"
          message={loadError}
          onRetry={() => initAttempt()}
        />
      </PageShell>
    );
  }

  const questions = assessment?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  const currentAnswer = currentQuestion ? answers[currentQuestion.id || currentQuestion.questionId] : undefined;

  function handleAnswerChange(val) {
    if (!currentQuestion || isSubmitting) return;
    const qId = currentQuestion.id || currentQuestion.questionId;
    setAnswers((prev) => ({
      ...prev,
      [qId]: val,
    }));
  }

  function handleMultipleChoiceToggle(optionId) {
    if (!currentQuestion || isSubmitting) return;
    const qId = currentQuestion.id || currentQuestion.questionId;
    const prevList = Array.isArray(answers[qId]) ? answers[qId] : [];
    const nextList = prevList.includes(optionId)
      ? prevList.filter((id) => id !== optionId)
      : [...prevList, optionId];
    setAnswers((prev) => ({
      ...prev,
      [qId]: nextList,
    }));
  }



  // If submission completed, show outcome banner / transition
  if (submissionResult) {
    const res = submissionResult.result || submissionResult.attempt || {};
    const isPassed = Boolean(res.passed);
    const score = res.score ?? 0;
    const scorePercent = Math.round(score * 100);
    const passPercent = Math.round((assessment?.passMark ?? res.passMark ?? 0.7) * 100);
    const earnedPoints = res.earnedPoints ?? 0;
    const maxPoints = res.maxPoints ?? 0;
    const breakdown = res.questionBreakdown || [];
    const evidenceId =
      res.evidenceCheckId ||
      submissionResult.attempt?.evidenceCheckId ||
      submissionResult.attempt?.evidenceCheck ||
      null;
    const evidenceStatus =
      submissionResult.evidenceStatus || res.evidenceStatus || (evidenceId ? 'VERIFIED' : null);
    const isEvidenceEligible =
      isPassed &&
      (Boolean(evidenceId) || evidenceStatus === 'VERIFIED' || evidenceStatus === 'VERIFIED_CREATED');

    return (
      <PageShell>
        <PageHeader
          backTo="/assessments"
          backLabel="Assessment Catalog"
          title={`${assessment.title} — Attempt Complete`}
        >
          {assessment.canonicalSkill || assessment.skillName} · {assessment.difficulty}
        </PageHeader>

        <div className="flex flex-col gap-6">
          {/* Primary Score & Outcome Card */}
          <Card>
            <div className="flex flex-col items-center py-6 text-center">
              {autoSubmitted ? (
                <span className="mb-3 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Time Expired · Auto-Submitted
                </span>
              ) : null}

              <span
                className={`inline-flex rounded-full border px-4 py-1 text-sm font-semibold ${
                  isPassed
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {isPassed ? 'Passed' : 'Not Passed'}
              </span>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink">
                Score: {scorePercent}%
              </h2>

              <p className="mt-1 text-xs font-medium text-ink-muted">
                {earnedPoints} / {maxPoints} points earned · Pass mark: {passPercent}%
              </p>

              <p className="mt-3 max-w-md text-sm text-ink-muted">
                {isPassed
                  ? 'Congratulations! You met the passing criteria for this assessment. Verified skill evidence has been registered on your profile.'
                  : 'You did not reach the required passing threshold. Review the core concepts and try again.'}
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to="/assessments"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-soft"
                >
                  Return to Assessments
                </Link>
                <Link
                  to="/career-twin"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text"
                >
                  View CareerTwin
                </Link>
              </div>
            </div>
          </Card>

          {/* Evidence Verification Card */}
          <Card title="Skill Evidence Status">
            {isEvidenceEligible ? (
              <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-800">
                    <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
                    Verified Evidence Generated
                  </span>
                  {evidenceId ? (
                    <span className="font-mono text-[11px] text-green-700">
                      ID: {evidenceId}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-ink-muted">
                  Your performance in this assessment satisfies verified skill requirements for{' '}
                  <strong className="text-ink">{assessment.canonicalSkill || assessment.skillName}</strong>.
                  This evidence is permanently attached to your CareerTwin graph.
                </p>
                <div>
                  <Link
                    to="/career-twin"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                  >
                    View CareerTwin Profile →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border border-orange-200 bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                    <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                    Not Eligible for Verified Evidence
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  Verified skill evidence is only granted for attempts that achieve a score of {passPercent}% or higher.
                  Review the topics below and retake the assessment when ready.
                </p>
              </div>
            )}
          </Card>

          {/* Question Breakdown (Zero Answer Key Leakage!) */}
          {breakdown.length > 0 ? (
            <Card
              title="Question Breakdown"
              description="Review your performance per question. Correct answers and scoring formulas are server-guarded to ensure credential integrity."
            >
              <div className="flex flex-col divide-y divide-orange-100">
                {breakdown.map((item, idx) => (
                  <div key={item.questionId || idx} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">
                        Question {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            item.isCorrect || item.status === QUESTION_RESULT_STATUS.CORRECT
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {item.isCorrect || item.status === QUESTION_RESULT_STATUS.CORRECT
                            ? 'Correct'
                            : 'Incorrect'}
                        </span>
                        <span className="text-xs font-medium text-ink-muted tabular-nums">
                          {item.earnedPoints ?? 0} / {item.maxPoints ?? 1} pts
                        </span>
                      </div>
                    </div>

                    {item.prompt ? (
                      <p className="mt-2 text-xs text-ink-muted break-words">
                        {item.prompt}
                      </p>
                    ) : null}

                    {item.studentAnswer !== undefined && item.studentAnswer !== null && item.studentAnswer !== '' ? (
                      <div className="mt-2 rounded-lg bg-orange-50/50 p-2 text-xs">
                        <span className="font-medium text-ink-muted">Your response: </span>
                        <span className="font-mono text-ink">
                          {Array.isArray(item.studentAnswer)
                            ? item.studentAnswer.join(', ')
                            : String(item.studentAnswer)}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-muted italic">No answer provided.</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/career-twin"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand hover:bg-brand-soft"
            >
              Rebuild CareerTwin with Evidence →
            </Link>
            <Link
              to="/opportunities"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text"
            >
              Check Matched Opportunities →
            </Link>
            <Link
              to="/interviews"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text"
            >
              Practice AI Interview →
            </Link>
            <Link
              to="/assessments"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-brand hover:text-brand-text"
            >
              Back to Catalog
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] !== undefined && answers[k] !== null && answers[k] !== '',
  ).length;

  return (
    <PageShell>
      <PageHeader
        backTo="/assessments"
        backLabel="Assessment Catalog"
        title={assessment.title}
        actions={
          attempt?.startedAt ? (
            <AssessmentTimer
              startedAt={attempt.startedAt}
              timeLimitMinutes={assessment.timeLimitMinutes || assessment.durationMinutes || 20}
              onTimeout={() => handleSubmit(true)}
              isSubmitting={isSubmitting}
            />
          ) : null
        }
      >
        <span className="capitalize">{assessment.difficulty}</span> difficulty ·{' '}
        {assessment.timeLimitMinutes || assessment.durationMinutes || 20} min limit · Pass mark:{' '}
        {Math.round((assessment.passMark || 0.7) * 100)}%
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* Progress & Stepper Bar */}
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between text-xs font-semibold text-ink-muted">
              <span>
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span>
                Answered: {answeredCount} / {totalQuestions}
              </span>
            </div>

            {/* Stepper pills */}
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, idx) => {
                const qId = q.id || q.questionId;
                const isAnswered =
                  answers[qId] !== undefined && answers[qId] !== null && answers[qId] !== '';
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={qId || idx}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowReview(false);
                    }}
                    className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-xs font-semibold transition-colors duration-200 ${
                      isCurrent
                        ? 'bg-brand text-on-brand ring-2 ring-brand/30'
                        : isAnswered
                          ? 'border border-green-200 bg-green-50 text-green-700'
                          : 'border border-orange-200 bg-surface text-ink-muted hover:border-brand'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Question Card */}
        {currentQuestion ? (
          <Card
            title={`Question ${currentIndex + 1}`}
            description={`Type: ${currentQuestion.type?.replace('_', ' ') || 'Single Choice'}`}
            actions={
              <button
                type="button"
                onClick={() => setShowReview(!showReview)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand"
              >
                {showReview ? 'Hide Review' : 'Review Summary'}
              </button>
            }
          >
            <div className="flex flex-col gap-5">
              <p className="text-base font-semibold text-ink break-words">
                {currentQuestion.prompt}
              </p>

              {/* Code Snippet if question has one */}
              {currentQuestion.codeSnippet ? (
                <div className="overflow-x-auto rounded-xl border border-orange-200 bg-canvas p-4 text-xs font-mono text-ink">
                  <pre className="break-all whitespace-pre-wrap">
                    <code>{currentQuestion.codeSnippet}</code>
                  </pre>
                </div>
              ) : null}

              {/* Question Input Formats */}
              <div className="mt-2 flex flex-col gap-3">
                {/* 1. Single Choice */}
                {currentQuestion.type === QUESTION_TYPES.SINGLE_CHOICE && (
                  <div className="flex flex-col gap-2.5">
                    {currentQuestion.options?.map((opt) => {
                      const isSelected = currentAnswer === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition-colors duration-200 ${
                            isSelected
                              ? 'border-brand bg-orange-100/50 font-semibold text-brand-text'
                              : 'border-orange-100 bg-surface text-ink hover:border-orange-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${currentQuestion.id || currentQuestion.questionId}`}
                            value={opt.id}
                            checked={isSelected}
                            onChange={() => handleAnswerChange(opt.id)}
                            className="h-4 w-4 accent-brand"
                          />
                          <span className="break-words">{opt.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 2. Multiple Choice */}
                {currentQuestion.type === QUESTION_TYPES.MULTIPLE_CHOICE && (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs text-ink-muted">Select all that apply:</p>
                    {currentQuestion.options?.map((opt) => {
                      const isSelected =
                        Array.isArray(currentAnswer) && currentAnswer.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition-colors duration-200 ${
                            isSelected
                              ? 'border-brand bg-orange-100/50 font-semibold text-brand-text'
                              : 'border-orange-100 bg-surface text-ink hover:border-orange-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleMultipleChoiceToggle(opt.id)}
                            className="h-4 w-4 accent-brand"
                          />
                          <span className="break-words">{opt.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 3. Boolean (True / False) */}
                {currentQuestion.type === QUESTION_TYPES.BOOLEAN && (
                  <div className="flex gap-4">
                    {[
                      { label: 'True', val: true },
                      { label: 'False', val: false },
                    ].map((item) => {
                      const isSelected = currentAnswer === item.val;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => handleAnswerChange(item.val)}
                          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl border py-3 text-sm font-semibold transition-colors duration-200 ${
                            isSelected
                              ? 'border-brand bg-brand text-on-brand'
                              : 'border-orange-200 bg-surface text-ink hover:border-brand hover:text-brand-text'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 4. Code Output or Short Answer */}
                {(currentQuestion.type === QUESTION_TYPES.CODE_OUTPUT ||
                  currentQuestion.type === QUESTION_TYPES.SHORT_ANSWER) && (
                  <div>
                    <label
                      htmlFor={`input-${currentQuestion.id || currentQuestion.questionId}`}
                      className="block text-xs font-semibold text-ink-muted uppercase"
                    >
                      Your Answer:
                    </label>
                    <textarea
                      id={`input-${currentQuestion.id || currentQuestion.questionId}`}
                      rows={3}
                      value={currentAnswer ?? ''}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Type your answer here…"
                      className="mt-1.5 w-full rounded-xl border border-orange-200 bg-surface p-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <EmptyState>No questions found in this assessment.</EmptyState>
        )}

        {/* Review Summary Panel */}
        {showReview && (
          <Card title="Assessment Overview">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">
                Review your answered questions below before submitting. You can revisit any question
                at any time.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {questions.map((q, idx) => {
                  const qId = q.id || q.questionId;
                  const answered =
                    answers[qId] !== undefined && answers[qId] !== null && answers[qId] !== '';
                  return (
                    <button
                      type="button"
                      key={qId || idx}
                      onClick={() => {
                        setCurrentIndex(idx);
                        setShowReview(false);
                      }}
                      className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-orange-100 bg-orange-50/20 p-3 text-xs text-left transition-colors duration-200 hover:border-brand"
                    >
                      <span className="font-semibold text-ink break-words pr-2">
                        {idx + 1}. {q.prompt?.slice(0, 40)}…
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          answered
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {answered ? 'Answered' : 'Unanswered'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* Submission Error Banner */}
        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-surface p-4 text-sm text-red-800"
          >
            {submitError}
          </div>
        )}

        {/* Navigation & Submit Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            disabled={currentIndex === 0 || isSubmitting}
            onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
            className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {currentIndex < totalQuestions - 1 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setCurrentIndex((idx) => Math.min(totalQuestions - 1, idx + 1))}
                className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            ) : null}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(false)}
              aria-busy={isSubmitting}
              className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Evaluating Submission…' : 'Submit Assessment'}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function AssessmentTimer({ startedAt, timeLimitMinutes, onTimeout, isSubmitting }) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    if (!timeLimitMinutes || !startedAt) return null;
    const startMs = new Date(startedAt).getTime();
    const endMs = startMs + timeLimitMinutes * 60 * 1000;
    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  });

  useEffect(() => {
    if (secondsRemaining === null || isSubmitting) return;

    if (secondsRemaining <= 0) {
      onTimeout();
      return;
    }

    const interval = setInterval(() => {
      const startMs = new Date(startedAt).getTime();
      const endMs = startMs + timeLimitMinutes * 60 * 1000;
      const left = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setSecondsRemaining(left);

      if (left <= 0) {
        clearInterval(interval);
        onTimeout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, timeLimitMinutes, secondsRemaining, isSubmitting, onTimeout]);

  if (secondsRemaining === null) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const isUrgent = secondsRemaining < 120;

  return (
    <div
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold tabular-nums transition-colors duration-200 ${
        isUrgent
          ? 'border-red-300 bg-red-50 text-danger-text animate-pulse'
          : 'border-orange-200 bg-surface text-ink'
      }`}
    >
      <span aria-hidden="true">⏱</span>
      <span>
        Time left: {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      {isUrgent ? <span className="ml-1 text-[10px] font-semibold uppercase">Hurry</span> : null}
    </div>
  );
}
