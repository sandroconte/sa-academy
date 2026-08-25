import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, StyleSheet, Pressable } from "react-native";
import { getAllDocs } from "../../src/lib/queries";
import { DocRow } from "../../src/components/DocRow";
import type { PackDoc } from "../../src/lib/types";
import type { DocStatus } from "../../src/lib/progress";
import { useContent } from "../../src/stores/content";

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}>
      <Text style={active ? s.chipTxtOn : s.chipTxt}>{label}</Text>
    </Pressable>
  );
}

export default function Patterns() {
  const version = useContent((st) => st.version);
  const [docs, setDocs] = useState<(PackDoc & { status: DocStatus; percent: number })[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  useEffect(() => { getAllDocs("pattern").then(setDocs); }, [version]);
  const cats = useMemo(() => [...new Set(docs.map((d) => d.category))], [docs]);
  const filtered = useMemo(
    () => docs.filter((d) =>
      (!cat || d.category === cat) &&
      (!q || d.title.toLowerCase().includes(q.toLowerCase()))),
    [docs, q, cat],
  );

  return (
    <View style={{ flex: 1 }}>
      <TextInput style={s.search} placeholder="Filter patterns…" value={q} onChangeText={setQ} />
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={
          <View style={s.chips}>
            <Chip label="All" active={cat === null} onPress={() => setCat(null)} />
            {cats.map((c) => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}
          </View>
        }
        renderItem={({ item }) => <DocRow id={item.id} title={item.title} subtitle={item.category} status={item.status} />}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  search: { margin: 16, marginBottom: 8, borderWidth: 1, borderColor: "#0002", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#0001" },
  chipOn: { backgroundColor: "#3b82f6" },
  chipTxt: { fontSize: 12 },
  chipTxtOn: { fontSize: 12, color: "white", fontWeight: "600" },
});
