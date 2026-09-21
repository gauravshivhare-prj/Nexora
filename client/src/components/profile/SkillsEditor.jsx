import { FIELD_LIMITS, LIST_LIMITS, SKILL_LEVEL_OPTIONS } from '../../constants/profileOptions.js';
import { FormField } from '../FormField.jsx';
import { FormSelect } from '../FormSelect.jsx';
import { RepeatableList } from './RepeatableList.jsx';

/**
 * The skills a student claims, each with a self-assessed level.
 *
 * The wording is deliberately "you say" rather than "you have": Nexora treats
 * this as a claim, and later phases look to projects and assessments before
 * calling a skill demonstrated. Saying so here means the eventual distinction
 * does not come as a surprise.
 */
export function SkillsEditor({ skills, onChange, errorFor, disabled }) {
  return (
    <RepeatableList
      entries={skills}
      onChange={onChange}
      makeEntry={() => ({ name: '', level: 'beginner' })}
      maxItems={LIST_LIMITS.skills}
      addLabel="Add a skill"
      entryLabel="Skill"
      emptyMessage="No skills added yet. Add the tools and languages you work with."
      disabled={disabled}
    >
      {(skill, update, index) => (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <FormField
            label="Skill"
            value={skill.name}
            onChange={(value) => update({ name: value })}
            error={errorFor(`skills[${index}].name`)}
            maxLength={FIELD_LIMITS.skillName}
            placeholder="Node.js"
            disabled={disabled}
          />

          <FormSelect
            label="Level you would claim"
            value={skill.level}
            onChange={(value) => update({ level: value })}
            options={SKILL_LEVEL_OPTIONS}
            error={errorFor(`skills[${index}].level`)}
            disabled={disabled}
          />
        </div>
      )}
    </RepeatableList>
  );
}
