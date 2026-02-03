<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import  BidirectionalList, { type BidirectionalListRef } from 'broad-infinite-list/vue';

/**
 * ChatMessage interface
 * Note: In Vue SFC <script setup>, we don't export types.
 * If this interface needs to be shared, move it to a separate .ts file.
 */
interface ChatMessage {
  id: number;
  text: string;
  sender: 'me' | 'them';
  time: string;
}

const TOTAL_COUNT = 1e4;
const VIEW_SIZE = 50;
const PAGE_SIZE = 20;

const generateMessage = (id: number): ChatMessage => ({
  id,
  text:
    id % 5 === 0
      ? `Message #${id}: Can someone check the latest deploy?`
      : `Message #${id}: Checking the status of the server...`,
  sender: id % 2 === 0 ? 'me' : 'them',
  time: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  }),
});

let ALL_MESSAGES: ChatMessage[] = [];

const messages = ref<ChatMessage[]>([]);
const disable = ref(true);
const useWindowRef = ref(false);
const unreadCount = ref(0);
const inputValue = ref('');
const listRef = ref<BidirectionalListRef>();

  const toggleUseWindow = () => {
    useWindowRef.value = !useWindowRef.value;
  }


onMounted(() => {
  ALL_MESSAGES = Array.from({ length: TOTAL_COUNT }, (_, i) =>
    generateMessage(i)
  );
  const initialMessages = ALL_MESSAGES.slice(-VIEW_SIZE);
  messages.value = initialMessages;
  if (initialMessages.length > 0) {
    nextTick(() => {
      listRef.value?.scrollToBottom('instant');
      disable.value = false;
    })
  }
});

const handleLoadMore = async (
  direction: 'up' | 'down',
  refItem: ChatMessage
): Promise<ChatMessage[]> => {
  await new Promise((r) => setTimeout(r, 1e3));

  const idx = ALL_MESSAGES.findIndex((m) => m.id === refItem.id);
  if (idx === -1) return [];

  if (direction === 'up') {
    // load older messages
    const start = Math.max(0, idx - PAGE_SIZE);
    return ALL_MESSAGES.slice(start, idx);
  } else {
    // load newer messages
    const end = Math.min(ALL_MESSAGES.length, idx + PAGE_SIZE + 1);
    return ALL_MESSAGES.slice(idx + 1, end);
  }
};

const hasPrevious = computed(() => 
  messages.value.length > 0 && messages.value[0]?.id !== ALL_MESSAGES[0]?.id
);

const hasNext = computed(() =>
  messages.value.length > 0 &&
  messages.value[messages.value.length - 1]?.id !==
    ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id
);

const showJump = computed(() =>
  messages.value[messages.value.length - 1]?.id !==
  ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id
);

const onJump = (): void => {
  unreadCount.value = 0;
  messages.value = ALL_MESSAGES.slice(-VIEW_SIZE);
  setTimeout(() => listRef.value?.scrollToBottom('instant'), 50);
};

const onScrollStart = (): void => {
  console.log('Start scroll');
};

const onScrollEnd = (): void => {
  console.log('Finish scroll');
};

const sendMessage = (): void => {
  if (!inputValue.value.trim()) return;
  
  const lastItem = ALL_MESSAGES[ALL_MESSAGES.length - 1];
  const nextId =
    (typeof lastItem?.id === 'number' ? lastItem.id : TOTAL_COUNT) + 1;
  const newMsg: ChatMessage = {
    id: nextId,
    text: inputValue.value,
    sender: 'me',
    time: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
  ALL_MESSAGES.push(newMsg); // Sync to database
  onJump();
  inputValue.value = '';
};

const itemKey = (m: ChatMessage): string => m.id.toString();

const handleItemsChange = (newItems: ChatMessage[]): void => {
  messages.value = newItems;
};
</script>

<template>
  <div class="bg-white rounded-3xl border border-gray-200 flex flex-col shadow-2xl relative" :class='useWindowRef ? "min-h-screen min-h-[100dvh]!":"h-screen h-[100dvh]! overflow-hidden"'>
    <div class="p-4 border-b border-black/10 bg-white/80 backdrop-blur sticky top-0 flex items-center justify-between shrink-0 z-9">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md">
          JD
        </div>
        <div>
          <h3 class="font-bold text-sm text-slate-800">
            Project Channel
          </h3>
          <p class="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            History: {{ TOTAL_COUNT.toLocaleString() }}
          </p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <span class="text-xs text-green-500 font-bold tracking-widest flex items-center gap-1">
          <span class="size-1.5 bg-green-500 rounded-full animate-pulse" />
          ONLINE
        </span>
        <button class='text-[10px] text-white shadow font-bold bg-sky-500 rounded-lg px-2 py-1 cursor-pointer' @click='toggleUseWindow'>useWindow: {{ useWindowRef }}</button>
      </div>
    </div>

    <div class="flex-1 min-h-0 bg-slate-50 pb-20">
      <BidirectionalList
        :key='useWindowRef ? 1 : 2'
        ref="listRef"
        :items="messages"
        :item-key="itemKey"
        :use-window="useWindowRef"
        :has-previous="hasPrevious"
        :has-next="hasNext"
        :view-size="VIEW_SIZE"
        :threshold="100"
        :on-load-more="handleLoadMore"
        :on-items-change="handleItemsChange"
        :disable="disable"
        :on-scroll-start="onScrollStart"
        :on-scroll-end="onScrollEnd"
      >
        <template #spinner>
          <div class="p-4 flex justify-center">
            <div class="size-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        </template>

        <template #item="{ item: m }">
          <div
            :class="[
              'flex p-2 px-4',
              m.sender === 'me' ? 'justify-end' : 'justify-start'
            ]"
          >
            <div
              :class="[
                'max-w-[80%] p-3 rounded-2xl shadow-sm text-sm',
                m.sender === 'me'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white text-gray-800 rounded-bl-none border border-gray-100'
              ]"
            >
              {{ m.text }}
              <span
                :class="[
                  'block text-[9px] mt-1 text-right uppercase font-bold tracking-tighter',
                  m.sender === 'me' ? 'text-blue-200' : 'text-gray-300'
                ]"
              >
                {{ m.time }}
              </span>
            </div>
          </div>
        </template>
      </BidirectionalList>
    </div>

    <button
      v-if="showJump"
      @click="onJump"
      class="fixed bottom-24 right-6 bg-indigo-600 text-white px-5 py-2.5 rounded-full font-bold text-xs shadow-xl flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all z-20 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2"
    >
      {{ unreadCount > 0 ? `New Messages (${unreadCount})` : 'Scroll to Bottom' }}
      ↓
    </button>

    <form
      @submit.prevent="sendMessage"
      class="p-4 bg-white border-t border-black/10 flex gap-2 shrink-0 fixed bottom-0 left-0 right-0"
    >
      <input
        v-model="inputValue"
        placeholder="Type a message..."
        class="flex-1 bg-gray-100 rounded-full px-5 py-2 text-sm outline-none focus:ring-2 ring-blue-500 transition-all text-slate-700"
      />
      <button
        type="submit"
        class="size-10 bg-blue-600 rounded-full flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all shadow-md"
      >
        <svg
          class="size-5 rotate-90"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
        </svg>
      </button>
    </form>
  </div>
</template>

<style scoped>
/* Tailwind classes used above, no additional styles needed */
/* Make sure Tailwind CSS is configured in your project */
</style>