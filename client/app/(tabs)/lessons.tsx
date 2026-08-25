import React, { useEffect, useState } from "react";
import { SectionList, Text, StyleSheet, RefreshControl } from "react-native";
import { getAllDocs } from "../../src/lib/queries";
import { DocRow } from "../../src/components/DocRow";
import type { PackDoc } from "../../src/lib/types";
import type { DocStatus } from "../../src/lib/progress";
import { useContent } from "../../src/stores/content";

type Doc = PackDoc & { status: DocStatus; percent: number };

export default function Lessons() {
  const version = useContent((st) => st.version);
  const syncing = useContent((st) => st.syncing);
  const refresh = useContent((st) => st.refresh);
  const [sections, setSections] = useState<{ title: string; data: Doc[] }[]>([]);

  useEffect(() => {
    (async () => {
      const lectures = await getAllDocs("lecture");
      const secs: { title: string; data: Doc[] }[] = [];
      secs.push({
        title: lectures.length > 0 ? "🎓 Your Lectures" : "🎓 Your Lectures — empty",
        data: lectures,
      });
      setSections(secs);
    })();
  }, [version]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DocRow id={item.id} title={item.title} subtitle="lecture" status={item.status} />}
      renderSectionHeader={({ section }) => <Text style={s.header}>{section.title}</Text>}
      ListEmptyComponent={<Text style={s.empty}>Push .md files to sandroconte/lectures → solution-architecture/ and pull to refresh.</Text>}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} />}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

const s = StyleSheet.create({
  header: { fontSize: 18, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  empty: { color: "#777", textAlign: "center", marginTop: 24 },
});
