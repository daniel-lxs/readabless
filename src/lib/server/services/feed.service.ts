import feedRepository from '@/server/data/repositories/feed.repository';
import type { Feed } from '@/server/data/schema';
import type { CreateFeedDto } from '@/server/dto/feed.dto';
import type { CreateFeedResult } from '@/types/CreateFeedResult';
import { getArticleQueue } from '@/server/queue/articles';
import { addFeedToBoard } from './board.service';

export async function findFeedById(id: string): Promise<Feed | undefined> {
  return await feedRepository.findById(id);
}

export async function createFeed(feedData: CreateFeedDto): Promise<CreateFeedResult> {
  try {
    const newFeedData = { ...feedData, description: feedData.description || null };
    const createdFeed = await feedRepository.create(newFeedData);

    if (!createdFeed) {
      return { result: 'error', reason: 'Unable to create' };
    }

    if (feedData.boardId) {
      await addFeedToBoard(feedData.boardId, createdFeed.id);
    }

    if (!createdFeed.link.startsWith('default-feed')) {
      const articleQueue = getArticleQueue();
      articleQueue?.add(
        'sync',
        { feedId: createdFeed.id },
        {
          jobId: createdFeed.id,
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    }

    return { result: 'success', data: createdFeed };
  } catch (error) {
    return { result: 'error', reason: 'Internal error' };
  }
}

export async function updateFeed(
  id: string,
  data: Pick<Feed, 'name' | 'link' | 'description'>
): Promise<void> {
  await feedRepository.update(id, data);
}
