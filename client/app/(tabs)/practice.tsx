import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function PracticePlaceholder() {
  return (
    <View style={s.center}>
      <Text style={s.txt}>Practice — arriving in the next task</Text>
    </View>
  );
}
const s = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" }, txt: { color: "#888" } });
