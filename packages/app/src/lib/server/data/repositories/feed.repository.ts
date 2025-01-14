import { count, desc, eq, and, asc, like, lt, not } from 'drizzle-orm';
import ShortUniqueId from 'short-unique-id';
import { getClient } from '../db';
import { collectionsToFeeds, feedSchema, articleSchema, userArticleInteractions } from '../schema';
import { Result, type Feed, type FeedWithArticles } from '@clairvue/types';
import { normalizeError } from '$lib/utils';
import slugify from 'slugify';

async function create(
  newFeed: Pick<Feed, 'name' | 'description' | 'link'>
): Promise<Result<Feed, Error>> {
  try {
    const db = getClient();

    const existingFeed = (await findByLink(newFeed.link)).unwrap();

    if (existingFeed) {
      return Result.ok(existingFeed);
    }

    const { randomUUID } = new ShortUniqueId({ length: 8 });
    const id = randomUUID();
    const slug = slugify(newFeed.name, {
      lower: true,
      remove: /[*+~.()'"!:@]/g
    });

    const result = await db
      .insert(feedSchema)
      .values({
        id,
        name: newFeed.name,
        slug,
        description: newFeed.description,
        link: newFeed.link
      })
      .returning({
        id: feedSchema.id,
        name: feedSchema.name,
        slug: feedSchema.slug,
        description: feedSchema.description,
        link: feedSchema.link,
        createdAt: feedSchema.createdAt,
        updatedAt: feedSchema.updatedAt,
        syncedAt: feedSchema.syncedAt
      })
      .execute();

    if (!result || result.length === 0) return Result.err(new Error('Failed to create feed'));

    return Result.ok(result[0]);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while creating feed:', error);
    return Result.err(error);
  }
}

async function findById(id: string): Promise<Result<Feed | false, Error>> {
  try {
    const db = getClient();
    const result = await db.query.feedSchema.findFirst({ where: eq(feedSchema.id, id) }).execute();

    if (!result) return Result.ok(false);

    const articleCount = (await countArticles(id)).unwrapOr(0);

    return Result.ok({
      ...result,
      articleCount
    });
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding feed by id:', error);
    return Result.err(error);
  }
}

async function findBySlug(slug: string): Promise<Result<Feed | false, Error>> {
  try {
    const db = getClient();
    const result = await db.query.feedSchema
      .findFirst({ where: eq(feedSchema.slug, slug) })
      .execute();

    if (!result) return Result.ok(false);

    return Result.ok(result);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding feed by slug:', error);
    return Result.err(error);
  }
}

async function findByLink(link: string): Promise<Result<Feed | false, Error>> {
  try {
    const db = getClient();
    const result = await db.select().from(feedSchema).where(eq(feedSchema.link, link)).execute();

    if (!result || result.length === 0) return Result.ok(false);

    return Result.ok(result[0]);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding feed by link:', error);
    return Result.err(error);
  }
}

async function findByUserId(
  userId: string,
  take = 20,
  skip = 0
): Promise<Result<Feed[] | false, Error>> {
  try {
    const db = getClient();
    take = take > 100 ? 100 : take;

    const result = await db
      .select()
      .from(feedSchema)
      .innerJoin(
        collectionsToFeeds,
        and(eq(collectionsToFeeds.feedId, feedSchema.id), eq(collectionsToFeeds.userId, userId))
      )
      .limit(take)
      .offset(skip)
      .orderBy(desc(feedSchema.createdAt))
      .execute();

    if (!result || result.length === 0) return Result.ok(false);

    return Result.ok(result.map((r) => r.feeds));
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding feed by user id:', error);
    return Result.err(error);
  }
}

async function findAll(take = 20, skip = 0): Promise<Result<Feed[] | false, Error>> {
  try {
    const db = getClient();

    take = take > 100 ? 100 : take;

    const result = await db.query.feedSchema
      .findMany({
        offset: skip,
        limit: take,
        orderBy: desc(feedSchema.createdAt)
      })
      .execute();

    if (!result || result.length === 0) return Result.ok(false);

    return Result.ok(result);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding all feeds:', error);
    return Result.err(error);
  }
}

//TODO: drizzle has a bug where it won't return anything if more than a day has passed
async function findOutdated(take = 20, skip = 0): Promise<Result<Feed[] | false, Error>> {
  try {
    const MAX_AGE = 10 * 60 * 1000; // 10 minutes
    take = take > 100 ? 100 : take;
    const db = getClient();

    const outdatedDate = new Date(Date.now() - MAX_AGE);

    const result = await db.query.feedSchema
      .findMany({
        where: and(
          lt(feedSchema.syncedAt, outdatedDate),
          not(like(feedSchema.link, 'default-feed%'))
        ),
        orderBy: asc(feedSchema.syncedAt),
        limit: take,
        offset: skip
      })
      .execute();

    if (!result || result.length === 0) return Result.ok(false);

    return Result.ok(result);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding all outdated feeds:', error);
    return Result.err(error);
  }
}

async function findWithArticles(
  id: string,
  userId: string,
  take = 20,
  skip = 0
): Promise<Result<FeedWithArticles | false, Error>> {
  try {
    const db = getClient();
    const result = await db
      .select()
      .from(feedSchema)
      .where(eq(feedSchema.id, id))
      .innerJoin(articleSchema, eq(articleSchema.feedId, feedSchema.id))
      .innerJoin(
        userArticleInteractions,
        and(
          eq(userArticleInteractions.articleId, articleSchema.id),
          eq(userArticleInteractions.userId, userId)
        )
      )
      .limit(take)
      .offset(skip)
      .execute();

    if (!result) return Result.ok(false);

    const feed = {
      ...result[0].feeds,
      articles: result.map(({ articles, userArticleInteractions }) => ({
        ...articles,
        saved: userArticleInteractions.saved,
        read: userArticleInteractions.read
      }))
    };

    return Result.ok(feed);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding feed with articles:', error);
    return Result.err(error);
  }
}

async function findDefaultFeedByUserId(userId: string): Promise<Result<Feed | false, Error>> {
  try {
    const db = getClient();
    const result = await db
      .select()
      .from(feedSchema)
      .innerJoin(
        collectionsToFeeds,
        and(eq(collectionsToFeeds.feedId, feedSchema.id), eq(collectionsToFeeds.userId, userId))
      )
      .where(like(feedSchema.link, 'default-feed%'))
      .execute();
    if (!result || result.length === 0) return Result.ok(false);

    return Result.ok(result[0].feeds);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while finding default feed:', error);
    return Result.err(error);
  }
}

async function countArticles(id: string): Promise<Result<number, Error>> {
  try {
    const db = getClient();
    const [result] = await db
      .select({ count: count() })
      .from(articleSchema)
      .where(eq(articleSchema.feedId, id))
      .execute();

    if (!result) return Result.ok(0);
    return Result.ok(result.count);
  } catch (e) {
    const error = normalizeError(e);
    console.error('Error occurred while getting article count:', error);
    return Result.err(error);
  }
}

async function update(
  id: string,
  toUpdate: Pick<Feed, 'name' | 'description' | 'link'>
): Promise<Result<Feed, Error>> {
  try {
    const db = getClient();
    const currentDate = new Date();
    const result = await db
      .update(feedSchema)
      .set({
        ...toUpdate,
        updatedAt: currentDate
      })
      .where(eq(feedSchema.id, id))
      .returning()
      .execute();

    if (!result || result.length === 0) return Result.err(new Error('Failed to update feed'));

    return Result.ok(result[0]);
  } catch (error) {
    const err = normalizeError(error);
    console.error('Error occurred while updating feed:', err);
    return Result.err(err);
  }
}

async function updateLastSync(id: string): Promise<Result<Feed, Error>> {
  try {
    const db = getClient();
    const result = await db
      .update(feedSchema)
      .set({
        syncedAt: new Date()
      })
      .where(eq(feedSchema.id, id))
      .returning()
      .execute();
    if (!result || result.length === 0) return Result.err(new Error('Failed to update feed'));
    return Result.ok(result[0]);
  } catch (error) {
    const err = normalizeError(error);
    console.error('Error occurred while updating feed last sync:', err);
    return Result.err(err);
  }
}

async function deleteForUser(userId: string, feedId: string): Promise<Result<true, Error>> {
  try {
    const db = getClient();
    const result = await db
      .delete(collectionsToFeeds)
      .where(and(eq(collectionsToFeeds.feedId, feedId), eq(collectionsToFeeds.userId, userId)))
      .returning()
      .execute();
    if (!result || result.length === 0) return Result.err(new Error('Failed to delete feed'));
    const isOrphanResult = await deleteIfOrphan(feedId);
    if (isOrphanResult.isErr()) return Result.err(isOrphanResult.unwrapErr());
    return Result.ok(true);
  } catch (error) {
    const err = normalizeError(error);
    console.error('Error occurred while deleting feed for user:', err);
    return Result.err(err);
  }
}

async function isOrphan(feedId: string): Promise<Result<boolean, Error>> {
  try {
    const db = getClient();
    const result = await db
      .select()
      .from(collectionsToFeeds)
      .where(eq(collectionsToFeeds.feedId, feedId))
      .execute();
    return Result.ok(result.length === 0);
  } catch (error) {
    const err = normalizeError(error);
    console.error('Error occurred while checking if feed is orphan:', err);
    return Result.err(err);
  }
}

async function deleteIfOrphan(feedId: string): Promise<Result<boolean, Error>> {
  try {
    const isOrphanResult = await isOrphan(feedId);
    return isOrphanResult.match({
      ok: async (isOrphan) => {
        if (isOrphan) {
          const db = getClient();
          await db.delete(feedSchema).where(eq(feedSchema.id, feedId)).execute();
          return Result.ok(true);
        }
        return Result.ok(false);
      },
      err: () => Result.err(new Error('Failed to delete orphan feed'))
    });
  } catch (error) {
    const err = normalizeError(error);
    console.error('Error occurred while deleting orphan feed:', err);
    return Result.err(err);
  }
}

export default {
  create,
  findById,
  findBySlug,
  findByLink,
  findAll,
  findByUserId,
  findDefaultFeedByUserId,
  findOutdated,
  findWithArticles,
  countArticles,
  update,
  updateLastSync,
  deleteForUser
};
