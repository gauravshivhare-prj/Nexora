import { useState } from 'react';

import { Card } from '../PageShell.jsx';
import { FormTextarea } from '../FormTextarea.jsx';
import { InterviewQuestionEvaluation } from './InterviewQuestionEvaluation.jsx';
import {
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  INTERVIEW_QUESTION_TYPE_LABELS,
} from '../../constants/interviewOptions.js';

export function InterviewActiveFlow({
  session,
  currentQuestionIndex,
  onAnswerSubmit,
  isSubmittingAnswer = false,
  submitError = null,
  onRetrySubmit,
  onNextQuestion,
  onCompleteSession,
  isCompleting = false,
  completeError = null,
  onAbandonSession,
  isAbandoning = false,
}) {
  const [answerText, setAnswerText] = useState('');
  const [showCriteria, setShowCriteria] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [localValidation, setLocalValidation] = useState(null);

  const questions = session?.questions || [];
  const currentQuestion = questions[currentQuestionIndex] || questions[0];
  const totalQuestions = questions.length || session?.questionCount || 1;
  const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;

  const hasEvaluation = Boolean(
    currentQuestion?.evaluation &&
      (currentQuestion.evaluation.dimensions || typeof currentQuestion.evaluation.compositeScore === 'number'),
  );
  const diffPresentation =
    INTERVIEW_DIFFICULTY_PRESENTATION[session?.difficulty] ||
    INTERVIEW_DIFFICULTY_PRESENTATION.intermediate;
  const typeLabel =
    INTERVIEW_QUESTION_TYPE_LABELS[currentQuestion?.type] || 'Technical Question';

  function handleSubmitAnswer(e) {
    e.preventDefault();
    const trimmed = answerText.trim();
    if (trimmed.length < INTERVIEW_LIMITS.studentAnswer.min) {
      setLocalValidation(
        `Please provide a more detailed response (minimum ${INTERVIEW_LIMITS.studentAnswer.min} characters). Current: ${trimmed.length}.`,
      );
      return;
    }
    if (trimmed.length > INTERVIEW_LIMITS.studentAnswer.max) {
      setLocalValidation(
        `Your response exceeds the limit of ${INTERVIEW_LIMITS.studentAnswer.max} characters. Current: ${trimmed.length}.`,
      );
      return;
    }

    setLocalValidation(null);
    onAnswerSubmit(currentQuestion.id || currentQuestion.questionId, {
      answerText: trimmed,
      durationSeconds: 45,
    });
  }

  function handleRetry() {
    if (onRetrySubmit) {
      onRetrySubmit();
    } else {
      const trimmed = answerText.trim();
      onAnswerSubmit(currentQuestion.id || currentQuestion.questionId, {
        answerText: trimmed,
        durationSeconds: 45,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Session Progress Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-bold text-brand-text uppercase">
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </span>
          <span className="text-sm font-semibold text-ink">{session?.targetRole}</span>
          <span className={`hidden rounded-md border px-2 py-0.5 text-xs font-semibold sm:inline-block ${diffPresentation.badgeClass}`}>
            {diffPresentation.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAbandonConfirm(true)}
            disabled={isAbandoning || isSubmittingAnswer || isCompleting}
            className="text-xs font-medium text-ink-muted transition-colors hover:text-danger-text"
          >
            Abandon Practice
          </button>
        </div>
      </div>

      {/* Abandon Confirmation Prompt */}
      {showAbandonConfirm ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <p className="text-sm font-semibold text-danger-text">Abandon this interview session?</p>
          <p className="mt-1 text-xs text-ink-muted leading-relaxed">
            Your answered questions will be saved, but the session will be marked as abandoned and no final verified or advisory evidence check will be granted.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onAbandonSession}
              disabled={isAbandoning}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger/90"
            >
              {isAbandoning ? 'Abandoning…' : 'Yes, abandon session'}
            </button>
            <button
              type="button"
              onClick={() => setShowAbandonConfirm(false)}
              className="rounded-lg border border-orange-200 bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Prominent Question Card */}
      <Card
        title={`Question ${currentQuestion?.order || currentQuestionIndex + 1}`}
        description={`Evaluates competence in ${currentQuestion?.targetSkill || 'Target Skill'}`}
        actions={
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-brand-text">
            {typeLabel}
          </span>
        }
      >
        <div className="mt-2 flex flex-col gap-4">
          {/* Question Prompt */}
          <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-5 text-base font-medium text-ink leading-relaxed">
            {currentQuestion?.prompt}
          </div>

          {/* Rubric Criteria Checklist Disclosure */}
          {Array.isArray(currentQuestion?.rubricCriteria) && currentQuestion.rubricCriteria.length > 0 ? (
            <div className="rounded-xl border border-orange-100 bg-surface p-4">
              <button
                type="button"
                onClick={() => setShowCriteria((c) => !c)}
                className="flex w-full items-center justify-between text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                <span>What the evaluator looks for ({currentQuestion.rubricCriteria.length} criteria)</span>
                <span>{showCriteria ? '▲ Hide' : '▼ View checklist'}</span>
              </button>

              {showCriteria ? (
                <ul className="mt-3 space-y-1.5 border-t border-orange-100 pt-3 text-xs text-ink-muted">
                  {currentQuestion.rubricCriteria.map((criterion, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="shrink-0 text-brand-text">•</span>
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {/* If Question Already Evaluated, show evaluation and next step buttons */}
      {hasEvaluation ? (
        <InterviewQuestionEvaluation
          question={currentQuestion}
          isLastQuestion={isLastQuestion}
          onNextQuestion={onNextQuestion}
          onCompleteSession={onCompleteSession}
          isCompleting={isCompleting}
          completeError={completeError}
        />
      ) : (
        /* Answer Submission Area */
        <Card
          title="Your Response"
          description="Type your technical response in full detail. You may describe architecture, trade-offs, concurrency models, and standard patterns."
        >
          <form onSubmit={handleSubmitAnswer} className="mt-3 flex flex-col gap-4">
            {localValidation ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {localValidation}
              </div>
            ) : null}

            {/* Error with Retry */}
            {submitError ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-danger-text">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{submitError.title || 'Submission Error'}</p>
                    <p className="mt-1 leading-relaxed">{submitError.message}</p>
                    {submitError.userAction ? (
                      <p className="mt-1 font-medium">{submitError.userAction}</p>
                    ) : null}
                  </div>
                  {submitError.retryable !== false ? (
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={isSubmittingAnswer}
                      className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand transition-colors hover:bg-brand-soft"
                    >
                      {isSubmittingAnswer ? 'Retrying…' : 'Retry Submission'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <FormTextarea
              label="Candidate Answer"
              value={answerText}
              onChange={(val) => {
                setAnswerText(val);
                if (localValidation) setLocalValidation(null);
              }}
              rows={8}
              maxLength={INTERVIEW_LIMITS.studentAnswer.max}
              placeholder="Structure your technical reasoning clearly..."
              disabled={isSubmittingAnswer}
              required
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-ink-muted">
                Min {INTERVIEW_LIMITS.studentAnswer.min} characters • Rubric evaluated across 4 dimensions
              </span>

              <button
                type="submit"
                disabled={isSubmittingAnswer || answerText.trim().length < INTERVIEW_LIMITS.studentAnswer.min}
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingAnswer ? 'Evaluating Answer…' : 'Submit Answer for Evaluation →'}
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
