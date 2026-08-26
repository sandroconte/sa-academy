import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { displayTitle } from "../lib/types";

export function DocRow({ id, title, subtitle, status }: { id: string; title: string; subtitle?: string; status: string }) {
  return (
    <Link href={`/doc/${id}`} asChild>
      <Pressable style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{displayTitle(title)}</Text>
          {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
        </View>
        <Text style={s.badge}>{status === "read" ? "✓" : status === "reading" ? "◐" : ""}</Text>
      </Pressable>
    </Link>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#0002", gap: 8 },
  title: { fontSize: 16, fontWeight: "500", color: "#f2f2f2" },
  sub: { fontSize: 12, color: "#777", marginTop: 2 },
  badge: { fontSize: 16, color: "#16a34a", width: 22, textAlign: "center" },
});
