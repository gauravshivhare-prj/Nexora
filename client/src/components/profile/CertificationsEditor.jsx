import { FIELD_LIMITS, LIST_LIMITS } from '../../constants/profileOptions.js';
import { FormField } from '../FormField.jsx';
import { RepeatableList } from './RepeatableList.jsx';

/** Certifications a student holds, with a link that lets one be verified. */
export function CertificationsEditor({ certifications, onChange, errorFor, disabled }) {
  // A credential cannot have been issued in the future. Setting max on the
  // input stops most mistakes at the date picker; the server enforces it.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <RepeatableList
      entries={certifications}
      onChange={onChange}
      makeEntry={() => ({ name: '', issuer: '', issueDate: '', credentialUrl: '' })}
      maxItems={LIST_LIMITS.certifications}
      addLabel="Add a certification"
      entryLabel="Certification"
      emptyMessage="No certifications added yet."
      disabled={disabled}
    >
      {(certification, update, index) => (
        <>
          <FormField
            label="Certification name"
            value={certification.name}
            onChange={(value) => update({ name: value })}
            error={errorFor(`certifications[${index}].name`)}
            maxLength={FIELD_LIMITS.certificationName}
            placeholder="AWS Certified Cloud Practitioner"
            disabled={disabled}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Issued by"
              value={certification.issuer}
              onChange={(value) => update({ issuer: value })}
              error={errorFor(`certifications[${index}].issuer`)}
              maxLength={FIELD_LIMITS.certificationIssuer}
              placeholder="Amazon Web Services"
              required={false}
              disabled={disabled}
            />

            <FormField
              label="Issue date"
              type="date"
              value={certification.issueDate}
              onChange={(value) => update({ issueDate: value })}
              error={errorFor(`certifications[${index}].issueDate`)}
              max={today}
              required={false}
              disabled={disabled}
            />
          </div>

          <FormField
            label="Credential link"
            type="url"
            value={certification.credentialUrl}
            onChange={(value) => update({ credentialUrl: value })}
            error={errorFor(`certifications[${index}].credentialUrl`)}
            maxLength={FIELD_LIMITS.url}
            placeholder="https://"
            hint="A verification link makes this credential checkable."
            required={false}
            disabled={disabled}
          />
        </>
      )}
    </RepeatableList>
  );
}
