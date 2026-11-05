import { describe, expect, it } from 'vitest';
import { filterVideos, videos } from '../src/catalog';

describe('sample catalog search', () => {
  it('matches titles and channels ignoring case and surrounding spaces', () => {
    expect(filterVideos(videos, '  ALPS  ', 'All').map(item => item.id)).toEqual(['alpine']);
    expect(filterVideos(videos, 'analog hours', 'All').map(item => item.id)).toEqual(['music']);
  });
  it('combines category and search without modifying the source', () => {
    expect(filterVideos(videos, '', 'Design')).toHaveLength(2);
    expect(filterVideos(videos, 'alps', 'Design')).toEqual([]);
    expect(videos).toHaveLength(8);
  });
  it('returns all samples for an empty query and no category restriction', () => {
    expect(filterVideos(videos, '', 'All')).toHaveLength(8);
  });
});
