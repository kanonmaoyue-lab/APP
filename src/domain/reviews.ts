import { addDays } from './dates';
import type { Rating, ReviewItem } from './types';
export const intervals = [1, 3, 7, 14, 30] as const;
export function scheduleReview(
  level: number,
  rating: Rating,
  date: string,
): Pick<ReviewItem, 'level' | 'nextReviewOn'> {
  if (
    !Number.isInteger(level) || level < 0 || level > 4 ||
    !['forgot', 'fuzzy', 'remembered'].includes(rating)
  ) throw Error('评分无效');
  const next =
    (rating === 'forgot'
      ? 0
      : rating === 'fuzzy'
      ? Math.max(0, level - 1)
      : Math.min(4, level + 1)) as ReviewItem['level'];
  return { level: next, nextReviewOn: addDays(date, intervals[next]) };
}
