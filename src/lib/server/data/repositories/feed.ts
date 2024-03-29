import { and, count, desc, eq } from 'drizzle-orm';
import ShortUniqueId from 'short-unique-id';
import { getClient } from '../db';
import { boardsToFeeds, feedSchema, type Feed, articleSchema } from '../schema';

async function create(
	newFeed: Pick<Feed, 'name' | 'description' | 'link' | 'type'>
): Promise<Feed | undefined> {
	try {
		const db = getClient();

		const existingFeed = await findByLink(newFeed.link);

		if (existingFeed) {
			const articleCount = await countArticles(existingFeed.id);
			return { ...existingFeed, articleCount };
		}

		const { randomUUID } = new ShortUniqueId({ length: 8 });
		const id = randomUUID();

		const result = await db
			.insert(feedSchema)
			.values({
				id,
				name: newFeed.name,
				description: newFeed.description,
				link: newFeed.link,
				type: newFeed.type
			})
			.returning({
				id: feedSchema.id,
				name: feedSchema.name,
				description: feedSchema.description,
				link: feedSchema.link,
				type: feedSchema.type,
				createdAt: feedSchema.createdAt,
				updatedAt: feedSchema.updatedAt,
				syncedAt: feedSchema.syncedAt
			})
			.execute();

		return result[0];
	} catch (error) {
		console.error('Error occurred while creating new feed:', error);
		return undefined;
	}
}

async function findById(id: string): Promise<Feed | undefined> {
	try {
		const db = getClient();
		const result = await db.query.feedSchema.findFirst({ where: eq(feedSchema.id, id) }).execute();

		if (!result) return undefined;

		const articleCount = await countArticles(id);

		return {
			...result,
			articleCount
		};
	} catch (error) {
		console.error('Error occurred while finding feed by link:', error);
		return undefined;
	}
}

async function findByLink(link: string): Promise<Feed | undefined> {
	try {
		const db = getClient();
		const result = await db.select().from(feedSchema).where(eq(feedSchema.link, link)).execute();

		const Feed = result[0];
		if (!Feed) return undefined;

		return Feed;
	} catch (error) {
		console.error('Error occurred while finding feed by link:', error);
		return undefined;
	}
}

async function findAll(take = 20, skip = 0): Promise<Feed[]> {
	try {
		const db = getClient();

		take = take > 100 ? 100 : take;

		const result = await db.query.feedSchema.findMany({
			offset: skip,
			limit: take,
			orderBy: desc(feedSchema.createdAt)
		});
		return result;
	} catch (error) {
		console.error('Error occurred while finding all feeds:', error);
		return [];
	}
}

async function countArticles(id: string): Promise<number | undefined> {
	try {
		const db = getClient();
		const [result] = await db
			.select({ count: count() })
			.from(articleSchema)
			.where(eq(articleSchema.feedId, id))
			.execute();
		return result.count;
	} catch (error) {
		console.error('Error occurred while getting article count:', error);
		return undefined;
	}
}

async function update(id: string, updatedFeed: Pick<Feed, 'name' | 'description' | 'link'>) {
	try {
		const db = getClient();
		const currentDate = new Date();
		await db
			.update(feedSchema)
			.set({
				...updatedFeed,
				updatedAt: currentDate
			})
			.where(eq(feedSchema.id, id)).execute;
	} catch (error) {
		console.error('Error occurred while updating feed:', error);
		throw error;
	}
}

async function updateLastSync(id: string, lastSync: Date) {
	try {
		const db = getClient();
		await db
			.update(feedSchema)
			.set({
				syncedAt: lastSync
			})
			.where(eq(feedSchema.id, id)).execute;
	} catch (error) {
		console.error('Error occurred while updating feed:', error);
		throw error;
	}
}

//delete is a ts keyword
async function remove(id: string, boardId: string) {
	try {
		const db = getClient();

		await db
			.delete(boardsToFeeds)
			.where(and(eq(boardsToFeeds.boardId, boardId), eq(boardsToFeeds.feedId, id)))
			.execute();
	} catch (error) {
		console.error('Error occurred while deleting feed:', error);
	}
}

export default {
	create,
	findById,
	findByLink,
	findAll,
	countArticles,
	update,
	updateLastSync,
	remove
};
