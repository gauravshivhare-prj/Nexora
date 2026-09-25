# AI Interview Contract & Architecture Audit

## Purpose

The AI Interview feature delivers structured, AI-guided technical mock interviews with bounded question evaluation, prompt boundary hardening, and deterministic integration into the institutional evidence engine.

## MVP Boundary

Interviews are conducted as asynchronous text question-and-answer sessions targeting canonical skills for curated career roles.

Explicit non-goals in MVP:
- No untrusted code execution sandbox: answers are evaluated on conceptual and structural technical depth rather than running uncontained user code.
- No live audio/video capture: text-based submissions only.
- No ungrounded LLM career recommendations or scoring bypasses: AI feedback is strictly advisory and cannot verify skills without institutional/human validation.

## Session Lifecycle State Machine

```text
       ┌──────────────┐
       │ initialized  │
       └──────┬───────┘
              │ (startSession)
              ▼
       ┌──────────────┐
       │ in_progress  ├────────────────────────┐
       └───┬──────────┘                        │
           │ (completeSession)                 │ (abandonSession / timeout)
           ▼                                   ▼
    ┌─────────────┐                    ┌───────────────┐
    │  completed  │ (Terminal)         │   abandoned   │ (Terminal)
    └─────────────┘                    │   timed_out   │
                                       └───────────────┘
```

1. **`initialized`**: Session created with target role, canonical skills, difficulty, and selected questions.
2. **`in_progress`**: Candidate has started the interview session and is submitting answers.
3. **`completed`**: All questions answered (or candidate completes session), overall score computed, and evidence checks recorded. Terminal state.
4. **`timed_out`**: Session time limit (`maxSessionMinutes = 90`) exceeded. Terminal state.
5. **`abandoned`**: Candidate explicitly abandons the session. Terminal state.
6. **`failed`**: Unexpected system failure during lifecycle. Terminal state.

### Attempt Limits & Durations
- Questions per session: 1 to 10 (default: 3–5).
- Target skills per session: 1 to 5 canonical skills.
- Time limit per question: bounded up to 600 seconds (10 minutes).
- Session time limit: bounded up to 90 minutes.
- Attempts per question: 1 to 3 attempts (default: 1).
- Total attempts per session: capped at 10 (maximum boundary 30).

## Question Archetypes

Every curated question in the question bank adheres to one of four archetypes:
1. `conceptual`: Fundamental definitions, language/runtime mechanics, and protocols.
2. `scenario`: Real-world architectural or debugging problem-solving.
3. `behavioral`: Technical collaboration, incident retrospectives, and engineering trade-offs.
4. `technical_deep_dive`: Advanced internals, memory management, distributed concurrency, and optimizations.

## Evaluator Contract & Verification Policy

The institutional evidence model enforces strict separation between automated AI assistance and institutional verification:

| Evaluator Type | Status Outcome | Eligible for Verified? | Evidence Strength |
|---|---|---|---|
| `ai` | `uncertain` | `false` | `supported` |
| `human` (score $\ge 0.75$) | `pass` | `true` | `verified` |
| `human` (score $< 0.75$) | `fail` | `false` | `supported` |

### Institutional Rules:
1. **Advisory AI Evaluations**:
   - AI evaluations are always advisory.
   - Raw AI claims can **never** directly grant verified skill evidence, regardless of a perfect score (1.0).
   - Student session completions default to `evaluatorType: 'ai'`.
2. **Human / Institutional Verification**:
   - Only authorized administrative/human evaluations with a passing score ($\ge 0.75$) grant `eligibleForVerified: true`.
3. **CareerTwin Integration**:
   - Completed sessions persist individual `SkillEvidenceCheck` documents in MongoDB for each target skill.
   - Newly recorded verified evidence flags CareerTwin staleness (`latestEvidenceAt > generatedAt`).
   - Subsequent CareerTwin generation consumes the verified evidence checks, elevating skills from `claimed` or `supported` to `verified`.
   - Skill-gap analysis updates verified skills to `GAP_STATUS.VERIFIED` and clears recommended practice tasks.

## Rubric Dimensions & Scoring Formula

Answers are evaluated across four normalized dimensions ($0.0 \le d \le 1.0$) with deterministic weights summing exactly to 1.0:

| Dimension Key | Name | Weight | Focus Area |
|---|---|---|---|
| `accuracy` | Technical Accuracy | 35% (0.35) | Factual correctness, precision with framework/runtime concepts. |
| `depth` | Depth of Knowledge | 30% (0.30) | Underlying mechanics, edge cases, trade-offs, and scalability. |
| `clarity` | Communication Clarity | 20% (0.20) | Structure, concise technical vocabulary, and articulateness. |
| `relevance` | Relevance to Question | 15% (0.15) | Direct adherence to prompt without off-topic evasion. |

$$\text{Composite Score} = (0.35 \times \text{accuracy}) + (0.30 \times \text{depth}) + (0.20 \times \text{clarity}) + (0.15 \times \text{relevance})$$

Overall session score is the weighted average of question scores:
$$\text{Overall Score} = \frac{\sum_{i=1}^N (\text{Score}_i \times \text{Weight}_i)}{\sum_{i=1}^N \text{Weight}_i}$$

## Prompt Boundary Hardening & Adversarial Defenses

Candidate answers are untrusted input. The architecture enforces multi-layered boundary isolation:
1. **XML Delimiter Isolation**:
   Candidate text is encapsulated in `<candidate_untrusted_answer>` XML tags.
2. **Sanitization**:
   - XML closing tag variations (`</candidate_untrusted_answer>`, `</ candidate_untrusted_answer >`) are escaped to `&lt;/...&gt;`.
   - Control characters, null bytes, and non-printable bytes are stripped.
   - Invisible zero-width spaces (`\u200B`–`\u200D`, `\uFEFF`) and Unicode directionality override characters are removed.
   - CDATA blocks and LLM chat/instruction tokens (`<|im_start|>`, `[INST]`, `<<SYS>>`) are neutralized.
3. **Sandwich Defense**:
   System instructions are repeated after the candidate's untrusted input to re-establish evaluator instruction authority.
4. **Strict JSON Schema Validation**:
   - AI response must be valid JSON matching the exact schema.
   - Forbidden privilege escalation fields (`verified`, `eligibleForVerified`, `outcome`, `evaluatorType`, `user`, `role`) immediately reject the response with `502 AI_MALFORMED_OUTPUT`.
   - Dimensions outside $[0.0, 1.0]$ or non-numeric values are rejected.
5. **Answer Grounding**:
   - Skills returned in `groundedSkills` are filtered strictly against Nexora's canonical taxonomy and target question skill.
   - Non-canonical, unasked, or hallucinated skills are discarded.
   - Candidate scores below 0.65 withhold skill grounding.

## Frontend Contract & Presentation Tokens

The client interface adheres to the **Sunset Warm** design theme token set:

| Token | Class | Usage |
|---|---|---|
| Primary | `#EA580C` | Primary action buttons, active progress rings |
| Secondary | `#F97316` | Secondary badges, progress bars |
| Background | `#FFF7ED` | Main application background |
| Success | `#22C55E` | Passed questions, verified evidence states |
| Warning | `#F59E0B` | Partial evaluation, attention states |
| Error | `#EF4444` | Failed attempts, timeouts, validation errors |
| Card | `#FFFFFF` | Form surfaces, question cards |

### Client Normalizer Rules:
- Never expose MongoDB `_id`, `__v`, or owner `user` IDs to UI components.
- Standardize session ID property as `id`.
- Strip any internal scoring keys, weights, or provider credentials.
- Gracefully handle in-flight, empty, and terminal session states.
