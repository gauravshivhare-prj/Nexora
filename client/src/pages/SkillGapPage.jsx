import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import { GapStatusBadge, GapStatusLegend, GapSummary } from '../components/careers/GapStatus.jsx';
import { ApiRequestError } from '../services/apiClient.js';
import { GAP_STATUS, fetchSkillGap } from '../services/career.service.js';
import { formatDateTime } from '../utils/dateFormat.js';
import { toMessage } from '../utils/errorMessage.js';

/**
 * /careers/:roleId/skill-gap — every skill a role names, and where the
 * student stands on each.
 *
 * The page is ordered exactly as the backend returned it. That order is the
 * analysis: required-and-missing first because it stops you being
 * considered, then required-but-only-claimed because it is the gap most
 * likely to surprise you. Re-sorting here would quietly replace the
 * backend's judgement about what to do next with a display preference.
 */

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function SkillGapPage() {
  const { roleId } = useParams();

  const [data, setData] = useState(null);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);
  const [needsTwin, setNeedsTwin] = useState(false);
  const [isUnknownRole, setIsUnknownRole] = useState(false);

  const load = useCallback(
    async (signal) => {
      setLoadStatus(LOAD_STATUS.LOADING);
      setLoadError(null);
      setNeedsTwin(false);
      setIsUnknownRole(false);

      try {
        const result = await fetchSkillGap(roleId, { signal });
        if (signal?.aborted) return;

        setData(result);
        setLoadStatus(LOAD_STATUS.READY);
      } catch (error) {
        if (signal?.aborted) return;

        if (error instanceof ApiRequestError) {
          if (error.errorCode === 'CAREER_TWIN_NOT_FOUND') setNeedsTwin(true);
          if (error.errorCode === 'CAREER_ROLE_NOT_FOUND') setIsUnknownRole(true);
        }

        setLoadError(toMessage(error, 'This skill gap could not be worked out.'));
        setLoadStatus(LOAD_STATUS.FAILED);
      }
    },
    [roleId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState label="Working out your skill gap…" rows={3} />
      </PageShell>
    );
  }

  // Both of these are states to resolve, not failures to retry — nothing
  // changes until the student builds a twin or picks a real role — so each
  // offers the route that would fix it rather than a "try again".
  if (needsTwin) {
    return (
      <PageShell>
        <PageHeader backTo="/careers" backLabel="All roles" title="Skill gap">
          Measured against your CareerTwin.
        </PageHeader>

        <Card title="Build your CareerTwin first">
          <div className="flex flex-col gap-4">
            <EmptyState>{loadError}</EmptyState>
            <div>
              <Link
                to="/career-twin"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft"
              >
                Go to CareerTwin
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
          title={isUnknownRole ? 'No such role' : 'This skill gap could not be worked out'}
          message={loadError}
          onRetry={isUnknownRole ? undefined : () => load()}
        />
      </PageShell>
    );
  }

  const { gap, basedOn, method } = data;
  const actionable = gap.skills.filter((skill) => skill.status !== GAP_STATUS.VERIFIED);

  return (
    <PageShell>
      <PageHeader backTo="/careers" backLabel="All roles" title={`${gap.roleTitle} — skill gap`}>
        {basedOn?.careerTwinGeneratedAt
          ? `Measured against the CareerTwin built ${formatDateTime(basedOn.careerTwinGeneratedAt)}.`
          : 'Measured against your CareerTwin.'}
      </PageHeader>

      <div className="flex flex-col gap-5">
        <Card
          title="Where you stand"
          description="Counts only. Nexora does not reduce this to a readiness percentage — which part of it is merely claimed is the point."
        >
          <GapSummary summary={gap.summary} />
        </Card>

        <Card
          title={`Skills this role asks for (${gap.skills.length})`}
          description="In the order worth working through: what blocks you first comes first."
        >
          <div className="flex flex-col gap-4">
            <GapStatusLegend statusMeanings={method?.statusMeanings} />

            {gap.skills.length === 0 ? (
              <EmptyState>This role names no skills.</EmptyState>
            ) : (
              <ol className="flex flex-col gap-3">
                {gap.skills.map((skill) => (
                  <SkillGapRow key={`${skill.importance}-${skill.key}`} skill={skill} />
                ))}
              </ol>
            )}
          </div>
        </Card>

        {actionable.length === 0 && gap.skills.length > 0 ? (
          <Card title="Nothing outstanding">
            <EmptyState>
              Every skill this role names is already verified. There is nothing here to work on.
            </EmptyState>
          </Card>
        ) : null}

        {gap.additionalSkills?.length > 0 ? (
          <Card
            title="Skills this role does not ask for"
            description="Context, not a criticism. These may point at a role that fits you better."
          >
            <ul className="flex flex-wrap gap-2">
              {gap.additionalSkills.map((skill) => (
                <li
                  key={skill.name}
                  className="flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 py-1 pr-1 pl-3 text-sm text-ink"
                >
                  <span className="break-words">{skill.name}</span>
                  <GapStatusBadge status={skill.strength} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link
            to={`/careers/${gap.roleId}/roadmap`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft"
          >
            Turn this into a roadmap
          </Link>
          <Link
            to="/assessments"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
          >
            Take skill assessments
          </Link>
          <Link
            to="/careers"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
          >
            Back to roles
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * One skill: its status, the reason for it, and what would change it.
 *
 * The reason is the server's, built from the evidence rather than written
 * per status, so the sentence cannot drift from what actually justified it.
 * The suggestions are the server's too, including whether each is available
 * — an assessment suggestion is shown as not yet possible rather than
 * quietly dropped, because the route to "verified" is worth knowing about.
 */
function SkillGapRow({ skill }) {
  return (
    <li className="animate-rise rounded-xl border border-orange-100 bg-orange-50/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold text-ink break-words">{skill.name}</span>
          <GapStatusBadge status={skill.status} />
          <span className="rounded-full border border-orange-200 px-2 py-0.5 text-xs text-ink-muted">
            {skill.importance}
          </span>
        </div>
      </div>

      {skill.yourSkill && skill.yourSkill !== skill.name ? (
        <p className="mt-1 text-xs text-ink-muted break-words">You call it “{skill.yourSkill}”.</p>
      ) : null}

      <p className="mt-2 text-sm text-ink break-words">{skill.reason}</p>

      {skill.suggestedEvidence?.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            What would change this
          </p>

          <ul className="mt-1.5 flex flex-col gap-1.5">
            {skill.suggestedEvidence.map((suggestion, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={suggestion.available ? 'text-ink break-words' : 'text-ink-muted break-words'}>
                  {suggestion.action}
                </span>

                <span className="text-xs text-ink-muted">
                  → {suggestion.wouldReach}
                  {suggestion.available ? '' : ' · not available yet'}
                </span>

                {suggestion.note ? (
                  <span className="basis-full text-xs text-ink-muted break-words">{suggestion.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
