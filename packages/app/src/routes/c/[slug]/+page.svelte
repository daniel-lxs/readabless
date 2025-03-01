<script lang="ts">
  import { countArticlesByCollectionId, getArticlesByCollectionId } from '$lib/api/article';
  import ArticleCard from '@/components/article/article-card.svelte';
  import * as Page from '@/components/page';
  import type { PageData } from './$types';
  import ArticleCardSkeleton from '@/components/article/article-card-skeleton.svelte';
  import NewArticlesButton from '@/components/collection/new-articles-button.svelte';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import Button from '@/components/ui/button/button.svelte';
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
  import * as Tooltip from '@/components/ui/tooltip';
  import { onMount } from 'svelte';
  import {
    type PaginatedList,
    type ArticleWithInteraction,
    type ArticleWithFeed
  } from '@clairvue/types';
  import { showToast, normalizeError } from '$lib/utils';
  import NavigationSidebar from '@/components/navigation/navigation-sidebar.svelte';
  import { collectionsStore } from '@/stores/collections';
  import { feedsStore } from '@/stores/feeds';
  import PageSkeleton from '@/components/page-skeleton.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let collections = $state($collectionsStore);
  let feeds = $state($feedsStore);

  let isLoading = $state(true);
  let newArticlesCount = $state(0);
  const perPage = 10;
  let isLoadingMore = $state(false);
  let currentPage = 2; // Since we load 20 articles at first, we are starting at page 2
  let articles: (ArticleWithFeed & {
    saved: boolean;
    read: boolean;
  })[] = $state([]);
  let savedScrollPosition = 0;
  let hasReachedEnd = false;

  // Save the current state before navigating away
  beforeNavigate(({ to }) => {
    if (to?.url.pathname.includes('/article/')) {
      savedScrollPosition = window.scrollY;
      sessionStorage.setItem('collection_articles_' + data.collection.id, JSON.stringify(articles));
      sessionStorage.setItem(
        'collection_scroll_' + data.collection.id,
        savedScrollPosition.toString()
      );
      sessionStorage.setItem(
        'collection_reached_end_' + data.collection.id,
        hasReachedEnd.toString()
      );
    }
  });

  afterNavigate(({ type, from, to }) => {
    if (type === 'popstate' && from?.url.pathname !== to?.url.pathname) {
      const savedArticles = sessionStorage.getItem('collection_articles_' + data.collection.id);
      const savedScroll = sessionStorage.getItem('collection_scroll_' + data.collection.id);
      const savedReachedEnd = sessionStorage.getItem(
        'collection_reached_end_' + data.collection.id
      );

      if (savedArticles) {
        articles = JSON.parse(savedArticles);
        isLoading = false;
      }

      if (savedReachedEnd) {
        hasReachedEnd = savedReachedEnd === 'true';
      }

      if (savedScroll) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedScroll));
        }, 0);
      }
    } else {
      isLoading = true;
      articles = [];
      currentPage = 2;
      hasReachedEnd = false;
      newArticlesCount = 0;
      getArticles();
      sessionStorage.removeItem('collection_articles_' + data.collection.id);
      sessionStorage.removeItem('collection_scroll_' + data.collection.id);
      sessionStorage.removeItem('collection_reached_end_' + data.collection.id);
    }
  });

  const getArticles = async () => {
    try {
      articles = (await data.streamed.articles).items;
    } catch (e) {
      const errror = normalizeError(e);
      console.error('Error occurred while getting articles:', errror);
      showToast('There was an error', errror.message, 'error');
    } finally {
      isLoading = false;
    }
  };

  const fetchArticles = async (
    limit: number,
    beforePublishedAt: Date | string = new Date()
  ): Promise<PaginatedList<ArticleWithInteraction> | undefined> => {
    const articlesResult = await getArticlesByCollectionId(
      data.collection.id,
      beforePublishedAt,
      limit
    );

    return articlesResult.match({
      ok: (articles) => articles,
      err: (error) => {
        showToast('There was an error', error.message, 'error');
        return undefined;
      }
    });
  };

  // Separate function for loading more articles
  const loadMoreArticles = async () => {
    if (isLoadingMore || hasReachedEnd) return;

    isLoadingMore = true;

    const newArticles = await fetchArticles(perPage, articles[articles.length - 1].publishedAt);

    if (!newArticles || newArticles.items.length === 0) {
      hasReachedEnd = true;
    } else {
      articles = [...articles, ...newArticles.items];
      currentPage += 1;
    }

    isLoadingMore = false;
  };

  // Scroll event handler
  const handleScroll = () => {
    if (hasReachedEnd) return;

    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    const clientHeight = document.documentElement.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight * 0.8 && !isLoadingMore) {
      loadMoreArticles();
    }
  };

  const showNewArticles = async () => {
    newArticlesCount = 0;
    isLoading = true;
    scrollTo(0, 0);

    const initialArticleLimit = 20;
    const newArticles = await fetchArticles(initialArticleLimit);
    if (newArticles && newArticles.items.length > 0) {
      articles = newArticles.items;
    }

    isLoading = false;
  };

  const checkNewArticles = async () => {
    const countArticlesResult = await countArticlesByCollectionId(
      data.collection.id,
      articles[0].publishedAt
    );
    countArticlesResult.match({
      ok: (value) => (newArticlesCount = value.count),
      err: (error) => {
        showToast('There was an error', error.message, 'error');
      }
    });
  };

  $effect(() => {
    collectionsStore.subscribe((value) => {
      collections = value;
    });

    feedsStore.subscribe((value) => {
      feeds = value;
    });
  });

  onMount(() => {
    const savedArticles = sessionStorage.getItem('collection_articles_' + data.collection.id);
    if (savedArticles) {
      articles = JSON.parse(savedArticles);
      checkNewArticles();
      isLoading = false;
    } else {
      getArticles();
    }

    // Check for new articles every minute
    const intervalId = setInterval(checkNewArticles, 60 * 1000);

    // Set up scroll event listener
    window.addEventListener('scroll', handleScroll);

    // Clean up event listeners on component unmount
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<svelte:head>
  <title
    >{newArticlesCount > 0 ? `(${newArticlesCount}) ` : ''}{data.collection?.name} - Clairvue</title
  >
</svelte:head>

{#snippet sidebar()}
  <NavigationSidebar class="mt-2.5" {collections} {feeds} />
{/snippet}

{#snippet content()}
  <div class="flex w-full flex-col sm:pt-2.5">
    {#if newArticlesCount > 0}
      <NewArticlesButton onClick={showNewArticles} />
    {/if}
    <Page.Header>
      <div class="flex w-full justify-between">
        <h1 class="text-xl font-semibold sm:text-2xl">{data.collection?.name}</h1>
        <Tooltip.Root>
          <Button
            title="Edit feed collection"
            href="/feeds/{data.collection.slug}"
            variant="ghost"
            size="icon"
          >
            <MoreHorizontal class="h-6 w-6" />
          </Button>
          <Tooltip.Content>
            <p class="text-xs leading-4">Edit feed collection</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
      <p class="sm:text-md text-md text-muted-foreground">
        {data.collection.feeds
          ? `Showing articles from ${data.collection.feeds.length} feeds`
          : undefined}
      </p></Page.Header
    >

    <div class="space-y-4 sm:space-y-2">
      {#if isLoading}
        {#each { length: perPage } as _}
          <ArticleCardSkeleton />
        {/each}
      {:else if articles && articles.length > 0}
        {#each articles as article}
          <ArticleCard {article} feed={article.feed} />
        {/each}
        {#if isLoadingMore}
          <ArticleCardSkeleton />
        {/if}
      {:else}
        <p>No articles found</p>
      {/if}
    </div>
  </div>
{/snippet}

<PageSkeleton {sidebar} {content} />
