<script lang="ts">
  import { Button, buttonVariants } from '@/components/ui/button';
  import * as Dialog from '@/components/ui/dialog';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Checkbox } from '@/components/ui/checkbox';
  import { ScrollArea } from '@/components/ui/scroll-area';
  import { Loader2, PlusCircle } from 'lucide-svelte';
  import type { Feed, CollectionWithFeeds, Collection } from '@clairvue/types';
  import collectionApi from '@/api/collection';

  let {
    feeds,
    onSave,
    onEdit,
    children,
    open = $bindable(false),
    collection,
    edit = false,
    showButton = true
  }: {
    feeds: Feed[];
    onSave: (collection: Collection | CollectionWithFeeds) => void;
    onEdit: (collection: Collection | CollectionWithFeeds) => void;
    children?: import('svelte').Snippet;
    open?: boolean;
    collection?: CollectionWithFeeds;
    edit?: boolean;
    showButton?: boolean;
  } = $props();

  let isLoading = $state(false);
  let hasError = $state(false);
  let errorMessage = $state('');
  let name = $state(collection?.name ?? '');
  let selectedFeeds = $state<string[]>(
    edit ? (collection?.feeds?.map((feed) => feed.id) ?? []) : []
  );

  async function save() {
    if (!name.trim()) {
      hasError = true;
      errorMessage = 'Collection name is required';
      return;
    }

    isLoading = true;

    if (edit) {
      await editCollection();
    } else {
      const collectionResult = await collectionApi.createCollection(name, selectedFeeds);

      return collectionResult.match({
        ok: (value) => {
          if (
            value.feedErrors.validationErrors.length > 0 ||
            value.feedErrors.validationErrors.length > 0
          ) {
            hasError = true;
            errorMessage = 'Something went wrong';
          }

          onSave(value.collection);
          open = false;
          isLoading = false;
          return;
        },
        err: (error) => {
          hasError = true;
          isLoading = false;
          errorMessage = error.message;
        }
      });
    }
  }

  async function editCollection() {
    if (collection) {
      const currentFeeds = collection.feeds?.map((feed) => feed.id);
      const feedsToAdd = selectedFeeds.filter((feedId) => !currentFeeds?.includes(feedId));
      const feedsToRemove = currentFeeds?.filter((feedId) => !selectedFeeds.includes(feedId));

      const collectionResult = await collectionApi.updateCollection(collection.id, {
        name,
        feedsToAdd,
        feedsToRemove
      });

      return collectionResult.match({
        ok: (errors) => {
          if (errors.assignmentErrors.length > 0 || errors.removalErrors.length > 0) {
            hasError = true;
            errorMessage = 'Something went wrong';
          }

          onEdit(collection);
          open = false;
          isLoading = false;
          return;
        },
        err: (error) => {
          hasError = true;
          isLoading = false;
          errorMessage = error.message;
        }
      });
    }
  }

  function toggleFeed(feedId: string) {
    selectedFeeds = selectedFeeds.includes(feedId)
      ? selectedFeeds.filter((id) => id !== feedId)
      : [...selectedFeeds, feedId];
  }

  $effect(() => {
    if (open === true) {
      selectedFeeds = edit ? (collection?.feeds?.map((feed) => feed.id) ?? []) : [];
      hasError = false;
      errorMessage = '';
      name = edit ? (collection?.name ?? '') : '';
      isLoading = false;
    }
  });
</script>

<Dialog.Root bind:open>
  {#if children}
    {@render children?.()}
  {:else if showButton}
    <Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>
      {#if collection}
        <PlusCircle class="mr-2 h-4 w-4" />Edit collection
      {:else}
        <PlusCircle class="mr-2 h-4 w-4" />Create new collection
      {/if}
    </Dialog.Trigger>
  {/if}

  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>{edit ? 'Edit collection' : 'Create new collection'}</Dialog.Title>
      <Dialog.Description>
        {edit
          ? 'Edit your collection and manage its feeds.'
          : 'Create a new collection and select feeds to add to it.'}
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-6 py-4">
      <div class="flex w-full max-w-sm flex-col gap-2">
        <Label for="name">Name</Label>
        <Input id="name" bind:value={name} class="col-span-3" />
      </div>

      <div class="grid grid-cols-1 gap-2">
        <Label>Select feeds</Label>
        <ScrollArea class="h-72 rounded-md border">
          <div class="space-y-4 p-4">
            {#each feeds as feed (feed.id)}
              <div class="flex items-center space-x-2">
                <Checkbox
                  id={feed.id}
                  checked={selectedFeeds.includes(feed.id)}
                  onCheckedChange={() => toggleFeed(feed.id)}
                />
                <label
                  for={feed.id}
                  class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {feed.name}
                </label>
              </div>
            {/each}
          </div>
        </ScrollArea>
      </div>

      {#if hasError}
        <p class="text-center text-xs text-red-500">
          {errorMessage}
        </p>
      {/if}
    </div>

    <Dialog.Footer>
      <Button disabled={isLoading} type="submit" on:click={save}>
        {#if isLoading}
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Saving...
        {:else}
          {edit ? 'Save changes' : 'Create'}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
