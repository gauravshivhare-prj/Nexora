# Opportunity Matching Contract

## MVP boundary

Opportunity matching is a deterministic projection over verified student
evidence and a small, versioned internal catalogue. The repository currently
has no reliable live government, job-board, employer, or labour-market source,
so the MVP must not claim to provide live jobs, openings, salaries, demand,
application status, or government opportunities.

## Catalogue record

Every opportunity record has this shape:

```js
{
  id: 'curated-internal:backend-apprenticeship',
  title: 'Backend apprenticeship',
  summary: 'A practice opportunity for building server-side applications.',
  source: {
    type: 'curated_internal',
    version: 1,
    asOf: '2026-09-23',
  },
  eligibility: [
    { type: 'verified_skills', skills: ['javascript', 'node.js'] },
    { type: 'target_role', roleIds: ['backend-developer'] },
  ],
  requiredSkills: ['javascript', 'node.js'],
  targetRoleIds: ['backend-developer'],
}
```

The `id` is stable and source-qualified. It must not be derived from a title
that can be edited, and it must not be reused for a different opportunity.
`source.asOf` is the catalogue record date, not a promise that a live listing
still exists. `source.version` and the catalogue version make results
reproducible.

Eligibility is explicit and machine-readable. G8 must match only against
verified canonical skills and the student's explicit target role data. A
claimed or merely supported skill is not sufficient for an eligibility rule
that requires verification. Missing profile sections must produce no match,
not an inferred pass.

## Match result

Matches must return the complete source metadata, the stable opportunity ID,
the matched eligibility rules, and an explanation of the verified evidence
that satisfied them. Results must be deterministic and deduplicated by ID.
No opaque score, percentage, AI ranking, or unsupported eligibility claim is
part of this contract.

## Intentional non-goals

The MVP does not fetch external feeds, scrape websites, verify current
availability, submit applications, infer legal/work authorization, assess
income or location eligibility, or recommend an opportunity from an LLM.