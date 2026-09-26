import { docLabels } from '../docLabels';
import type { MaterialKind } from '../materials';
import type { Course } from '../schema';
import type { Block, ProjectOptions, SemanticDoc } from '../semantic';
import { projectMap, projectSyllabus } from './overview';
import { projectPlan, projectSlides, projectStudy } from './lessonViews';
import { projectAssignments, projectDiscussions, projectFaq, projectQuiz, projectRubrics } from './taskViews';
import { makeCtx, type Ctx } from './shared';

const projectors: Record<MaterialKind, (ctx: Ctx) => Block[]> = {
  map: projectMap,
  syllabus: projectSyllabus,
  plan: projectPlan,
  slides: projectSlides,
  assignments: projectAssignments,
  rubrics: projectRubrics,
  discussions: projectDiscussions,
  quiz: projectQuiz,
  study: projectStudy,
  faq: projectFaq,
};

/** project(course, kind, audience) → SemanticDoc. Pure: same input, same document. */
export function project(course: Course, kind: MaterialKind, opts: ProjectOptions): SemanticDoc {
  const l = docLabels(course.language);
  return {
    kind,
    title: l.materials[kind],
    subtitle: course.title,
    language: course.language,
    audience: opts.audience,
    blocks: projectors[kind](makeCtx(course, kind, opts)),
  };
}
