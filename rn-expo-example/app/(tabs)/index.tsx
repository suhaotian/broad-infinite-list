import BidirectionalList, {
  type BidirectionalListProps,
  type BidirectionalListRef,
} from "broad-infinite-list/react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useNextTick from "use-next-tick";

export interface ChatMessage {
  id: number;
  text: string;
  sender: "me" | "them";
  time: string;
}

const TOTAL_COUNT = 2e4;
const VIEW_COUNT = 60;
const PAGE_SIZE = 20;

const generateMessage = (id: number): ChatMessage => ({
  id,
  text:
    id % 5 === 0
      ? `Message #${id}: Can someone check the latest deploy?`
      : `Message #${id}: Checking the status of the server...`,
  sender: id % 2 === 0 ? "me" : "them",
  time: new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

let ALL_MESSAGES: ChatMessage[] = [];

export default function ChatDemoScreen() {
  const nextTick = useNextTick();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [disable, setDisable] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    ALL_MESSAGES = Array.from({ length: TOTAL_COUNT }, (_, i) =>
      generateMessage(i)
    );
    const initialMessages = ALL_MESSAGES.slice(-VIEW_COUNT);
    setMessages(initialMessages);

    nextTick(() => {
      listRef.current?.scrollToBottom?.(false);
      setDisable(false);
    });
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      // setKeyboardVisible(true);
      console.log(
        listRef.current?.getBottomDistance(),
        listRef.current?.getTopDistance()
      );
      setTimeout(() => {
        console.log(
          listRef.current?.getBottomDistance(),
          listRef.current?.getTopDistance()
        );
        listRef.current?.scrollToBottom(true);
      }, 50);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      // setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLoadMore: BidirectionalListProps<ChatMessage>["onLoadMore"] =
    async (direction, refItem) => {
      await new Promise((r) => setTimeout(r, 1000));

      const idx = ALL_MESSAGES.findIndex((m) => m.id === refItem.id);
      if (idx === -1) return [];

      if (direction === "up") {
        /** Load older messages */
        const start = Math.max(0, idx - PAGE_SIZE);
        return ALL_MESSAGES.slice(start, idx);
      } else {
        /** Load newer messages */
        const end = Math.min(ALL_MESSAGES.length, idx + PAGE_SIZE + 1);
        return ALL_MESSAGES.slice(idx + 1, end);
      }
    };

  const hasPrevious =
    messages.length > 0 && messages[0]?.id !== ALL_MESSAGES[0]?.id;
  const hasNext =
    messages.length > 0 &&
    messages[messages.length - 1]?.id !==
      ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id;

  const listRef = useRef<BidirectionalListRef>(null);
  const showJump =
    messages[messages.length - 1]?.id !==
    ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id;

  const onJump = () => {
    setUnreadCount(0);
    setMessages(ALL_MESSAGES.slice(-VIEW_COUNT));
    setTimeout(() => listRef.current?.scrollToBottom(false), 50);
  };

  const onScrollStart = () => {
    console.log("Start scroll");
    console.log(
      listRef.current?.getBottomDistance(),
      listRef.current?.getTopDistance()
    );
  };

  const onScrollEnd = () => {
    console.log("Finish scroll");
    console.log(
      listRef.current?.getBottomDistance(),
      listRef.current?.getTopDistance()
    );
  };

  const sendMessage = () => {
    if (!inputValue.trim()) return;
    const lastItem = ALL_MESSAGES[ALL_MESSAGES.length - 1];
    const nextId =
      (typeof lastItem?.id === "number" ? lastItem.id : TOTAL_COUNT) + 1;
    const newMsg: ChatMessage = {
      id: nextId,
      text: inputValue,
      sender: "me",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    ALL_MESSAGES.push(newMsg);
    onJump();
    setInputValue("");
  };
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}>
      <View style={[styles.chatCard, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>JD</Text>
            </View>
            <View>
              <Text style={styles.channelName}>Project Channel</Text>
              <Text style={styles.historyCount}>
                HISTORY: {TOTAL_COUNT.toLocaleString()}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.onlineIndicator}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>ONLINE</Text>
            </View>
          </View>
        </View>

        {/* Messages List */}
        <View style={styles.messagesContainer}>
          <BidirectionalList<ChatMessage>
            ref={listRef}
            items={messages}
            itemKey={(m) => m.id.toString()}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            viewCount={VIEW_COUNT}
            threshold={100}
            onLoadMore={handleLoadMore}
            onItemsChange={setMessages}
            containerStyle={styles.scrollView}
            listStyle={styles.messagesList}
            spinnerRow={
              <View style={styles.spinnerRow}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            }
            renderItem={(m) => (
              <View
                style={[
                  styles.messageRow,
                  m.sender === "me"
                    ? styles.messageRowMe
                    : styles.messageRowThem,
                ]}>
                <View
                  style={[
                    styles.messageBubble,
                    m.sender === "me"
                      ? styles.messageBubbleMe
                      : styles.messageBubbleThem,
                  ]}>
                  <Text
                    style={
                      m.sender === "me"
                        ? styles.messageTextMe
                        : styles.messageTextThem
                    }>
                    {m.text}
                  </Text>
                  <Text
                    style={
                      m.sender === "me"
                        ? styles.messageTimestampMe
                        : styles.messageTimestampThem
                    }>
                    {m.time}
                  </Text>
                </View>
              </View>
            )}
            disable={disable}
            onScrollStart={onScrollStart}
            onScrollEnd={onScrollEnd}
            scrollViewProps={{
              keyboardDismissMode: "on-drag",
            }}
          />
        </View>

        {/* Jump to Bottom Button */}
        {showJump && (
          <TouchableOpacity
            onPress={onJump}
            style={styles.jumpButton}
            activeOpacity={0.8}>
            <Text style={styles.jumpButtonText}>
              {unreadCount > 0
                ? `New Messages (${unreadCount})`
                : "Scroll to Bottom"}{" "}
              ↓
            </Text>
          </TouchableOpacity>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Type a message..."
            placeholderTextColor="#9ca3af"
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={styles.sendButton}
            activeOpacity={0.8}>
            <Text style={styles.sendButtonText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  chatCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#ffffff",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },
  channelName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e293b",
  },
  historyCount: {
    fontSize: 9,
    color: "#9ca3af",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  onlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  onlineText: {
    fontSize: 9,
    color: "#22c55e",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 8,
  },
  spinnerRow: {
    padding: 16,
    alignItems: "center",
  },
  messageRow: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  messageRowMe: {
    alignItems: "flex-end",
  },
  messageRowThem: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  messageBubbleMe: {
    backgroundColor: "#2563eb",
    borderBottomRightRadius: 4,
  },
  messageBubbleThem: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  messageTextMe: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextThem: {
    color: "#1f2937",
    fontSize: 14,
    lineHeight: 20,
  },
  messageTimestampMe: {
    fontSize: 9,
    color: "#bfdbfe",
    fontWeight: "bold",
    letterSpacing: 0.5,
    textAlign: "right",
    marginTop: 4,
  },
  messageTimestampThem: {
    fontSize: 9,
    color: "#d1d5db",
    fontWeight: "bold",
    letterSpacing: 0.5,
    textAlign: "right",
    marginTop: 4,
  },
  jumpButton: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
    backgroundColor: "#4f46e5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  jumpButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1f2937",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 20,
    transform: [{ rotate: "90deg" }],
  },
});
