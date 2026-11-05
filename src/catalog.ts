export const categories = ['All', 'Design', 'Technology', 'Travel', 'Music', 'Nature', 'Architecture', 'Film'] as const;
export type Video = { id: string; title: string; channel: string; category: string; duration: string; views: string; age: string; artwork: string; color: string };
// Original demonstration metadata; these are not live YouTube results or playable media.
export const videos: Video[] = [
  { id: 'alpine', title: 'A little further from everything. A week in the Alps', channel: 'Somewhere Slow', category: 'Travel', duration: '18:42', views: '124K', age: '2 days ago', artwork: 'mountains', color: '#c9d5bd' },
  { id: 'objects', title: 'Good design is in the things you don’t notice', channel: 'Object Studies', category: 'Design', duration: '12:08', views: '86K', age: '4 days ago', artwork: 'objects', color: '#e6c9a7' },
  { id: 'desk', title: 'Building a workspace that makes room for ideas', channel: 'Made by Alex', category: 'Technology', duration: '16:35', views: '208K', age: '1 week ago', artwork: 'desk', color: '#c8c9e6' },
  { id: 'ocean', title: 'The quiet rhythm of the coast', channel: 'Earth in Motion', category: 'Nature', duration: '24:16', views: '52K', age: '3 days ago', artwork: 'ocean', color: '#a8d5df' },
  { id: 'music', title: 'Sunday morning records · a listening session', channel: 'Analog Hours', category: 'Music', duration: '42:50', views: '319K', age: '2 weeks ago', artwork: 'music', color: '#e8bba8' },
  { id: 'house', title: 'Inside a small home with a bigger perspective', channel: 'Spaces & Places', category: 'Architecture', duration: '14:22', views: '173K', age: '5 days ago', artwork: 'house', color: '#c6d6ad' },
  { id: 'city', title: 'Tokyo after the last train | a short film', channel: 'Night & Day', category: 'Film', duration: '08:54', views: '97K', age: '1 week ago', artwork: 'city', color: '#c3b4dc' },
  { id: 'light', title: 'Chasing light: finding a different way to see', channel: 'The Creative Practice', category: 'Design', duration: '11:46', views: '64K', age: '6 days ago', artwork: 'light', color: '#e2cd9e' },
];
export function filterVideos(items: Video[], query: string, category: string) {
  const text = query.trim().toLowerCase();
  return items.filter(video => (category === 'All' || video.category === category) && `${video.title} ${video.channel} ${video.category}`.toLowerCase().includes(text));
}
