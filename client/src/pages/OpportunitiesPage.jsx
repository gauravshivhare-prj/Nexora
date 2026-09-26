import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from '../components/PageShell.jsx';
import {
  OPPORTUNITY_FILTER_TYPES,
  OPPORTUNITY_SOURCE_PRESENTATION,
  OPPORTUNITY_SOURCE_TYPES,
} from '../constants/opportunityOptions.js';
import { fetchOpportunities } from '../services/opportunity.service.js';
import { toMessage } from '../utils/errorMessage.js';

const LOAD_STATUS = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' };

export function OpportunitiesPage() {
  const [data, setData] = useState(null);
  const [loadStatus, setLoadStatus] = useState(LOAD_STATUS.LOADING);
  const [loadError, setLoadError] = useState(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState(OPPORTUNITY_FILTER_TYPES.ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);

  const load = useCallback(async (signal) => {
    setLoadStatus(LOAD_STATUS.LOADING);
    setLoadError(null);

    try {
      const result = await fetchOpportunities({ signal });
      if (signal?.aborted) return;

      setData(result);
      setLoadStatus(LOAD_STATUS.READY);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(toMessage(error, 'Opportunities could not be loaded.'));
      setLoadStatus(LOAD_STATUS.FAILED);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Handle escape key to close modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && selectedOpportunity) {
        setSelectedOpportunity(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOpportunity]);

  const allOpportunities = data?.opportunities ?? [];

  // Filtered opportunities
  const filteredOpportunities = useMemo(() => {
    return allOpportunities.filter((opp) => {
      // Source filter
      if (sourceFilter === OPPORTUNITY_FILTER_TYPES.CURATED && !opp.isCurated) {
        return false;
      }
      if (sourceFilter === OPPORTUNITY_FILTER_TYPES.LIVE && !opp.isLive) {
        return false;
      }

      // Keyword search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = opp.title.toLowerCase().includes(query);
        const matchesSummary = opp.summary.toLowerCase().includes(query);
        const matchesSkills = opp.requiredSkills.some((s) => s.toLowerCase().includes(query));
        const matchesRoles = opp.targetRoleIds.some((r) => r.toLowerCase().includes(query));
        if (!matchesTitle && !matchesSummary && !matchesSkills && !matchesRoles) {
          return false;
        }
      }

      return true;
    });
  }, [allOpportunities, sourceFilter, searchQuery]);

  const curatedCount = allOpportunities.filter((o) => o.isCurated).length;
  const liveCount = allOpportunities.filter((o) => o.isLive).length;

  if (loadStatus === LOAD_STATUS.LOADING) {
    return (
      <PageShell>
        <LoadingState message="Checking verified skills against opportunity catalogue..." />
      </PageShell>
    );
  }

  if (loadStatus === LOAD_STATUS.FAILED) {
    return (
      <PageShell>
        <ErrorState
          title="Could not load opportunities"
          message={loadError}
          onRetry={() => load()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Evidence-Based Matching"
        title="Opportunities"
        description="Opportunities matched deterministically against your verified skills and target role. Nexora does not invent speculative match percentages."
      />

      <div className="flex flex-col gap-6">
        {/* Provenance & Methodology Notice */}
        <div className="rounded-2xl border border-orange-200 bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-semibold text-brand-text">
                <span aria-hidden="true">✓</span> Deterministic Match
              </span>
              <span>Requires verified skills &amp; profile target role</span>
            </div>

            {data?.catalogue && (
              <div className="flex items-center gap-3 text-ink-muted">
                <span>Catalogue v{data.catalogue.version}</span>
                {data.catalogue.source?.asOf && (
                  <span>· As of {data.catalogue.source.asOf}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Source Tabs */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Opportunity source filters">
            <button
              type="button"
              onClick={() => setSourceFilter(OPPORTUNITY_FILTER_TYPES.ALL)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                sourceFilter === OPPORTUNITY_FILTER_TYPES.ALL
                  ? 'bg-brand text-on-brand shadow-sm'
                  : 'border border-orange-100 bg-surface text-ink hover:border-brand/40'
              }`}
            >
              All Matches ({allOpportunities.length})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter(OPPORTUNITY_FILTER_TYPES.CURATED)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                sourceFilter === OPPORTUNITY_FILTER_TYPES.CURATED
                  ? 'bg-brand text-on-brand shadow-sm'
                  : 'border border-orange-100 bg-surface text-ink hover:border-brand/40'
              }`}
            >
              Curated Practice ({curatedCount})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter(OPPORTUNITY_FILTER_TYPES.LIVE)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                sourceFilter === OPPORTUNITY_FILTER_TYPES.LIVE
                  ? 'bg-brand text-on-brand shadow-sm'
                  : 'border border-orange-100 bg-surface text-ink hover:border-brand/40'
              }`}
            >
              Live Opportunities ({liveCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <label htmlFor="opportunity-search" className="sr-only">
              Search opportunities by title, skill, or role
            </label>
            <input
              id="opportunity-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, skill, or role..."
              className="w-full min-h-[44px] rounded-xl border border-orange-200 bg-surface px-4 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted hover:text-ink min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* List of Opportunities */}
        {filteredOpportunities.length === 0 ? (
          allOpportunities.length === 0 ? (
            <Card>
              <EmptyState>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-base font-semibold text-ink">
                    No opportunities currently match your verified evidence.
                  </p>
                  <p className="max-w-md text-xs text-ink-muted">
                    Nexora matches opportunities when all required skills are verified through assessments and your profile target role matches the role criteria. Claimed or unverified skills do not qualify.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-3">
                    <Link
                      to="/assessments"
                      className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                    >
                      Take a Technical Assessment
                    </Link>
                    <Link
                      to="/profile"
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                    >
                      Update Profile Target Role
                    </Link>
                    <Link
                      to="/careers"
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                    >
                      Browse Career Roles
                    </Link>
                  </div>
                </div>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <EmptyState>
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-sm font-semibold text-ink">
                    No opportunities match your current filters.
                  </p>
                  <p className="text-xs text-ink-muted">
                    Try clearing your search query or selecting a different source type.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceFilter(OPPORTUNITY_FILTER_TYPES.ALL);
                      setSearchQuery('');
                    }}
                    className="mt-2 inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                  >
                    Reset Filters
                  </button>
                </div>
              </EmptyState>
            </Card>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredOpportunities.map((opportunity) => {
              const presentation =
                OPPORTUNITY_SOURCE_PRESENTATION[opportunity.source.type] ??
                OPPORTUNITY_SOURCE_PRESENTATION.curated_internal;

              return (
                <div
                  key={opportunity.id}
                  className="flex flex-col justify-between rounded-2xl border border-orange-100 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3">
                    {/* Source & Curated vs Live Badge Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${presentation.badgeClass}`}
                      >
                        <span aria-hidden="true">{presentation.icon}</span>
                        {presentation.label}
                      </span>

                      {opportunity.source.asOf && (
                        <span className="text-[11px] text-ink-muted">
                          Source date: {opportunity.source.asOf}
                        </span>
                      )}
                    </div>

                    {/* Title & Summary */}
                    <div>
                      <h3 className="text-base font-bold text-ink">{opportunity.title}</h3>
                      <p className="mt-1 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                        {opportunity.summary}
                      </p>
                    </div>

                    {/* Required Skills */}
                    {opportunity.requiredSkills.length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                          Verified Required Skills:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {opportunity.requiredSkills.map((skill) => (
                            <span
                              key={skill}
                              className="inline-flex rounded-lg border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800"
                            >
                              ✓ {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Target Roles */}
                    {opportunity.targetRoleIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <span className="font-semibold text-ink">Target Roles:</span>
                        {opportunity.targetRoleIds.map((roleId) => (
                          <span
                            key={roleId}
                            className="inline-flex rounded-md border border-orange-100 bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink"
                          >
                            {roleId}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Matching Explanation */}
                    <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-2.5 text-xs text-ink">
                      <span className="font-semibold text-brand-text">Match Reason: </span>
                      <span className="text-ink-muted">{opportunity.explanation}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-orange-100/60 pt-3">
                    <button
                      type="button"
                      onClick={() => setSelectedOpportunity(opportunity)}
                      className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                    >
                      View Details &amp; Criteria
                    </button>
                    <Link
                      to="/interviews"
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-brand hover:text-brand-text"
                    >
                      Practice Interview
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Opportunity Detail Modal */}
        {selectedOpportunity && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-detail-title"
          >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-orange-200 bg-canvas p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      (OPPORTUNITY_SOURCE_PRESENTATION[selectedOpportunity.source.type] ??
                        OPPORTUNITY_SOURCE_PRESENTATION.curated_internal).badgeClass
                    }`}
                  >
                    {
                      (OPPORTUNITY_SOURCE_PRESENTATION[selectedOpportunity.source.type] ??
                        OPPORTUNITY_SOURCE_PRESENTATION.curated_internal).label
                    }
                  </span>
                  <h2 id="opportunity-detail-title" className="mt-2 text-lg font-bold text-ink">
                    {selectedOpportunity.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOpportunity(null)}
                  className="min-h-[44px] min-w-[44px] rounded-xl text-ink-muted hover:bg-orange-100 hover:text-ink flex items-center justify-center"
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">Summary</h4>
                  <p className="mt-1 text-ink-muted leading-relaxed">{selectedOpportunity.summary}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Eligibility &amp; Verified Skills
                  </h4>
                  <p className="mt-1 text-ink-muted">{selectedOpportunity.explanation}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedOpportunity.requiredSkills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex rounded-lg border border-green-200 bg-green-50 px-2 py-0.5 font-medium text-green-800"
                      >
                        ✓ {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Target Roles
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedOpportunity.targetRoleIds.map((roleId) => (
                      <span
                        key={roleId}
                        className="inline-flex rounded-md border border-orange-100 bg-surface px-2.5 py-1 text-ink font-medium"
                      >
                        {roleId}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-3">
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Provenance &amp; Source Metadata
                  </h4>
                  <div className="mt-1 space-y-1 text-ink-muted">
                    <p>
                      <strong>Source Type:</strong> {selectedOpportunity.source.type}
                    </p>
                    <p>
                      <strong>Catalogue Version:</strong> v{selectedOpportunity.source.version}
                    </p>
                    {selectedOpportunity.source.asOf && (
                      <p>
                        <strong>Data Effective As Of:</strong> {selectedOpportunity.source.asOf}
                      </p>
                    )}
                    <p>
                      <strong>Matching Engine:</strong> Strict deterministic evaluation (zero canned scores)
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2.5 border-t border-orange-100 pt-4">
                <Link
                  to="/assessments"
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-brand"
                >
                  Verify More Skills
                </Link>
                <Link
                  to="/interviews"
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-soft"
                >
                  Practice Interview
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
