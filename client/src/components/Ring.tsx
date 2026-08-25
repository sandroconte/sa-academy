import React from "react";
import { View, Text, StyleSheet } from "react-native";

export function Ring({ percent, size = 44 }: { percent: number; size?: number }) {
  const color = percent >= 1 ? "#16a34a" : percent > 0 ? "#3b82f6" : "#8884";
  return (
    <View style={[s.wrap, { width: size, height: size, borderColor: color }]}>
      <Text style={s.txt}>{Math.round(percent * 100)}%</Text>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { borderRadius: 999, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  txt: { fontSize: 10, fontWeight: "700", color: "#666" },
});
