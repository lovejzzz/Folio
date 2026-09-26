import type { Course, Lesson, MaterialKind } from '@folio/core';
import type { ReactNode } from 'react';
import { PlanEditor } from './PlanEditor';
import { SlidesStrip } from './SlidesEditor';
import { AssignmentEditor, DiscussionEditor, FaqEditor, QuizEditor, RubricsEditor, StudyEditor } from './TaskEditors';

type Editor = (props: { course: Course; lesson: Lesson; startAt?: number }) => ReactNode;

/** The editor for one lesson's slice of each material. Course-wide materials have none. */
export const lessonEditors: Partial<Record<MaterialKind, Editor>> = {
  plan: PlanEditor,
  slides: SlidesStrip,
  study: StudyEditor,
  quiz: QuizEditor,
  assignments: ({ course, lesson }) => <AssignmentEditor course={course} lesson={lesson} showRubric={!course.materials.rubrics.enabled} />,
  rubrics: RubricsEditor,
  discussions: DiscussionEditor,
  faq: FaqEditor,
};
