import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";
import { getModules, getDocsByIds, markModuleDocs } from "../../src/lib/queries";
import { moduleStats, type DocStatus } from "../../src/lib/progress";
import { Ring } from "../../src/components/Ring";
import { DocRow } from "../../src/components/DocRow";
import { displayTitle, type PackDoc } from "../../src/lib/types";
import { useContent } from "../../src/stores/content";

export default function Learn() {
  const version = useContent((st) => st.version);
  const [modules, setModules] = useState<Awaited<ReturnType<typeof getModules>>>([]);
  const [docsMap, setDocsMap] = useState<Map<string, PackDoc & { status: DocStatus; percent: number }>>(new Map());
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const mods = await getModules();
    const all = await getDocsByIds(mods.flatMap((m) => m.docIds));
    setModules(mods);
    setDocsMap(new Map(all.map((d) => [d.id, d])));
  }, []);

  useEffect(() => {
    void load();
  }, [version, load]);

  const firstUnread = modules.flatMap((m) => m.docIds).find((id) => { const d = docsMap.get(id); return d && d.status !== "read"; });

  return (
    <FlatList
      data={modules}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={
        firstUnread ? (
          <Link href={`/doc/${firstUnread}`} asChild>
            <Pressable style={s.continue}>
              <Text style={s.continueLabel}>Continue</Text>
              <Text style={s.continueTitle}>{displayTitle(docsMap.get(firstUnread)?.title ?? "")}</Text>
            </Pressable>
          </Link>
        ) : null
      }
      renderItem={({ item }) => {
        const docs = item.docIds.map((id) => docsMap.get(id)).filter(Boolean) as (PackDoc & { status: DocStatus })[];
        const stats = moduleStats(docs.map((d) => d.status));
        const expanded = open === item.id;
        return (
          <View style={s.card}>
            <Pressable style={s.head} onPress={() => setOpen(expanded ? null : item.id)}>
              <Ring percent={stats.percent} />
              <View style={{ flex: 1 }}>
                <Text style={s.modTitle}>{item.title}</Text>
                <Text style={s.modSub}>{stats.done}/{stats.total} read</Text>
              </View>
              {expanded && (
                <Pressable
                  hitSlop={8}
                  onPress={async () => {
                    await markModuleDocs(item.id, "read");
                    await load();
                  }}
                >
                  <Text style={s.markAllTxt}>Mark all read</Text>
                </Pressable>
              )}
              <Text>{expanded ? "▾" : "▸"}</Text>
            </Pressable>
            {expanded && docs.map((d) => (
              <DocRow key={d.id} id={d.id} title={d.title} subtitle={`${d.readingMin} min`} status={d.status} />
            ))}
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No content yet</Text>
          <Text style={s.emptyTxt}>
            Open the Lessons tab and pull down to sync. Content downloads once and then works offline.
          </Text>
        </View>
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    />
  );
}

const s = StyleSheet.create({
  continue: { backgroundColor: "#3b82f6", borderRadius: 12, padding: 16, marginBottom: 4 },
  continueLabel: { color: "#dbeafe", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  continueTitle: { color: "white", fontSize: 17, fontWeight: "700", marginTop: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#0002", borderRadius: 12 },
  head: { flexDirection: "row", gap: 12, alignItems: "center", padding: 12 },
  markAllTxt: { color: "#3b82f6", fontWeight: "600", fontSize: 13 },
  modTitle: { fontSize: 16, fontWeight: "700", color: "#f2f2f2" },
  modSub: { fontSize: 12, color: "#777" },
  empty: { alignItems: "center", marginTop: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#666" },
  emptyTxt: { fontSize: 14, color: "#999", textAlign: "center", lineHeight: 20 },
});
