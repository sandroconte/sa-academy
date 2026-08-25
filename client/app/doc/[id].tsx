import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { getDocsByIds, setStatus, setPercent } from "../../src/lib/queries";
import { BlockView } from "../../src/components/Blocks";
import { displayTitle, type PackDoc } from "../../src/lib/types";
import { useContent } from "../../src/stores/content";
import type { DocStatus } from "../../src/lib/progress";

export default function DocScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const version = useContent((st) => st.version); // re-read after sync
  const [doc, setDoc] = useState<(PackDoc & { status: DocStatus; percent: number }) | null>(null);

  useEffect(() => {
    if (!id) return;
    getDocsByIds([id]).then((r) => setDoc(r[0] ?? null));
  }, [id, version]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!id) return;
      const { height } = e.nativeEvent.contentSize;
      const visible = e.nativeEvent.layoutMeasurement.height;
      const pct = Math.min(100, Math.round(((e.nativeEvent.contentOffset.y + visible) / Math.max(height, 1)) * 100));
      void setPercent(id, pct);
    },
    [id],
  );

  if (!doc) return <ActivityIndicator style={{ flex: 1 }} />;
  const read = doc.status === "read";

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: displayTitle(doc.title) }} />
      <View style={s.barWrap}><View style={[s.bar, { width: `${Math.max(doc.percent, 2)}%` as `${number}%` }]} /></View>
      <ScrollView onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={s.content}>
        <Text style={s.meta}>{doc.category} · {doc.readingMin} min · {doc.status}</Text>
        {doc.blocks.map((b, i) => <BlockView key={i} block={b} doc={doc} />)}
      </ScrollView>
      <Pressable
        style={[s.markBtn, read && s.marked]}
        onPress={async () => {
          await setStatus(doc.id, read ? "reading" : "read");
          setDoc({ ...doc, status: read ? "reading" : "read" });
        }}
      >
        <Text style={s.markTxt}>{read ? "✓ Read — undo" : "Mark as read"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  barWrap: { height: 3, backgroundColor: "#0001" },
  bar: { height: 3, backgroundColor: "#3b82f6" },
  content: { padding: 16, paddingBottom: 96 },
  meta: { color: "#888", fontSize: 12, marginBottom: 12, textTransform: "uppercase" },
  markBtn: { position: "absolute", bottom: 24, right: 24, backgroundColor: "#3b82f6", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },
  marked: { backgroundColor: "#16a34a" },
  markTxt: { color: "white", fontWeight: "600" },
});
