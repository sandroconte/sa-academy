import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { getDocsByIds, setStatus, setPercent } from "../../src/lib/queries";
import { BlockView } from "../../src/components/Blocks";
import { displayTitle, type PackDoc } from "../../src/lib/types";
import { useContent } from "../../src/stores/content";
import type { DocStatus } from "../../src/lib/progress";
import { addNote, getNotesByBlock } from "../../src/lib/notes";
import { deriveSectionTitle } from "../../src/lib/highlights";
import type { Note } from "../../src/lib/types";

interface Selection {
  blockIndex: number;
  quote: string;
  start: number;
  end: number;
  rect?: { x: number; y: number; width: number; height: number };
}

export default function DocScreen() {
  const { id, anchor } = useLocalSearchParams<{ id: string; anchor?: string }>();
  const router = useRouter();
  const version = useContent((st) => st.version);
  const [doc, setDoc] = useState<(PackDoc & { status: DocStatus; percent: number }) | null>(null);
  const [livePct, setLivePct] = useState<number | null>(null);
  const lastWrittenRef = useRef<number>(-1);
  const [notesByBlock, setNotesByBlock] = useState<Map<number, Note[]>>(new Map());
  const [selection, setSelection] = useState<Selection | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const blockRefs = useRef<Map<number, View>>(new Map());

  useEffect(() => {
    if (!id) return;
    setLivePct(null);
    getDocsByIds([id]).then((r) => setDoc(r[0] ?? null));
    getNotesByBlock(id).then(setNotesByBlock);
  }, [id, version]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!id) return;
      const { height } = e.nativeEvent.contentSize;
      const visible = e.nativeEvent.layoutMeasurement.height;
      const pct = Math.min(100, Math.round(((e.nativeEvent.contentOffset.y + visible) / Math.max(height, 1)) * 100));
      setLivePct(pct);
      if (pct !== lastWrittenRef.current) {
        lastWrittenRef.current = pct;
        void setPercent(id, pct);
      }
    },
    [id],
  );

  // native selection (read-only TextInput onSelectionChange in BlockView)
  const handleSelect = useCallback((blockIndex: number, quote: string, start: number, end: number) => {
    if (!quote) {
      setSelection(null);
      return;
    }
    setSelection({ blockIndex, quote, start, end });
  }, []);

  // web selection (document selectionchange → map via data-blockindex)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const docEl = (globalThis as unknown as { document?: Document }).document;
    const win = (globalThis as unknown as { window?: Window }).window;
    if (!docEl || !win) return;
    const onSel = () => {
      const sel = win.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const el = range.startContainer.parentElement?.closest("[data-blockindex]") as HTMLElement | null;
      if (!el) {
        setSelection(null);
        return;
      }
      const blockIndex = Number(el.getAttribute("data-blockindex"));
      const quote = sel.toString();
      if (!quote || Number.isNaN(blockIndex)) {
        setSelection(null);
        return;
      }
      const r = range.getBoundingClientRect();
      setSelection({ blockIndex, quote, start: -1, end: -1, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
    };
    docEl.addEventListener("selectionchange", onSel);
    return () => docEl.removeEventListener("selectionchange", onSel);
  }, []);

  // jump-to-section when opened with ?anchor=blockIndex
  useEffect(() => {
    if (!anchor || !doc) return;
    const idx = Number(anchor);
    const t = setTimeout(() => {
      const ref = blockRefs.current.get(idx);
      if (!ref) return;
      if (Platform.OS === "web") {
        (ref as unknown as HTMLElement).scrollIntoView?.({ behavior: "smooth", block: "start" });
      } else {
        ref.measure((_x, _y, _w, _h, _px, py) =>
          scrollRef.current?.scrollTo({ y: Math.max(0, py - 80), animated: true }),
        );
      }
    }, 120);
    return () => clearTimeout(t);
  }, [anchor, doc]);

  const handleSave = async () => {
    if (!selection || !doc) return;
    const sectionTitle = deriveSectionTitle(doc.blocks, selection.blockIndex);
    const note = await addNote({
      docId: doc.id,
      blockIndex: selection.blockIndex,
      sectionTitle,
      quote: selection.quote,
      start: selection.start,
      end: selection.end,
    });
    setNotesByBlock((prev) => {
      const next = new Map(prev);
      const arr = next.get(selection.blockIndex) ?? [];
      if (!arr.some((n) => n.id === note.id)) {
        next.set(selection.blockIndex, [...arr, note]);
      }
      return next;
    });
    setSelection(null);
  };

  if (!doc) return <ActivityIndicator style={{ flex: 1 }} />;
  const read = doc.status === "read";

  const pillStyle =
    Platform.OS === "web" && selection?.rect
      ? { position: "absolute" as const, top: selection.rect.y - 44, left: selection.rect.x + selection.rect.width / 2 - 70, right: undefined }
      : { position: "absolute" as const, top: 80, left: 0, right: 0, alignItems: "center" as const };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: displayTitle(doc.title),
          headerRight: () => (
            <Pressable
              style={{ paddingHorizontal: 12 }}
              onPress={() => router.push(`/notes?docId=${doc.id}` as Href)}
            >
              <Text style={{ fontSize: 20 }}>📝</Text>
            </Pressable>
          ),
        }}
      />
      <View style={s.barWrap}>
        <View style={[s.bar, { width: `${Math.max(livePct ?? doc.percent, 2)}%` as `${number}%` }]} />
      </View>
      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={s.content}>
        <Text style={s.meta}>{doc.category} · {doc.readingMin} min · {doc.status}</Text>
        <Pressable style={s.practiceBtn} onPress={() => router.push({ pathname: "/practice", params: { doc: id! } })}>
          <Text style={s.practiceTxt}>▶ Practice this lesson</Text>
        </Pressable>
        {doc.blocks.map((b, i) => (
          <View key={i} ref={(ref) => { if (ref) blockRefs.current.set(i, ref); }}>
            <BlockView
              block={b}
              doc={doc}
              blockIndex={i}
              notes={notesByBlock.get(i)}
              onSelect={handleSelect}
            />
          </View>
        ))}
      </ScrollView>

      {selection && (
        <View style={[s.pillWrap, pillStyle]} pointerEvents="box-none">
          <Pressable style={s.pill} onPress={handleSave}>
            <Text style={s.pillTxt}>📝 Save note</Text>
          </Pressable>
        </View>
      )}

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
  practiceBtn: { alignSelf: "flex-start", backgroundColor: "#3b82f61a", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  practiceTxt: { color: "#1d4ed8", fontWeight: "600", fontSize: 14 },
  markBtn: { position: "absolute", bottom: 24, right: 24, backgroundColor: "#3b82f6", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },
  marked: { backgroundColor: "#16a34a" },
  markTxt: { color: "white", fontWeight: "600" },
  pillWrap: { zIndex: 50 },
  pill: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#3b82f6", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6 },
  pillTxt: { color: "#fff", fontWeight: "600" },
});
