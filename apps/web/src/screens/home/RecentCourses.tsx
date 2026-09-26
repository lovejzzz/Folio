import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CourseCard } from '../../components/CourseCard';
import { useT } from '../../i18n';
import { listCourses, type CourseSummary } from '../../state/db';

export function RecentCourses() {
  const t = useT();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  useEffect(() => {
    let live = true;
    listCourses()
      .then((all) => live && setCourses(all.slice(0, 3)))
      .catch(() => live && setCourses([]));
    return () => {
      live = false;
    };
  }, []);
  if (!courses.length) return null;
  return (
    <section aria-labelledby="recent" className="mt-20 animate-fade-in">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="recent" className="font-ui text-14 font-semibold text-ink">
          {t.home.recent}
        </h2>
        <Link to="/library" className="font-ui text-13 text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          {t.home.seeAll}
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
    </section>
  );
}
