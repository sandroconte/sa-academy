import React, { type ReactNode } from "react";
import { View, Text, TextInput, Image, StyleSheet, Platform } from "react-native";
import type { NativeSyntheticEvent, StyleProp, TextStyle } from "react-native";
import type { Block, Note } from "../lib/types";
import { resolveImageUrl } from "../lib/images";
import { segmentsForHighlights, type HighlightRange } from "../lib/highlights";

interface BlockViewProps {
  block: Block;
  doc: { kind: "pattern" | "lecture"; category: string };
  blockIndex?: number;
  notes?: Note[];
  onSelect?: (blockIndex: number, quote: string, start: number, end: number) => void;
}

export function BlockView({ block, doc, blockIndex, notes, onSelect }: BlockViewProps) {
  const isWeb = Platform.OS === "web";

  // web: tag the DOM node so the reader's selectionchange listener can map back to a block
  const webAttr =
    isWeb && blockIndex !== undefined
      ? // react-native-web forwards data-* to the underlying textarea
        ({ "data-blockindex": String(blockIndex) } as Record<string, string>)
      : {};

  const makeSelect =
    (text?: string) =>
    (e: NativeSyntheticEvent<{ selection: { start: number; end: number } }>) => {
      if (!onSelect || blockIndex === undefined) return;
      const t = text ?? "";
      const { start, end } = e.nativeEvent.selection;
      // native selection: report quote + offsets; collapse → clear
      if (end > start) onSelect(blockIndex, t.slice(start, end), start, end);
      else onSelect(blockIndex, "", -1, -1);
    };

  // Renders the block text with highlight spans. RN TextInput accepts nested
  // <Text> children (it wraps them in <Text>), so per-span highlight
  // backgrounds work while still allowing native text selection.
  const segments = (text: string): ReactNode => {
    if (!text) return null;
    if (!notes || notes.length === 0) return text;
    const segs = segmentsForHighlights(
      text,
      notes.map((n): HighlightRange => ({ start: n.start, end: n.end, quote: n.quote })),
    );
    return segs.map((seg, i) =>
      seg.highlighted ? (
        <Text key={i} style={s.hl}>
          {seg.text}
        </Text>
      ) : (
        <Text key={i}>{seg.text}</Text>
      ),
    );
  };

  // Read-only multiline TextInput: gives us BOTH inline highlight rendering
  // (nested Text) AND native selection capture (onSelectionChange), which the
  // plain <Text> component does not support in RN 0.86.
  const Selectable = ({
    textStyle,
    text,
    selectHandler,
  }: {
    textStyle: StyleProp<TextStyle>;
    text: string;
    selectHandler?: (e: NativeSyntheticEvent<{ selection: { start: number; end: number } }>) => void;
  }) => (
    <TextInput
      editable={false}
      multiline
      scrollEnabled={false}
      underlineColorAndroid="transparent"
      style={[textStyle, s.inputBase]}
      onSelectionChange={selectHandler}
      {...webAttr}
    >
      {segments(text)}
    </TextInput>
  );

  switch (block.type) {
    case "heading":
      return (
        <Selectable
          textStyle={block.level === 1 ? s.h1 : block.level === 2 ? s.h2 : s.h3}
          text={block.text ?? ""}
          selectHandler={isWeb ? undefined : makeSelect(block.text)}
        />
      );
    case "paragraph":
      return (
        <Selectable textStyle={s.p} text={block.text ?? ""} selectHandler={isWeb ? undefined : makeSelect(block.text)} />
      );
    case "blockquote":
      return (
        <View style={s.quote}>
          <Selectable textStyle={s.p} text={block.text ?? ""} selectHandler={isWeb ? undefined : makeSelect(block.text)} />
        </View>
      );
    case "list":
      return (
        <>
          {block.items?.map((it, i) => (
            <Selectable key={i} textStyle={s.li} text={it} selectHandler={isWeb ? undefined : makeSelect(it)} />
          ))}
        </>
      );
    case "ordered-list":
      return (
        <>
          {block.items?.map((it, i) => (
            <Selectable key={i} textStyle={s.li} text={`${i + 1}.  ${it}`} selectHandler={isWeb ? undefined : makeSelect(it)} />
          ))}
        </>
      );
    case "code":
      return (
        <View style={s.code}>
          <Text style={s.codeLang}>{block.lang}</Text>
          <Selectable textStyle={s.codeText} text={block.value ?? ""} selectHandler={isWeb ? undefined : makeSelect(block.value)} />
        </View>
      );
    case "image":
      return block.url ? (
        <Image source={{ uri: resolveImageUrl(doc, block.url) }} style={s.img} resizeMode="contain" />
      ) : null;
    case "table":
      return (
        <View style={s.table}>
          {(block.rows ?? []).map((row, ri) => (
            <View key={ri} style={[s.tr, ri === 0 && s.th]}>
              {row.map((cell, ci) => (
                <Text key={ci} style={s.td}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

const s = StyleSheet.create({
  h1: { color: "#f5f5f5", fontSize: 26, fontWeight: "700", marginTop: 8, marginBottom: 12 },
  h2: { color: "#f5f5f5", fontSize: 21, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  h3: { color: "#f5f5f5", fontSize: 17, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  p: { color: "#d6d6d6", fontSize: 16, lineHeight: 24, marginBottom: 12 },
  li: { color: "#d6d6d6", fontSize: 16, lineHeight: 24, marginBottom: 4 },
  quote: { borderLeftWidth: 3, borderLeftColor: "#8884", paddingLeft: 12, marginBottom: 12 },
  code: { backgroundColor: "#11131a", borderRadius: 8, padding: 12, marginBottom: 12 },
  codeLang: { color: "#8ab4f8", fontSize: 12, marginBottom: 6 },
  codeText: { color: "#e6e6e6", fontFamily: "monospace", fontSize: 13 },
  img: { width: "100%", height: 220, marginBottom: 12, borderRadius: 8 },
  table: { borderWidth: 1, borderColor: "#8884", borderRadius: 8, marginBottom: 12 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#8883" },
  th: { backgroundColor: "#8881" },
  td: { color: "#d6d6d6", flex: 1, padding: 8, fontSize: 14 },
  hl: { backgroundColor: "#3b82f655", borderRadius: 3 },
  inputBase: { padding: 0, borderWidth: 0, backgroundColor: "transparent" },
});
