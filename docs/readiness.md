# Career Readiness Contract

## Purpose

Career Readiness is a deterministic explanation of the evidence already
available for one catalogue role. It is a projection of the existing
CareerTwin and skill-gap contracts, not an AI judgement and not a second
ranking score.

## Response shape

```js
{
  roleId: 'backend-developer',
  evidenceStatus: 'insufficient_data' | 'partial' | 'supported' | 'verified',
  dataStatus: 'fresh' | 'stale' | 'incomplete',
  required: { total, missing, claimed, supported, verified },
  preferred: { total, missing, claimed, supported, verified },
  blockingSkills: [
    {
      key,
      name,
      importance: 'required',
      status: 'missing' | 'claimed' | 'supported' | 'verified',
      reason,
      evidence,
    },
  ],
  basedOn: {
    careerTwinGeneratedAt,
    catalogueVersion,
    contractVersion: 1,
  },
}
```

`required` and `preferred` counts must equal the corresponding counts from the
existing skill-gap result. `blockingSkills` contains required skills that are
not verified; preferred skills never block the evidence status.

## Evidence rules

The only skill evidence states are `missing`, `claimed`, `supported`, and
`verified`, in increasing strength. Profile or resume assertions are claimed;
project or certification evidence is supported; passing deterministic
assessments or human-evaluated interviews are verified. AI-only interview
output never becomes verified.

The readiness evidence status is derived as follows:

- `insufficient_data`: no usable CareerTwin or role comparison exists.
- `partial`: at least one required skill is missing or claimed.
- `supported`: every required skill is supported or verified, and at least one
  required skill is not verified.
- `verified`: every required skill is verified.

`dataStatus` reports freshness independently. `stale` means the stored
CareerTwin no longer represents current profile, resume, or evidence-check
inputs. `incomplete` is reserved for relevant source data that is pending,
failed, or only partially usable. Missing optional sections must not cause a
crash or invent evidence.

## Explicit non-goals

The contract does not expose `score`, `readinessScore`, `percentage`,
`confidence`, or any equivalent aggregate precision. It does not use raw LLM
output to determine readiness, create opportunities, or infer evidence that
is absent from persisted or derived product data.