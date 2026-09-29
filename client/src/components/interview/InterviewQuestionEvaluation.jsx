import { Card } from '../PageShell.jsx';
import {
  INTERVIEW_PASS_MARK,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
} from '../../constants/interviewOptions.js';

export function InterviewQuestionEvaluation({
  question,
  isLastQuestion = false,
  onNextQuestion,
  onCompleteSession,
  isCompleting = false,
  completeError = null,
}) {
  const answer = question?.answer;
  const evaluation = question?.evaluation;
  if (!evaluation || (!evaluation.dimensions && typeof evaluation.compositeScore !== 'number')) return null;

  const score = typeof evaluation.compositeScore === 'number' ? evaluation.compositeScore : 0;
  const isPassing = score >= INTERVIEW_PASS_MARK;

  return (
    <div className="flex flex-col gap-6">
      {/* Evaluated Question Feedback Card */}
      <Card
        title="Evaluator Feedback"
        description="Detailed rubric breakdown and qualitative feedback generated for your submitted response."
      >
        <div className="flex flex-col gap-5">
          {/* Headline Score & Passing Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
            <div>
              <span className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Question Score</span>
              <p className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                {Math.round(score * 100)}%
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                isPassing
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {isPassing ? '✓ Passing Standard (≥75%)' : 'Needs Development (<75%)'}
            </span>
          </div>

          {/* Rubric Dimensions Grid */}
          {evaluation.dimensions ? (
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                Rubric Dimension Breakdown
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(RUBRIC_DIMENSION_WEIGHTS).map(([dimKey, weight]) => {
                  const dimScore = evaluation.dimensions[dimKey] ?? 0;
                  const label = RUBRIC_DIMENSION_LABELS[dimKey] || dimKey;
                  const percent = Math.round(dimScore * 100);

                  return (
                    <div
                      key={dimKey}
                      className="rounded-xl border border-orange-100 bg-surface p-3.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">{label}</span>
                        <span className="font-medium text-ink-muted">
                          {percent}% <span className="text-[10px] text-ink-muted/70">({Math.round(weight * 100)}% wt)</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-orange-100">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            dimScore >= 0.75 ? 'bg-success' : dimScore >= 0.5 ? 'bg-warning' : 'bg-danger'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Qualitative Feedback Text */}
          {evaluation.feedback ? (
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">Feedback Summary</h3>
              <div className="mt-2 rounded-xl border border-orange-200/60 bg-surface p-4 text-sm text-ink leading-relaxed">
                {evaluation.feedback}
              </div>
            </div>
          ) : null}

          {/* Strengths & Growth Areas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.isArray(evaluation.strengths) && evaluation.strengths.length > 0 ? (
              <div className="rounded-xl border border-green-200/60 bg-green-50/40 p-4">
                <h4 className="text-xs font-semibold text-green-900 uppercase">Key Strengths</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-green-800">
                  {evaluation.strengths.map((str, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="shrink-0 text-green-600">✓</span>
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {Array.isArray(evaluation.growthAreas) && evaluation.growthAreas.length > 0 ? (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-4">
                <h4 className="text-xs font-semibold text-amber-900 uppercase">Areas for Growth</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
                  {evaluation.growthAreas.map((gro, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="shrink-0 text-amber-600">•</span>
                      <span>{gro}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Grounded Skills */}
          {Array.isArray(evaluation.groundedSkills) && evaluation.groundedSkills.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold tracking-wider text-ink uppercase">Demonstrated Skills</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {evaluation.groundedSkills.map((sk) => (
                  <span
                    key={sk}
                    className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-brand-text"
                  >
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Submitted Answer Review (Collapsible / Preview) */}
          {answer?.answerText ? (
            <details className="mt-2 rounded-xl border border-orange-100 bg-orange-50/20 p-3.5 text-xs text-ink-muted">
              <summary className="cursor-pointer font-semibold text-ink">
                Review your submitted answer ({answer.answerText.length} characters)
              </summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink leading-relaxed">
                {answer.answerText}
              </p>
            </details>
          ) : null}

          {/* Complete Error Notice */}
          {completeError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-danger-text">
              <p className="font-semibold">{completeError.title || 'Unable to complete interview'}</p>
              <p className="mt-1">{completeError.message}</p>
              {completeError.userAction ? <p className="mt-1 font-medium">{completeError.userAction}</p> : null}
            </div>
          ) : null}

          {/* Next Steps Buttons */}
          <div className="mt-3 flex items-center justify-end gap-3 pt-2">
            {isLastQuestion ? (
              <button
                type="button"
                onClick={onCompleteSession}
                disabled={isCompleting}
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-soft disabled:opacity-50"
              >
                {isCompleting ? 'Finalizing Evaluation…' : 'Complete Interview & View Results →'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNextQuestion}
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-soft"
              >
                Next Question →
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
