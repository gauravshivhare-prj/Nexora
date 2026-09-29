import { Link } from 'react-router-dom';

import { Card } from '../PageShell.jsx';
import {
  INTERVIEW_PASS_MARK,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  resolveInterviewEvidenceStatus,
} from '../../constants/interviewOptions.js';

export function InterviewResults({ session, completionData, onRestartSetup }) {
  const overallScore =
    typeof completionData?.overallScore === 'number'
      ? completionData.overallScore
      : (typeof session?.overallScore === 'number' ? session.overallScore : 0);

  const evidenceStatus = resolveInterviewEvidenceStatus({
    overallScore,
    evaluatorType: session?.evaluatorType,
    eligibleForVerified: completionData?.eligibleForVerified ?? session?.eligibleForVerified,
    status: session?.status,
  });

  const questions = session?.questions || [];
  const evidenceResults = completionData?.evidenceResults || [];
  const percentScore = Math.round(overallScore * 100);

  return (
    <div className="flex flex-col gap-8">
      {/* Headline Performance & Institutional Evidence Card */}
      <Card
        title="Interview Evaluation Results"
        description={`Completed mock interview for ${session?.targetRole || 'Target Role'}`}
      >
        <div className="mt-2 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-orange-100 bg-orange-50/40 p-6 sm:p-8">
            <div>
              <span className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
                Overall Composite Score
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                  {percentScore}%
                </span>
                <span className="text-sm font-semibold text-ink-muted">
                  / {Math.round(INTERVIEW_PASS_MARK * 100)}% Pass Mark
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span className={`inline-block rounded-full border px-4 py-1.5 text-xs font-bold ${evidenceStatus.badgeClass}`}>
                {evidenceStatus.label}
              </span>
              <span className="text-xs text-ink-muted">
                Evaluator: {session?.evaluatorType === 'human' ? 'Institutional Examiner' : 'AI Evaluator (Advisory)'}
              </span>
            </div>
          </div>

          {/* Institutional Evidence Explanation */}
          <div className="rounded-xl border border-orange-200 bg-surface p-4 text-xs text-ink leading-relaxed">
            <p className="font-semibold text-brand-text">Evidence Policy Status:</p>
            <p className="mt-1 text-ink-muted">{evidenceStatus.description}</p>
          </div>

          {/* Per-Skill Evidence Checks */}
          {evidenceResults.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                Skill Competency Breakdown
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {evidenceResults.map((ev, idx) => {
                  const skillScore = Math.round((ev.score ?? overallScore) * 100);
                  const isSkillPass = (ev.score ?? overallScore) >= INTERVIEW_PASS_MARK;

                  return (
                    <div
                      key={ev.skillKey || idx}
                      className="flex items-center justify-between rounded-xl border border-orange-100 bg-surface p-4 shadow-2xs"
                    >
                      <div>
                        <p className="font-bold text-sm text-ink">{ev.skillName || ev.skillKey}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Pass Mark: {Math.round((ev.passMark ?? INTERVIEW_PASS_MARK) * 100)}%
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-ink">{skillScore}%</span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            isSkillPass
                              ? 'border-green-200 bg-green-50 text-green-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {ev.evidenceStrength || (isSkillPass ? 'supported' : 'below pass')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Question-by-Question Review */}
      <Card
        title="Question Review & Feedback"
        description="Review your submitted technical explanations and evaluator critiques across all questions."
      >
        <div className="mt-3 flex flex-col divide-y divide-orange-100">
          {questions.map((q, idx) => {
            const qScore = q.evaluation ? Math.round((q.evaluation.compositeScore ?? 0) * 100) : null;
            const qPassing = qScore !== null && qScore >= 75;

            return (
              <div key={q.id || q.questionId || idx} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-brand-text">
                      Q{idx + 1}
                    </span>
                    <span className="font-semibold text-sm text-ink">{q.targetSkill}</span>
                  </div>
                  {qScore !== null ? (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        qPassing
                          ? 'border-green-200 bg-green-50 text-green-800'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {qScore}% Score
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm font-medium text-ink leading-relaxed">{q.prompt}</p>

                {q.answer?.answerText ? (
                  <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/20 p-3 text-xs text-ink-muted">
                    <p className="font-semibold text-ink">Your Answer:</p>
                    <p className="mt-1 whitespace-pre-wrap">{q.answer.answerText}</p>
                  </div>
                ) : null}

                {q.evaluation ? (
                  <div className="mt-3 rounded-xl border border-orange-200/60 bg-surface p-4 text-xs text-ink">
                    <p className="font-semibold text-brand-text">Evaluator Feedback:</p>
                    <p className="mt-1 leading-relaxed text-ink-muted">{q.evaluation.feedback}</p>

                    {q.evaluation.dimensions ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-orange-100 pt-3 sm:grid-cols-4">
                        {Object.entries(RUBRIC_DIMENSION_WEIGHTS).map(([dimKey]) => (
                          <div key={dimKey} className="text-[11px]">
                            <span className="text-ink-muted">{RUBRIC_DIMENSION_LABELS[dimKey]}: </span>
                            <span className="font-semibold text-ink">
                              {Math.round((q.evaluation.dimensions[dimKey] ?? 0) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Navigation Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onRestartSetup}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-soft"
        >
          Practice Another Interview →
        </button>

        <div className="flex items-center gap-3">
          <Link
            to="/career-twin"
            className="rounded-xl border border-orange-200 bg-surface px-4 py-2.5 text-sm font-semibold text-brand-text transition-colors hover:border-brand hover:bg-orange-50"
          >
            Check CareerTwin Evidence
          </Link>
          <Link
            to="/app"
            className="rounded-xl border border-orange-200 bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
