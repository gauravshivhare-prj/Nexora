import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageShell } from '../components/PageShell.jsx';
import { ReadinessVisualization } from '../components/ReadinessVisualization.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { SECTION_STATUS, fetchDashboard } from '../services/dashboard.service.js';
import { formatDateTime } from '../utils/dateFormat.js';
import { toMessage } from '../utils/errorMessage.js';

/**
 * /app — the signed-in dashboard.
 *
 * Every figure here is one the backend computed, shown next to a link to the
 * page that explains it. The dashboard's job is orientation: what is set up,
 * what is out of date, and what is worth doing next. It deliberately does
 * not compute a readiness score of its own — there is no endpoint for one,
 * and inventing a headline number by combining these sections would give
 * the dashboard an opinion that could contradict every page it links to.
 *
 * Loaded from GET /api/summary in one request. That replaced a client-side
 * composition of five endpoints, which did give each section its own
 * failure state — the trade is deliberate: six round trips, two of them
 * serialised behind a third, cost every student on every visit, whereas
 * partial failure is rare and the page-level retry below covers it.
 */

export function DashboardPage() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (signal) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const result = await fetchDashboard({ signal });
      if (signal?.aborted) return;

      setData(result);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(toMessage(error, 'Your dashboard could not be loaded.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (isLoading) {
    return (
      <PageShell width="max-w-5xl">
        <LoadingState label="Loading your dashboard…" rows={3} />
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell width="max-w-5xl">
        <ErrorState
          title="Your dashboard could not be loaded"
          message={loadError}
          onRetry={() => load()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="max-w-5xl">
      <header className="animate-rise mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
          Welcome, {user.name}
        </h1>
        {/*
          The backend decides this. Working it out here as well would be a
          second implementation of an ordering the pipeline already imposes.
        */}
        <p className="mt-2 text-sm text-ink-muted">{data.nextStep?.message}</p>
      </header>

      <div className="flex flex-col gap-5">
        <CareerTwinTile section={data.careerTwin} onRetry={() => load()} />

        <div className="grid gap-5 lg:grid-cols-2">
          <ProfileTile section={data.profile} onRetry={() => load()} />
          <ResumeTile section={data.resumes} onRetry={() => load()} />
        </div>

        <MatchesTile section={data.matches} onRetry={() => load()} />

        <div className="grid gap-5 lg:grid-cols-2">
          <SkillGapTile
            section={data.skillGap}
            role={data.focusRole.value}
            onRetry={() => load()}
          />
          <RoadmapTile
            section={data.roadmap}
            role={data.focusRole.value}
            onRetry={() => load()}
          />
        </div>

        <ReadinessTile
          section={data.readiness}
          role={data.focusRole.value}
          onRetry={() => load()}
        />
      </div>
    </PageShell>
  );
}

/**
 * Shared frame for a tile, so failure and emptiness look the same everywhere.
 *
 * A failed section keeps its own retry: re-running the whole dashboard for
 * one broken tile is heavier than it needs to be, but it is honest about
 * what it does, and per-section refetching would be a cache this page does
 * not otherwise need.
 */
function Tile({ section, title, description, empty, emptyAction, onRetry, children }) {
  if (section.status === SECTION_STATUS.FAILED) {
    return (
      <Card title={title}>
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-danger-text">
            {toMessage(section.error, 'This section could not be loaded.')}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-lg border border-red-300 px-3 py-2.5 text-xs font-semibold text-danger-text transition-colors duration-200 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </Card>
    );
  }

  if (section.status === SECTION_STATUS.EMPTY) {
    return (
      <Card title={title} description={description}>
        <div className="flex flex-col gap-3">
          <EmptyState>{empty}</EmptyState>
          {emptyAction}
        </div>
      </Card>
    );
  }

  return (
    <Card title={title} description={description}>
      {children}
    </Card>
  );
}

function Action({ to, children, primary = false }) {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft'
          : 'inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text'
      }
    >
      {children}
    </Link>
  );
}

function Stats({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
          <dt className="text-xs text-ink-muted">{label}</dt>
          <dd className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileTile({ section, onRetry }) {
  return (
    <Tile
      section={section}
      title="Profile"
      empty="Nothing saved yet."
      emptyAction={
        <div>
          <Action to="/profile" primary>
            Fill in your profile
          </Action>
        </div>
      }
      onRetry={onRetry}
    >
      {section.value ? (
        <div className="flex flex-col gap-4">
          <Stats
            items={[
              ['Skills', section.value.skillCount],
              ['Projects', section.value.projectCount],
              ['Certifications', section.value.certificationCount],
            ]}
          />
          <div>
            <Action to="/profile">Edit your profile</Action>
          </div>
        </div>
      ) : null}
    </Tile>
  );
}

function ResumeTile({ section, onRetry }) {
  const counts = section.value ?? { total: 0, analysed: 0 };

  return (
    <Tile
      section={section}
      title="Resumes"
      empty="No resumes saved yet."
      emptyAction={
        <div>
          <Action to="/resume">Add a resume</Action>
        </div>
      }
      onRetry={onRetry}
    >
      <div className="flex flex-col gap-4">
        <Stats
          items={[
            ['Saved', counts.total],
            ['Analysed', counts.analysed],
          ]}
        />
        <div>
          <Action to="/resume">Manage resumes</Action>
        </div>
      </div>
    </Tile>
  );
}

function CareerTwinTile({ section, onRetry }) {
  const twin = section.value;

  return (
    <Tile
      section={section}
      title="CareerTwin"
      description="What Nexora has actually observed about you. Everything below is measured against it."
      empty="No CareerTwin built yet. Matches, gaps and your roadmap all depend on one."
      emptyAction={
        <div>
          <Action to="/career-twin" primary>
            Build your CareerTwin
          </Action>
        </div>
      }
      onRetry={onRetry}
    >
      {twin ? (
        <div className="flex flex-col gap-4">
          {twin.isStale ? (
            <div
              role="status"
              className="rounded-xl border border-orange-300 bg-orange-100/70 px-4 py-3"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-warning-text">
                <span aria-hidden="true">!</span>
                Out of date
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Your data has changed since this was built {formatDateTime(twin.generatedAt)}.
              </p>
            </div>
          ) : null}

          <Stats
            items={[
              ['Skills', twin.indicators.totalSkills],
              ['Claimed only', twin.indicators.claimedOnly],
              ['Supported', twin.indicators.supported],
              ['Verified', twin.indicators.verified],
            ]}
          />

          <div className="flex flex-wrap gap-2">
            <Action to="/career-twin" primary={twin.isStale}>
              {twin.isStale ? 'Regenerate it' : 'See the evidence'}
            </Action>
          </div>
        </div>
      ) : null}
    </Tile>
  );
}

function MatchesTile({ section, onRetry }) {
  const matches = section.value?.matches ?? [];

  return (
    <Tile
      section={section}
      title="Top career matches"
      description="Scored from your CareerTwin against a curated catalogue. No AI involved."
      empty="Nothing matched strongly enough to recommend yet."
      emptyAction={
        <div>
          <Action to="/careers">Browse all roles</Action>
        </div>
      }
      onRetry={onRetry}
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li
              key={match.roleId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-100 bg-orange-50/30 p-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{match.title}</p>
                <p className="text-xs text-ink-muted">{match.band}</p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-brand-text">
                  {match.score}
                  <span className="text-xs font-normal text-ink-muted">/100</span>
                </span>
                <Link
                  to={`/careers/${match.roleId}/skill-gap`}
                  className="rounded-lg border border-orange-200 px-3 py-2.5 text-xs font-semibold text-brand-text transition-colors duration-200 hover:border-brand hover:bg-orange-50"
                >
                  Gap
                </Link>
              </div>
            </li>
          ))}
        </ul>

        <div>
          <Action to="/careers">See all matches</Action>
        </div>
      </div>
    </Tile>
  );
}

function SkillGapTile({ section, role, onRetry }) {
  const summary = section.value?.summary;

  return (
    <Tile
      section={section}
      title="Skill gap"
      description={role ? `Against ${role.title}, your closest match.` : undefined}
      empty="Build a CareerTwin and match a role to see where you stand."
      emptyAction={
        <div>
          <Action to="/careers">Browse roles</Action>
        </div>
      }
      onRetry={onRetry}
    >
      {summary ? (
        <div className="flex flex-col gap-4">
          <Stats
            items={[
              ['Required missing', summary.required.missing],
              ['Required claimed', summary.required.claimed],
              ['Required supported', summary.required.supported],
              ['Preferred missing', summary.preferred.missing],
            ]}
          />

          <div>
            <Action to={`/careers/${role.roleId}/skill-gap`}>See the full gap</Action>
          </div>
        </div>
      ) : null}
    </Tile>
  );
}

function ReadinessTile({ section, role, onRetry }) {
  const readiness = section.value;

  return (
    <Tile
      section={section}
      title="Career readiness"
      description={role ? `Evidence for ${role.title}.` : undefined}
      empty="Build a CareerTwin and match a role to see evidence-based readiness."
      emptyAction={
        <div>
          <Action to="/careers">Browse roles</Action>
        </div>
      }
      onRetry={onRetry}
    >
      {readiness ? (
        <ReadinessVisualization readiness={readiness} role={role} />
      ) : null}
    </Tile>
  );
}

/**
 * Roadmap progress.
 *
 * Reported as work outstanding rather than as a percentage complete. There
 * is no completed count to divide by: a step closes when the evidence for
 * it appears, at which point it leaves the plan entirely, so "3 of 10 done"
 * is a number nothing in the system can produce honestly.
 */
function RoadmapTile({ section, role, onRetry }) {
  const summary = section.value?.summary;

  return (
    <Tile
      section={section}
      title="Roadmap"
      description={role ? `The plan towards ${role.title}.` : undefined}
      empty="A roadmap appears once you have a CareerTwin and a matched role."
      emptyAction={
        <div>
          <Action to="/careers">Browse roles</Action>
        </div>
      }
      onRetry={onRetry}
    >
      {summary ? (
        <div className="flex flex-col gap-4">
          {summary.totalItems === 0 ? (
            <EmptyState>
              Nothing outstanding for {role?.title} — you already meet what it asks for.
            </EmptyState>
          ) : (
            <Stats
              items={[
                ['Steps shown', summary.totalItems],
                ['Gaps to close', summary.actionableGaps],
                ['Critical', summary.critical],
                ['High', summary.high],
              ]}
            />
          )}

          <p className="text-xs text-ink-muted">
            Steps close when the evidence for them appears — there is nothing here to tick off.
          </p>

          <div>
            <Action to={`/careers/${role.roleId}/roadmap`} primary={summary.totalItems > 0}>
              Open the roadmap
            </Action>
          </div>
        </div>
      ) : null}
    </Tile>
  );
}
