import ShortUniqueId from 'short-unique-id';
import { getClient } from '../db';
import {
  collectionSchema,
  feedSchema,
  collectionsToFeeds,
  type Collection,
  type Feed,
  type CollectionWithFeeds
} from '../schema';
import { and, eq, like } from 'drizzle-orm';
import slugify from 'slugify';
import feedRepository from './feed.repository';

async function create(newCollection: Pick<Collection, 'name' | 'userId'> & { default?: boolean }) {
  //TODO: Limit the number of collections per user to 5
  try {
    const db = getClient();
    const { randomUUID } = new ShortUniqueId({ length: 8 });

    const id = (newCollection.default ? 'default-' : '') + randomUUID();
    const slug = slugify(newCollection.name, {
      lower: true,
      remove: /[*+~.()'"!:@]/g
    });

    await db
      .insert(collectionSchema)
      .values({
        ...newCollection,
        id,
        slug
      })
      .execute();
    return {
      id,
      name: newCollection.name,
      slug
    };
  } catch (error) {
    console.error('Error occurred while creating new Collection:', error);
    return undefined;
  }
}

async function update(id: string, newCollection: Pick<Collection, 'name'>) {
  try {
    const db = getClient();
    await db
      .update(collectionSchema)
      .set({
        ...newCollection
      })
      .where(eq(collectionSchema.id, id))
      .execute();
  } catch (error) {
    console.error('Error occurred while updating Collection:', error);
    throw error;
  }
}

async function addFeedsToCollection(assignments: { id: string; feedId: string }[]) {
  try {
    const db = getClient();

    const collection = await db.query.collectionSchema
      .findFirst({ where: eq(collectionSchema.id, assignments[0].id) })
      .execute();

    if (!collection) throw new Error('Collection does not exist');

    const validAssignments = await Promise.all(
      assignments.map(async ({ id, feedId }) => {
        const feedExists = await db.query.feedSchema
          .findFirst({ where: eq(feedSchema.id, feedId) })
          .execute();

        if (!feedExists) return undefined;

        const isAlreadyRelated = await db.query.collectionsToFeeds
          .findFirst({
            where: and(
              eq(collectionsToFeeds.collectionId, id),
              eq(collectionsToFeeds.feedId, feedId)
            )
          })
          .execute();

        if (isAlreadyRelated) return undefined;

        return {
          collectionId: id,
          feedId,
          userId: collection.userId
        };
      })
    );

    const filteredAssignments = validAssignments.filter((as) => !!as);

    await db.insert(collectionsToFeeds).values(filteredAssignments).execute();
  } catch (error) {
    console.error('Error occurred while adding feeds to collection:', error);
    throw error;
  }
}

async function findById(id: string): Promise<Collection | undefined> {
  try {
    const db = getClient();

    const result = await db.query.collectionSchema
      .findFirst({
        where: eq(collectionSchema.id, id)
      })
      .execute();

    if (result) return undefined;

    return result;
  } catch (error) {
    console.error('Error occurred while finding Collection by id:', error);
    return undefined;
  }
}

async function findByIdWithFeeds(id: string): Promise<CollectionWithFeeds | undefined> {
  try {
    const db = getClient();
    const result = await db
      .select()
      .from(collectionSchema)
      .leftJoin(collectionsToFeeds, eq(collectionsToFeeds.collectionId, collectionSchema.id))
      .leftJoin(feedSchema, eq(collectionsToFeeds.feedId, feedSchema.id))
      .where(eq(collectionSchema.id, id))
      .execute();

    if (!result || result.length === 0) return undefined;

    const feeds = result.map((r) => (r.feeds ? [r.feeds] : []));

    return {
      ...result[0].collections,
      feeds: feeds.flat()
    };
  } catch (error) {
    console.error('Error occurred while finding Collection by slug:', error);
    return undefined;
  }
}

async function findBySlug(slug: string, userId: string): Promise<Collection | undefined> {
  try {
    const db = getClient();
    const result = await db.query.collectionSchema
      .findFirst({
        where: and(eq(collectionSchema.userId, userId), eq(collectionSchema.slug, slug))
      })
      .execute();

    if (!result) return undefined;

    return result as Collection;
  } catch (error) {
    console.error('Error occurred while finding Collection by id:', error);
    return undefined;
  }
}

async function findBySlugWithFeeds(
  slug: string,
  userId: string
): Promise<CollectionWithFeeds | undefined> {
  try {
    const db = getClient();
    const result = await db
      .select()
      .from(collectionSchema)
      .leftJoin(collectionsToFeeds, eq(collectionsToFeeds.collectionId, collectionSchema.id))
      .leftJoin(feedSchema, eq(collectionsToFeeds.feedId, feedSchema.id))
      .where(and(eq(collectionSchema.userId, userId), eq(collectionSchema.slug, slug)))
      .execute();

    if (!result || result.length === 0) return undefined;

    const feeds = result.map((r) => (r.feeds ? [r.feeds] : []));

    return {
      ...result[0].collections,
      feeds: feeds.flat()
    };
  } catch (error) {
    console.error('Error occurred while finding Collections by userId:', error);
    return undefined;
  }
}

async function findByUserId(userId: string): Promise<Collection[] | undefined> {
  try {
    const db = getClient();
    const result = await db
      .select()
      .from(collectionSchema)
      .where(eq(collectionSchema.userId, userId))
      .execute();

    if (!result || result.length === 0) return undefined;
  } catch (error) {
    console.error('Error occurred while finding Collection by user id:', error);
    return [];
  }
}

async function findByUserIdWithFeeds(userId: string): Promise<CollectionWithFeeds[] | undefined> {
  const db = getClient();
  const result = await db.query.collectionSchema.findMany({
    where: eq(collectionSchema.userId, userId),
    with: {
      collectionsToFeeds: {
        columns: {},
        with: {
          feed: true
        }
      }
    }
  });

  if (!result || result.length === 0) return undefined;

  const processedCollections = await Promise.all(
    result.map(async (collection) => {
      const feeds = await Promise.all(collection.collectionsToFeeds?.map(async (e) => e.feed));
      return {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        userId: collection.userId,
        feeds: feeds ?? []
      };
    })
  );

  return processedCollections;
}

async function findDefaultByUserId(userId: string): Promise<Collection | undefined> {
  try {
    const db = getClient();
    const result = await db.query.collectionSchema
      .findFirst({
        where: and(eq(collectionSchema.userId, userId), like(collectionSchema.id, 'default-%'))
      })
      .execute();
    return result as Collection;
  } catch (error) {
    console.error('Error occurred while finding Collection by user id:', error);
    return undefined;
  }
}

async function findDefaultByUserIdWithFeeds(
  userId: string
): Promise<CollectionWithFeeds | undefined> {
  try {
    const db = getClient();
    const result = await db.query.collectionSchema.findFirst({
      where: and(eq(collectionSchema.userId, userId), like(collectionSchema.id, 'default-%')),
      with: {
        collectionsToFeeds: {
          columns: {},
          with: {
            feed: true
          }
        }
      }
    });

    if (!result) return undefined;

    const feeds = result.collectionsToFeeds?.map((b) => b.feed) || [];

    return {
      id: result.id,
      slug: result.slug,
      name: result.name,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      userId: result.userId,
      feeds
    };
  } catch (error) {
    console.error('Error occurred while finding Collection by user id:', error);
    return undefined;
  }
}

//delete is a ts keyword
async function removeFeedFromCollection(id: string, feedId: string) {
  try {
    // Check if it's a default feed
    const feed = await feedRepository.findById(feedId);
    if (feed?.link.startsWith('default-feed-') && id.includes('default-')) {
      throw 'Cannot remove default feed from default collection';
    }

    const db = getClient();

    await db
      .delete(collectionsToFeeds)
      .where(and(eq(collectionsToFeeds.collectionId, id), eq(collectionsToFeeds.feedId, feedId)))
      .execute();
  } catch (error) {
    console.error('Error occurred while removing feed:', error);
    throw error;
  }
}

export default {
  create,
  update,
  findById,
  findByIdWithFeeds,
  findBySlug,
  findBySlugWithFeeds,
  findByUserId,
  findByUserIdWithFeeds,
  addFeedsToCollection,
  findDefaultByUserId,
  findDefaultByUserIdWithFeeds,
  removeFeedFromCollection
};