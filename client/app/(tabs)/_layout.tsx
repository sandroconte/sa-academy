import { Tabs, Link } from "expo-router";
import React from "react";
import { Pressable, Text, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";

function HeaderSearch() {
  return (
    <Link href="/search" asChild>
      <Pressable hitSlop={8} style={{ paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 18 }}>🔍</Text>
      </Pressable>
    </Link>
  );
}

function TabIcon({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: ColorValue }) {
  return <Ionicons name={name} size={22} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#888",
      }}
    >
      <Tabs.Screen
        name="learn"
        options={{ title: "Learn", headerRight: HeaderSearch, tabBarIcon: (p) => <TabIcon name="school" color={p.color} /> }}
      />
      <Tabs.Screen
        name="patterns"
        options={{ title: "Patterns", headerRight: HeaderSearch, tabBarIcon: (p) => <TabIcon name="grid" color={p.color} /> }}
      />
      <Tabs.Screen
        name="lessons"
        options={{ title: "Lessons", headerRight: HeaderSearch, tabBarIcon: (p) => <TabIcon name="book" color={p.color} /> }}
      />
      <Tabs.Screen
        name="practice"
        options={{ title: "Practice", headerRight: HeaderSearch, tabBarIcon: (p) => <TabIcon name="barbell" color={p.color} /> }}
      />
    </Tabs>
  );
}
