import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  ATTEMPT_STATUS,
  DIFFICULTY_PRESENTATION,
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  const initAttempt = useCallback(
    async (signal) => {
      setLoadStatus(LOAD_STATUS.LOADING);
      setLoadError(null);
      setSubmitError(null);

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
            result: attemptRes.attempt.result,
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
        setLoadError(toMessage(err, 'Failed to initialize assessment attempt.'));
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

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Preparing your assessment session…" rows={4} />
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

  async function handleSubmit() {
    if (isSubmitting || !attempt) return;
    setIsSubmitting(true);
    setSubmitError(null);

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
  }

  // If submission completed, show outcome banner / transition
  if (submissionResult) {
    const isPassed = submissionResult.result?.passed;
    const score = submissionResult.result?.score ?? 0;
    const scorePercent = Math.round(score * 100);

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
          <Card>
            <div className="flex flex-col items-center py-6 text-center">
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

              <p className="mt-2 max-w-md text-sm text-ink-muted">
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
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors duration-200 ${
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
                    <div
                      key={qId || idx}
                      className="flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50/20 p-2.5 text-xs"
                    >
                      <span className="font-semibold text-ink">
                        {idx + 1}. {q.prompt?.slice(0, 40)}…
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          answered
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {answered ? 'Answered' : 'Unanswered'}
                      </span>
                    </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentIndex === 0 || isSubmitting}
            onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>

          <div className="flex flex-wrap items-center gap-3">
            {currentIndex < totalQuestions - 1 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setCurrentIndex((idx) => Math.min(totalQuestions - 1, idx + 1))}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            ) : null}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              aria-busy={isSubmitting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Evaluating Submission…' : 'Submit Assessment'}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
