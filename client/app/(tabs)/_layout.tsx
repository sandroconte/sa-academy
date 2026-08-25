import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="learn" options={{ title: "Learn" }} />
      <Tabs.Screen name="patterns" options={{ title: "Patterns" }} />
      <Tabs.Screen name="lessons" options={{ title: "Lessons" }} />
      <Tabs.Screen name="practice" options={{ title: "Practice" }} />
    </Tabs>
  );
}
