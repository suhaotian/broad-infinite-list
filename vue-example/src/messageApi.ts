/**
 * Mock API for chat messages
 * 
 * Invariants:
 * - ALL_MESSAGES is sorted chronologically (oldest to newest)
 * - Cursor is a message ID
 * - Direction 'up' loads older messages (lower IDs)
 * - Direction 'down' loads newer messages (higher IDs)
 */

export interface ChatMessage {
  id: number;
  text: string;
  sender: 'me' | 'them';
  time: string;
}

export interface FetchMessagesRequest {
  cursor?: number;
  pageSize: number;
  direction?: 'up' | 'down';
}

export interface FetchMessagesResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

const TOTAL_COUNT = 1e4;
const NETWORK_DELAY_MS = 1000;

let ALL_MESSAGES: ChatMessage[] = [];

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

/**
 * Initialize the message database
 * Must be called before using fetchMessages
 */
export const initializeMessages = (): void => {
  ALL_MESSAGES = Array.from({ length: TOTAL_COUNT }, (_, i) =>
    generateMessage(i)
  );
};

/**
 * Fetch messages with cursor-based pagination
 * 
 * Without cursor: returns the latest pageSize messages
 * With cursor + direction 'up': returns pageSize older messages before cursor
 * With cursor + direction 'down': returns pageSize newer messages after cursor
 */
export const fetchMessages = async (
  request: FetchMessagesRequest
): Promise<FetchMessagesResponse> => {
  await new Promise((resolve) => setTimeout(resolve, NETWORK_DELAY_MS));

  const { cursor, pageSize, direction } = request;

  // No cursor: return latest messages
  if (cursor === undefined) {
    const start = Math.max(0, ALL_MESSAGES.length - pageSize);
    const messages = ALL_MESSAGES.slice(start);
    return {
      messages,
      hasMore: start > 0,
    };
  }

  // Find cursor position
  const cursorIdx = ALL_MESSAGES.findIndex((m) => m.id === cursor);
  if (cursorIdx === -1) {
    console.error(`Cursor ID ${cursor} not found in messages`);
    return { messages: [], hasMore: false };
  }

  // Load older messages (direction 'up')
  if (direction === 'up') {
    const start = Math.max(0, cursorIdx - pageSize);
    const messages = ALL_MESSAGES.slice(start, cursorIdx);
    return {
      messages,
      hasMore: start > 0,
    };
  }

  // Load newer messages (direction 'down')
  if (direction === 'down') {
    const end = Math.min(ALL_MESSAGES.length, cursorIdx + pageSize + 1);
    const messages = ALL_MESSAGES.slice(cursorIdx + 1, end);
    return {
      messages,
      hasMore: end < ALL_MESSAGES.length,
    };
  }

  console.error(`Invalid direction: ${direction}`);
  return { messages: [], hasMore: false };
};

/**
 * Add a new message to the database
 * Returns the created message
 */
export const addMessage = (text: string, sender: 'me' | 'them'): ChatMessage => {
  const lastItem = ALL_MESSAGES[ALL_MESSAGES.length - 1];
  const nextId = (typeof lastItem?.id === 'number' ? lastItem.id : TOTAL_COUNT) + 1;
  
  const newMsg: ChatMessage = {
    id: nextId,
    text,
    sender,
    time: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
  
  ALL_MESSAGES.push(newMsg);
  return newMsg;
};

/**
 * Get total message count
 */
export const getTotalCount = (): number => ALL_MESSAGES.length;

/**
 * Check if there are older messages before the given message ID
 */
export const hasOlderMessages = (messageId: number): boolean => {
  const idx = ALL_MESSAGES.findIndex((m) => m.id === messageId);
  return idx > 0;
};

/**
 * Check if there are newer messages after the given message ID
 */
export const hasNewerMessages = (messageId: number): boolean => {
  const idx = ALL_MESSAGES.findIndex((m) => m.id === messageId);
  return idx !== -1 && idx < ALL_MESSAGES.length - 1;
};