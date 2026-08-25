import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";
import {
  getAllDocs,
  getExercisesForDoc,
  getExercisesByIds,
  getMissedExerciseIds,
  recordAttempt,
} from "../../src/lib/queries";
import { grade } from "../../src/lib/grading";
import { buildSession, type SessionItem } from "../../src/lib/session";
import type { Exercise } from "../../src/lib/types";

type Phase =
  | { name: "pick" }
  | { name: "quiz"; idx: number }
  | { name: "done"; correct: number; total: number };

function toSessionItem(e: Exercise & { docId: string }): SessionItem {
  return { exerciseId: e.id, docId: e.docId, type: e.type, payload: e.payload, answerKey: e.answerKey };
}

export default function Practice() {
  const [phase, setPhase] = useState<Phase>({ name: "pick" });
  const [queue, setQueue] = useState<SessionItem[]>([]);
  const [answersCorrect, setAnswersCorrect] = useState<boolean[]>([]);
  const [matchingOrder, setMatchingOrder] = useState<number[]>([]);
  const [orderingOrder, setOrderingOrder] = useState<number[] | null>(null);

  const start = useCallback(async (mode: "mixed" | "review") => {
    let items: SessionItem[];
    if (mode === "review") {
      const missedIds = await getMissedExerciseIds(50);
      items = (await getExercisesByIds(missedIds)).map(toSessionItem);
      if (items.length === 0) return; // nothing to review yet
    } else {
      const docs = await getAllDocs();
      let pool: SessionItem[] = [];
      for (const d of docs) {
        const exs = await getExercisesForDoc(d.id);
        pool.push(...exs.map(toSessionItem));
      }
      items = pool;
    }
    setQueue(buildSession(items, 10));
    setAnswersCorrect([]);
    setPhase({ name: "quiz", idx: 0 });
  }, []);

  const current = phase.name === "quiz" ? queue[phase.idx] : undefined;

  const submit = useCallback(
    async (answer: number | boolean | number[]) => {
      if (!current || phase.name !== "quiz") return;
      const ok = grade(
        { id: current.exerciseId, type: current.type, payload: current.payload, answerKey: current.answerKey },
        answer,
      );
      await recordAttempt(current.exerciseId, current.docId, ok);
      const nextCorrect = [...answersCorrect, ok];
      setAnswersCorrect(nextCorrect);
      setMatchingOrder([]);
      setOrderingOrder(null);
      if (phase.idx + 1 >= queue.length) {
        setPhase({ name: "done", correct: nextCorrect.filter(Boolean).length, total: queue.length });
      } else {
        setPhase({ name: "quiz", idx: phase.idx + 1 });
      }
    },
    [current, phase, queue.length, answersCorrect],
  );

  if (phase.name === "pick")
    return (
      <View style={s.center}>
        <Text style={s.hint}>Sessions mix cloze, MCQ, matching, true/false and ordering.</Text>
        <Pressable style={s.bigBtn} onPress={() => start("mixed")}>
          <Text style={s.bigTxt}>Start session (10)</Text>
        </Pressable>
        <Pressable style={[s.bigBtn, s.alt]} onPress={() => start("review")}>
          <Text style={s.bigTxtAlt}>Review missed</Text>
        </Pressable>
      </View>
    );

  if (phase.name === "done")
    return (
      <View style={s.center}>
        <Text style={s.score}>{phase.correct}/{phase.total}</Text>
        <Pressable style={s.bigBtn} onPress={() => setPhase({ name: "pick" })}>
          <Text style={s.bigTxt}>Again</Text>
        </Pressable>
      </View>
    );

  const p = current!.payload as Record<string, unknown>;
  return (
    <ScrollView contentContainerStyle={s.quiz}>
      <Text style={s.counter}>{phase.idx + 1} / {queue.length} · {current!.type}</Text>

      {"prompt" in p && <Text style={s.prompt}>{String(p.prompt)}</Text>}
      {"statement" in p && <Text style={s.prompt}>{String(p.statement)}</Text>}

      {current!.type === "truefalse" && (
        <View style={s.rowBtns}>
          <Pressable style={[s.opt, { backgroundColor: "#dc2626" }]} onPress={() => submit(false)}>
            <Text style={s.optTxt}>False</Text>
          </Pressable>
          <Pressable style={[s.opt, { backgroundColor: "#16a34a" }]} onPress={() => submit(true)}>
            <Text style={s.optTxt}>True</Text>
          </Pressable>
        </View>
      )}

      {(current!.type === "cloze" || current!.type === "mcq") && Array.isArray(p.options) &&
        (p.options as string[]).map((opt, i) => (
          <Pressable key={i} style={s.opt} onPress={() => submit(i)}>
            <Text style={s.optTxt}>{opt}</Text>
          </Pressable>
        ))}

      {current!.type === "matching" && (() => {
        const left = p.pairsLeft as unknown as string[];
        const right = p.pairsRight as unknown as string[];
        const chosen = matchingOrder;
        const ready = left.length > 0 && chosen.length === left.length && chosen.every((c) => c >= 0);
        return (
          <View>
            {left.map((term, li) => (
              <View key={li} style={s.matchRow}>
                <Text style={s.matchTerm}>{term}</Text>
                <TextInput
                  style={s.matchInput}
                  placeholder="#"
                  value={chosen[li] !== undefined && chosen[li]! >= 0 ? String(chosen[li]! + 1) : ""}
                  onChangeText={(t) => {
                    const n = parseInt(t, 10);
                    const next = [...chosen];
                    next[li] = Number.isNaN(n) ? -1 : n - 1;
                    setMatchingOrder(next);
                  }}
                  keyboardType="number-pad"
                />
              </View>
            ))}
            {right.map((def, ri) => (
              <Text key={ri} style={s.defItem}>{ri + 1}. {def}</Text>
            ))}
            <Pressable
              style={[s.bigBtn, !ready && s.disabled]}
              disabled={!ready}
              onPress={() => submit(left.map((_, li) => chosen[li]!))}
            >
              <Text style={s.bigTxt}>Submit</Text>
            </Pressable>
          </View>
        );
      })()}

      {current!.type === "ordering" && (() => {
        const items = p.items as unknown as string[];
        const order = orderingOrder ?? items.map((_, i) => i);
        const move = (from: number, dir: -1 | 1) => {
          const to = from + dir;
          if (to < 0 || to >= order.length) return;
          const next = [...order];
          [next[from], next[to]] = [next[to]!, next[from]!];
          setOrderingOrder(next);
        };
        return (
          <View>
            {order.map((itemIdx, pos) => (
              <View key={pos} style={s.orderRow}>
                <Text style={s.orderTxt}>{items[itemIdx]}</Text>
                <Pressable onPress={() => move(pos, -1)}><Text style={s.orderBtn}>↑</Text></Pressable>
                <Pressable onPress={() => move(pos, 1)}><Text style={s.orderBtn}>↓</Text></Pressable>
              </View>
            ))}
            <Pressable style={s.bigBtn} onPress={() => submit(order)}>
              <Text style={s.bigTxt}>Submit</Text>
            </Pressable>
          </View>
        );
      })()}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  hint: { textAlign: "center", color: "#666" },
  bigBtn: { backgroundColor: "#3b82f6", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14, width: "80%", alignItems: "center" },
  alt: { backgroundColor: "#0001" },
  bigTxt: { color: "white", fontWeight: "700" },
  bigTxtAlt: { fontWeight: "600", color: "#333" },
  disabled: { opacity: 0.4 },
  score: { fontSize: 42, fontWeight: "800" },
  quiz: { padding: 16, gap: 10 },
  counter: { color: "#888", fontSize: 12, textTransform: "uppercase" },
  prompt: { fontSize: 18, fontWeight: "600", lineHeight: 26, marginBottom: 8 },
  rowBtns: { flexDirection: "row", gap: 10 },
  opt: { backgroundColor: "#3b82f6ee", borderRadius: 10, padding: 14 },
  optTxt: { color: "white", fontWeight: "600" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  matchTerm: { flex: 1, fontWeight: "600" },
  matchInput: { width: 70, borderWidth: 1, borderColor: "#0003", borderRadius: 8, padding: 8, textAlign: "center" },
  defItem: { fontSize: 13, color: "#555", lineHeight: 19 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#0001", borderRadius: 8, padding: 10, marginBottom: 6 },
  orderTxt: { flex: 1, fontSize: 14 },
  orderBtn: { fontSize: 18, paddingHorizontal: 8 },
});
