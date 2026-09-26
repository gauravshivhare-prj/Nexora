import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import { GapStatusBadge } from '../components/careers/GapStatus.jsx';
import { ApiRequestError } from '../services/apiClient.js';
import { fetchRoadmap } from '../services/career.service.js';
import { formatDateTime } from '../utils/dateFormat.js';
import { toMessage } from '../utils/errorMessage.js';

/**
 * /careers/:roleId/roadmap — an ordered plan towards one role.
 *
 * **There is no "mark as done" control on this page, and adding one would be
 * a bug.** Completion here is evidence-driven: an item closes because the
 * student added a project that uses the skill, which moves the skill to
 * `supported`, which closes the gap, which removes the item. A local
 * checkbox would let the plan disagree with the evidence — exactly what the
 * backend's design refuses to allow by storing no completion state at all.
 *
 * So each item shows what would actually close it, and links to the place
 * that work gets recorded.
 */

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

const PRIORITY_PRESENTATION = {
  critical: { label: 'Critical', className: 'border-red-200 bg-red-50 text-danger-text' },
  high: { label: 'High', className: 'border-orange-300 bg-orange-100 text-warning-text' },
  medium: { label: 'Medium', className: 'border-orange-200 bg-orange-50 text-brand-text' },
  low: { label: 'Low', className: 'border-orange-100 bg-orange-50/60 text-ink-muted' },
};

const EFFORT_LABELS = {
  quick: 'Quick — add something you already have',
  moderate: 'Moderate — learn enough to build with it',
  substantial: 'Substantial — this takes real time',
};

export function RoadmapPage() {
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
        const result = await fetchRoadmap(roleId, { signal });
        if (signal?.aborted) return;

        setData(result);
        setLoadStatus(LOAD_STATUS.READY);
      } catch (error) {
        if (signal?.aborted) return;

        if (error instanceof ApiRequestError) {
          if (error.errorCode === 'CAREER_TWIN_NOT_FOUND') setNeedsTwin(true);
          if (error.errorCode === 'CAREER_ROLE_NOT_FOUND') setIsUnknownRole(true);
        }

        setLoadError(toMessage(error, 'This roadmap could not be built.'));
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
        <LoadingState label="Building your roadmap…" rows={3} />
      </PageShell>
    );
  }

  if (needsTwin) {
    return (
      <PageShell>
        <PageHeader backTo="/careers" backLabel="All roles" title="Roadmap">
          Built from your skill gap, which is measured against your CareerTwin.
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
          title={isUnknownRole ? 'No such role' : 'This roadmap could not be built'}
          message={loadError}
          onRetry={isUnknownRole ? undefined : () => load()}
        />
      </PageShell>
    );
  }

  const { roadmap, basedOn } = data;
  const { summary } = roadmap;
  const isCapped = summary.actionableGaps > summary.totalItems;

  return (
    <PageShell>
      <PageHeader
        backTo={`/careers/${roadmap.goal.roleId}/skill-gap`}
        backLabel="Skill gap"
        title={`${roadmap.goal.roleTitle} — roadmap`}
      >
        {basedOn?.careerTwinGeneratedAt
          ? `Built from the skill gap measured against your CareerTwin of ${formatDateTime(basedOn.careerTwinGeneratedAt)}.`
          : 'Built from your skill gap.'}
      </PageHeader>

      <div className="flex flex-col gap-5">
        <Card title="The goal">
          <p className="text-sm text-ink">{roadmap.goal.description}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Steps', summary.totalItems],
              ['Actionable gaps', summary.actionableGaps],
              ['Critical', summary.critical],
              ['High priority', summary.high],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {isCapped ? (
            // The backend reports the pre-cap count precisely so a capped
            // plan is not mistaken for the whole of it.
            <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-2.5 text-xs text-ink">
              Showing the first {summary.totalItems} of {summary.actionableGaps} gaps worth acting
              on. The rest appear as you close these.
            </p>
          ) : null}
        </Card>

        <Card
          title="How this plan works"
          description="Worth reading once — it is why there is no tick-box on this page."
        >
          <p className="text-sm text-ink">
            Nothing here is marked done by hand. A step closes when Nexora can see the evidence for
            it: add a project that uses the skill, and the skill moves from claimed to supported,
            the gap closes, and the step disappears from this plan on its own.
          </p>

          <p className="mt-2 text-sm text-ink-muted">
            That is deliberate. A checkbox you could tick without doing the work would let this
            plan disagree with what you can actually demonstrate, which is the one thing Nexora is
            built to keep honest.
          </p>

          <Method method={roadmap.method} />
        </Card>

        <Card
          title={`Steps (${roadmap.items.length})`}
          description="In priority order: what blocks you from being considered comes first."
        >
          {roadmap.items.length === 0 ? (
            <EmptyState>
              Nothing outstanding for this role — you already meet what it asks for. If that looks
              wrong, check your skill gap to see what Nexora can and cannot see.
            </EmptyState>
          ) : (
            <ol className="flex flex-col gap-4">
              {roadmap.items.map((item, index) => (
                <RoadmapStep key={item.id} item={item} position={index + 1} />
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/profile"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft"
          >
            Add a project to your profile
          </Link>
          <Link
            to={`/careers/${roadmap.goal.roleId}/skill-gap`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-200 px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
          >
            Back to the skill gap
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

/** One ordered step. Everything in it comes from the response. */
function RoadmapStep({ item, position }) {
  const priority = PRIORITY_PRESENTATION[item.priority] ?? PRIORITY_PRESENTATION.low;

  return (
    <li className="animate-rise rounded-xl border border-orange-100 bg-orange-50/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            aria-hidden="true"
            className="text-sm font-bold text-ink-muted tabular-nums"
          >
            {position}.
          </span>
          <h3 className="text-base font-semibold text-ink break-words">{item.title}</h3>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${priority.className}`}
          >
            {priority.label}
          </span>
          <GapStatusBadge status={item.completion.status} />
        </div>
      </div>

      <p className="mt-2 text-sm text-ink break-words">{item.objective}</p>
      {item.description ? (
        <p className="mt-1 text-sm text-ink-muted break-words">{item.description}</p>
      ) : null}

      <dl className="mt-3 flex flex-col gap-1 text-xs">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-ink-muted">Effort</dt>
          <dd className="text-ink">{EFFORT_LABELS[item.estimatedEffort] ?? item.estimatedEffort}</dd>
        </div>

        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-ink-muted">Why</dt>
          <dd className="text-ink">
            {item.because.roleTitle} lists it as {item.because.importance}, and Nexora currently
            records it as {item.because.currentStatus}.
          </dd>
        </div>

        {item.prerequisites?.length > 0 ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-ink-muted">Do first</dt>
            <dd className="text-ink break-words">
              {item.prerequisites.map((prerequisite) => prerequisite.name).join(', ')}
            </dd>
          </div>
        ) : null}
      </dl>

      {/*
        The completion rule, per item, in the server's own words. This is
        what stands in for a tick-box: it says precisely what would close the
        step, and it is a claim about evidence rather than about intent.
      */}
      <div className="mt-3 rounded-lg border border-orange-200 bg-surface p-3">
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Closes when
        </p>
        <p className="mt-1 text-sm text-ink break-words">{item.completion.completesWhen}</p>

        {item.verification ? (
          <div className="mt-2 text-sm">
            <p className="text-ink break-words">{item.verification.description}</p>
            <p className="mt-0.5 text-xs text-ink-muted break-words">
              Reaches “{item.verification.reaches}”.
              {item.verification.alternative ? (
                <>
                  {' '}
                  Alternatively: {item.verification.alternative.description} (reaches “
                  {item.verification.alternative.reaches}”
                  {item.verification.alternative.available ? '' : ', not available yet'}).
                </>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      <Resources resources={item.resources} />
    </li>
  );
}

/**
 * Resource references.
 *
 * Every `url` is null and every `verified` is false, by the backend's
 * design: it has no verified course catalogue and guessing a documentation
 * URL is how a student ends up at a parked domain. So these render as
 * search hints, never as links, and say plainly that they are not curated.
 */
function Resources({ resources }) {
  if (!resources?.length) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Where to look
      </p>

      <ul className="mt-1.5 flex flex-col gap-1.5">
        {resources.map((resource, index) => (
          <li key={index} className="text-sm">
            <span className="text-ink break-words">{resource.title}</span>
            <span className="ml-1.5 text-xs text-ink-muted">({resource.type})</span>

            {resource.searchHint ? (
              <span className="mt-0.5 block text-xs text-ink-muted">
                Try searching: <code className="text-ink break-all">{resource.searchHint}</code>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-1.5 text-xs text-ink-muted">
        Search suggestions, not recommendations — Nexora has no verified catalogue of courses and
        does not link to ones it has not checked.
      </p>
    </div>
  );
}

function Method({ method }) {
  if (!method) return null;

  return (
    <dl className="mt-4 flex flex-col gap-1.5 border-t border-orange-100 pt-3 text-xs">
      <div className="flex flex-wrap gap-x-2">
        <dt className="font-semibold text-ink-muted">Built by</dt>
        <dd className="text-ink">
          {method.deterministic ? 'A deterministic rule' : 'A non-deterministic process'} from your{' '}
          {method.generatedFrom ?? 'skill gap'}
          {method.usesAi ? ', with AI' : ', with no AI involved'}.
        </dd>
      </div>

      {method.resourceNote ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-ink-muted">Resources</dt>
          <dd className="text-ink">{method.resourceNote}</dd>
        </div>
      ) : null}
    </dl>
  );
}
