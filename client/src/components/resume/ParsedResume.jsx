/**
 * What the model read out of a resume.
 *
 * Presented as a *reading*, not as facts about the student. The backend has
 * already dropped anything it could not find in the source text, and records
 * what it dropped in `warnings` — so the honest framing here is "this is what
 * was extracted, here is what was discarded, and here is what produced it".
 *
 * Nothing on this screen is editable. The analysis pipeline writes `parsed`
 * and there is no endpoint that accepts a correction, so an edit control
 * would be a promise the API cannot keep.
 */
export function ParsedResume({ parsed, analysedBy }) {
  const sections = [
    parsed.skills.length > 0 && {
      key: 'skills',
      title: 'Skills',
      body: <Chips items={parsed.skills.map((skill) => skill.name)} />,
    },
    parsed.education.length > 0 && {
      key: 'education',
      title: 'Education',
      body: (
        <Entries
          entries={parsed.education.map((entry) => ({
            heading: entry.institution ?? entry.degree ?? 'Education',
            meta: [entry.degree, entry.field, yearRange(entry.startYear, entry.endYear), entry.grade],
          }))}
        />
      ),
    },
    parsed.experience.length > 0 && {
      key: 'experience',
      title: 'Experience',
      body: (
        <Entries
          entries={parsed.experience.map((entry) => ({
            heading: entry.title ?? entry.organisation ?? 'Role',
            meta: [entry.organisation, joinDates(entry.startDate, entry.endDate)],
            body: entry.description,
          }))}
        />
      ),
    },
    parsed.projects.length > 0 && {
      key: 'projects',
      title: 'Projects',
      body: (
        <Entries
          entries={parsed.projects.map((entry) => ({
            heading: entry.title ?? 'Project',
            meta: entry.technologies,
            body: entry.description,
          }))}
        />
      ),
    },
    parsed.certifications.length > 0 && {
      key: 'certifications',
      title: 'Certifications',
      body: (
        <Entries
          entries={parsed.certifications.map((entry) => ({
            heading: entry.name ?? 'Certification',
            meta: [entry.issuer, entry.issueYear],
          }))}
        />
      ),
    },
    parsed.achievements.length > 0 && {
      key: 'achievements',
      title: 'Achievements',
      body: <Bullets items={parsed.achievements} />,
    },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Basics basics={parsed.basics} />

      {sections.length === 0 ? (
        <p className="text-sm text-ink-muted">
          The analysis finished but found nothing it could confirm against the resume text.
        </p>
      ) : (
        sections.map((section) => (
          <div key={section.key}>
            <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">
              {section.title}
            </h3>
            <div className="mt-2">{section.body}</div>
          </div>
        ))
      )}

      {/*
        Attribution, not decoration. A student looking at an extracted skill a
        year from now needs to know which model read it, and the backend
        records exactly that against the document.
      */}
      {analysedBy?.provider ? (
        <p className="border-t border-orange-100 pt-4 text-xs text-ink-muted">
          Read by {analysedBy.provider}
          {analysedBy.model ? ` (${analysedBy.model})` : ''}. Extracted automatically — check it
          against your own resume before relying on it.
        </p>
      ) : null}
    </div>
  );
}

function Basics({ basics }) {
  const rows = [
    ['Name', basics.fullName],
    ['Email', basics.email],
    ['Phone', basics.phone],
    ['Location', basics.location],
  ].filter(([, value]) => value);

  if (rows.length === 0 && basics.links.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">Contact</h3>

      <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="shrink-0 font-medium text-ink-muted">{label}</dt>
            <dd className="min-w-0 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {basics.links.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {basics.links.map((link) => (
            <li
              key={link}
              className="max-w-full truncate rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-ink"
            >
              {/*
                Rendered as text, not as an anchor. These URLs came out of a
                model reading an untrusted document; making them clickable
                would turn extracted content into navigation.
              */}
              {link}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Chips({ items }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm text-ink"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Bullets({ items }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Entries({ entries }) {
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const meta = (entry.meta ?? []).filter(Boolean);

        return (
          <li key={index} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
            <p className="text-sm font-semibold text-ink">{entry.heading}</p>
            {meta.length > 0 ? (
              <p className="mt-0.5 text-xs text-ink-muted">{meta.join(' · ')}</p>
            ) : null}
            {entry.body ? <p className="mt-1.5 text-sm text-ink">{entry.body}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function yearRange(start, end) {
  if (!start && !end) return null;
  return `${start ?? '?'}–${end ?? 'present'}`;
}

function joinDates(start, end) {
  if (!start && !end) return null;
  return `${start ?? '?'} – ${end ?? 'present'}`;
}
