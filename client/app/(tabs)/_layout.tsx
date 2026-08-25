import { Tabs, Link } from "expo-router";
import React from "react";
import { Pressable, Text } from "react-native";

function HeaderSearch() {
  return (
    <Link href="/search" asChild>
      <Pressable hitSlop={8} style={{ paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 18 }}>🔍</Text>
      </Pressable>
    </Link>
  );
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="learn" options={{ title: "Learn", headerRight: HeaderSearch }} />
      <Tabs.Screen name="patterns" options={{ title: "Patterns", headerRight: HeaderSearch }} />
      <Tabs.Screen name="lessons" options={{ title: "Lessons", headerRight: HeaderSearch }} />
      <Tabs.Screen name="practice" options={{ title: "Practice", headerRight: HeaderSearch }} />
    </Tabs>
  );
}
