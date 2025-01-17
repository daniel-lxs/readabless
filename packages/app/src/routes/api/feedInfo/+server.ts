import authService from '@/server/services/auth.service';
import feedService from '@/server/services/feed.service';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { authSession } = locals;

  if (!authSession) {
    return new Response('Unauthorized', { status: 401 });
  }
  const encodedFeedLink = url.searchParams.get('link');

  if (!encodedFeedLink) {
    return new Response('Missing feed link', { status: 400 });
  }

  const feedLink = atob(encodedFeedLink);

  if (!feedLink) {
    return new Response('Invalid feed link', { status: 400 });
  }

  const feedInfoResult = await feedService.fetchAndParseFeed(feedLink);

  if (feedInfoResult.isErr()) {
    const urlResult = await feedService.extractFeedUrl(feedLink);

    if (urlResult.isOk()) {
      const url = urlResult.unwrap();
      const feedInfoResult = await feedService.fetchAndParseFeed(url);

      return feedInfoResult.match({
        ok: ({ title, description }) => {
          return new Response(JSON.stringify({ title, description, url }), {
            headers: {
              'Content-Type': 'application/json'
            }
          });
        },
        err: (error) => {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
      });
    }
  }
  const { title, description } = feedInfoResult.unwrap();
  return new Response(JSON.stringify({ title, description, url }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
};
