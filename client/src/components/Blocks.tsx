import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import type { Block } from "../lib/types";
import { resolveImageUrl } from "../lib/images";

export function BlockView({ block, doc }: { block: Block; doc: { kind: "pattern" | "lecture"; category: string } }) {
  switch (block.type) {
    case "heading":
      return <Text style={block.level === 1 ? s.h1 : block.level === 2 ? s.h2 : s.h3}>{block.text}</Text>;
    case "paragraph":
      return <Text style={s.p}>{block.text}</Text>;
    case "blockquote":
      return <View style={s.quote}><Text style={s.p}>{block.text}</Text></View>;
    case "list":
      return <>{block.items?.map((it, i) => <Text key={i} style={s.li}>•  {it}</Text>)}</>;
    case "ordered-list":
      return <>{block.items?.map((it, i) => <Text key={i} style={s.li}>{i + 1}.  {it}</Text>)}</>;
    case "code":
      return (
        <View style={s.code}>
          <Text style={s.codeLang}>{block.lang}</Text>
          <Text style={s.codeText}>{block.value}</Text>
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
              {row.map((cell, ci) => <Text key={ci} style={s.td}>{cell}</Text>)}
            </View>
          ))}
        </View>
      );
  }
}

const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "700", marginTop: 8, marginBottom: 12 },
  h2: { fontSize: 21, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  h3: { fontSize: 17, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  p: { fontSize: 16, lineHeight: 24, marginBottom: 12 },
  li: { fontSize: 16, lineHeight: 24, marginBottom: 4 },
  quote: { borderLeftWidth: 3, borderLeftColor: "#8884", paddingLeft: 12, marginBottom: 12 },
  code: { backgroundColor: "#11131a", borderRadius: 8, padding: 12, marginBottom: 12 },
  codeLang: { color: "#8ab4f8", fontSize: 12, marginBottom: 6 },
  codeText: { color: "#e6e6e6", fontFamily: "monospace", fontSize: 13 },
  img: { width: "100%", height: 220, marginBottom: 12, borderRadius: 8 },
  table: { borderWidth: 1, borderColor: "#8884", borderRadius: 8, marginBottom: 12 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#8883" },
  th: { backgroundColor: "#8881" },
  td: { flex: 1, padding: 8, fontSize: 14 },
});
