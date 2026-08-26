import React, { useEffect, useState } from "react";
import { TextInput, FlatList, Pressable, Text, StyleSheet, View } from "react-native";
import { Link, Stack } from "expo-router";
import { searchDocs } from "../src/lib/queries";
import { buildFtsQuery } from "../src/lib/searchquery";

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ docId: string; snippet: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      searchDocs(buildFtsQuery(q))
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Search" }} />
      <TextInput
        style={s.input}
        autoFocus
        placeholder="Search lessons, patterns…"
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={results}
        keyExtractor={(r) => r.docId}
        renderItem={({ item }) => (
          <Link href={`/doc/${item.docId}`} asChild>
            <Pressable style={s.row}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={s.snippet}>
                  {item.snippet.replace(/<\/?b>/g, "")}
                </Text>
              </View>
              <Text style={s.arrow}>›</Text>
            </Pressable>
          </Link>
        )}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={q.trim().length > 0 ? <Text style={s.empty}>No results.</Text> : null}
      />
    </View>
  );
}

const s = StyleSheet.create({
  input: { margin: 16, borderWidth: 1, borderColor: "#0002", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#0002" },
  snippet: { fontSize: 15 },
  arrow: { fontSize: 18, color: "#999", paddingLeft: 8 },
  empty: { color: "#888", textAlign: "center", marginTop: 24 },
});
