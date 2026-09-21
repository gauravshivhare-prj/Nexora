import { FIELD_LIMITS, LIST_LIMITS } from '../../constants/profileOptions.js';
import { FormField } from '../FormField.jsx';
import { FormTextarea } from '../FormTextarea.jsx';
import { TagListField } from '../TagListField.jsx';
import { RepeatableList } from './RepeatableList.jsx';

/**
 * Projects a student has built.
 *
 * These are the strongest evidence a profile can carry on its own, which is
 * why the technologies list is a first-class field rather than something to be
 * dug out of the description later.
 */
export function ProjectsEditor({ projects, onChange, errorFor, disabled }) {
  return (
    <RepeatableList
      entries={projects}
      onChange={onChange}
      makeEntry={() => ({
        title: '',
        description: '',
        technologies: [],
        projectUrl: '',
        githubUrl: '',
      })}
      maxItems={LIST_LIMITS.projects}
      addLabel="Add a project"
      entryLabel="Project"
      emptyMessage="No projects added yet. Projects are the clearest evidence of what you can build."
      disabled={disabled}
    >
      {(project, update, index) => (
        <>
          <FormField
            label="Project title"
            value={project.title}
            onChange={(value) => update({ title: value })}
            error={errorFor(`projects[${index}].title`)}
            maxLength={FIELD_LIMITS.projectTitle}
            placeholder="Nexora"
            disabled={disabled}
          />

          <FormTextarea
            label="What it does"
            value={project.description}
            onChange={(value) => update({ description: value })}
            error={errorFor(`projects[${index}].description`)}
            maxLength={FIELD_LIMITS.projectDescription}
            rows={3}
            disabled={disabled}
          />

          <TagListField
            label="Technologies used"
            values={project.technologies}
            onChange={(value) => update({ technologies: value })}
            maxItems={LIST_LIMITS.technologies.maxItems}
            maxLength={LIST_LIMITS.technologies.maxLength}
            placeholder="React"
            disabled={disabled}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Live link"
              type="url"
              value={project.projectUrl}
              onChange={(value) => update({ projectUrl: value })}
              error={errorFor(`projects[${index}].projectUrl`)}
              maxLength={FIELD_LIMITS.url}
              placeholder="https://"
              required={false}
              disabled={disabled}
            />

            <FormField
              label="Repository link"
              type="url"
              value={project.githubUrl}
              onChange={(value) => update({ githubUrl: value })}
              error={errorFor(`projects[${index}].githubUrl`)}
              maxLength={FIELD_LIMITS.url}
              placeholder="https://github.com/"
              required={false}
              disabled={disabled}
            />
          </div>
        </>
      )}
    </RepeatableList>
  );
}
