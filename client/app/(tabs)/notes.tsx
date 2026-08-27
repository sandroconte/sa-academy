import React, { useEffect, useState } from "react";
import { FlatList, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { listNotes, deleteNote } from "../../src/lib/notes";
import type { Note } from "../../src/lib/types";

type NoteRow = Note & { docTitle: string };

export default function NotesScreen() {
  const params = useLocalSearchParams<{ docId?: string }>();
  const docId = params.docId;
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [showAll, setShowAll] = useState(!docId);

  const load = async () => {
    const rows = await listNotes(showAll ? undefined : docId);
    setNotes(rows);
  };
  useEffect(() => {
    load();
  }, [docId, showAll]);

  const open = (n: NoteRow) => {
    router.push(`/doc/${n.docId}?anchor=${String(n.blockIndex)}`);
  };

  const renderItem = ({ item }: { item: NoteRow }) => {
    const inner = (
      <View style={s.row}>
        <Pressable style={{ flex: 1 }} onPress={() => open(item)}>
          <Text style={s.docTitle} numberOfLines={1} ellipsizeMode="tail">
            {item.docTitle}
          </Text>
          {item.sectionTitle ? <Text style={s.section}>{item.sectionTitle}</Text> : null}
          <Text style={s.quote} numberOfLines={2}>
            {item.quote}
          </Text>
        </Pressable>
        {Platform.OS === "web" ? (
          <Pressable style={s.delBtn} onPress={() => deleteNote(item.id).then(load)}>
            <Text style={s.delTxt}>🗑</Text>
          </Pressable>
        ) : null}
      </View>
    );

    if (Platform.OS === "web") return inner;
    return (
      <Swipeable
        renderRightActions={() => (
          <Pressable style={s.swipeDel} onPress={() => deleteNote(item.id).then(load)}>
            <Text style={s.delTxt}>Delete</Text>
          </Pressable>
        )}
      >
        {inner}
      </Swipeable>
    );
  };

  return (
    <FlatList
      data={notes}
      keyExtractor={(n) => n.id}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      ListHeaderComponent={
        docId && !showAll ? (
          <Pressable style={{ marginBottom: 8 }} onPress={() => setShowAll(true)}>
            <Text style={s.showAll}>Show all notes</Text>
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={<Text style={s.empty}>No notes yet — select text in a lesson to save one.</Text>}
    />
  );
}

const s = StyleSheet.create({
  row: { position: "relative", backgroundColor: "#11131a", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#8883" },
  docTitle: { color: "#8ab4f8", fontSize: 13, marginBottom: 2 },
  section: { color: "#888", fontSize: 12, marginBottom: 4 },
  quote: { color: "#e6e6e6", fontSize: 15, lineHeight: 22 },
  delBtn: { position: "absolute", top: 10, right: 10 },
  delTxt: { color: "#f87171", fontSize: 18 },
  swipeDel: { backgroundColor: "#ef4444", justifyContent: "center", paddingHorizontal: 24, borderRadius: 10 },
  showAll: { color: "#3b82f6", fontWeight: "600" },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
