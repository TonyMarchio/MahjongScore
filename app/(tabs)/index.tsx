import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from './explore';
import { CAMERA_PREFILL_KEY } from './camera';
import { PATTERNS, calculateTai, calculatePayments, getPatternsByCategory, getNextDealerPlayerId } from '@/utils/scoring';
import { GameState, Player, ScoredHand, PatternCategory } from '@/utils/types';

// ─── Category display config ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PatternCategory, string> = {
  situational:  '📍 Situational',
  hand_quality: '🤲 Hand Quality',
  flowers:      '🌸 Flowers & Honors',
  pengs_kongs:  '🀄 Pengs & Kongs',
  hand_shape:   '🃏 Hand Shape',
  special:      '⭐ Special Hands',
};

const CATEGORY_ORDER: PatternCategory[] = [
  'situational', 'hand_quality', 'flowers', 'pengs_kongs', 'hand_shape', 'special',
];

const AUTO_HANDLED = ['zi_mo', 'mei_ge_hua', 'wu_hua', 'wu_zi', 'wu_hua_wu_zi'];

// ─── Default game state (used if none saved) ──────────────────────────────────

const DEFAULT_GAME: GameState = {
  prevalingWind: 'east',
  stakePerTai: 0.25,
  dealerPlayerId: 'p1',
  handNumber: 0,
  players: [
    { id: 'p1', name: 'Player 1', seatWind: 'east',  score: 0 },
    { id: 'p2', name: 'Player 2', seatWind: 'south', score: 0 },
    { id: 'p3', name: 'Player 3', seatWind: 'west',  score: 0 },
    { id: 'p4', name: 'Player 4', seatWind: 'north', score: 0 },
  ],
  rounds: [],
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScoreHandScreen() {
  const insets = useSafeAreaInsets();
  const [game, setGame] = useState<GameState>(DEFAULT_GAME);
  const [winnerId, setWinnerId] = useState<string>('p1');
  const [isSelfDraw, setIsSelfDraw] = useState(true);
  const [discarderId, setDiscarderId] = useState<string>('p2');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [flowerCount, setFlowerCount] = useState(0);
  const [noHonors, setNoHonors] = useState(false);
  const [scored, setScored] = useState(false);
  const [result, setResult] = useState<ScoredHand | null>(null);

  // Reload game state and apply any camera prefill every time this tab comes into focus
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY).then(raw => {
        try {
          if (raw) setGame(JSON.parse(raw));
        } catch {}
      });

      AsyncStorage.getItem(CAMERA_PREFILL_KEY).then(raw => {
        if (!raw) return;
        try {
          const prefill = JSON.parse(raw);
          if (prefill.flowerCount !== undefined) setFlowerCount(prefill.flowerCount);
          if (prefill.noHonors !== undefined) setNoHonors(prefill.noHonors);
          if (prefill.patternIds?.length) setSelectedIds(new Set(prefill.patternIds));
          AsyncStorage.removeItem(CAMERA_PREFILL_KEY);
        } catch {}
      });
    }, [])
  );

  // If the winner changes to whoever is currently the discarder, pick a new discarder
  useEffect(() => {
    if (discarderId === winnerId) {
      const next = game.players.find(p => p.id !== winnerId);
      if (next) setDiscarderId(next.id);
    }
  }, [winnerId]);

  const winner = game.players.find(p => p.id === winnerId)!;
  const isDealer = winnerId === game.dealerPlayerId;

  function togglePattern(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Mutual exclusivity helpers
        if (id === 'wu_hua_wu_zi') { next.delete('wu_hua'); next.delete('wu_zi'); }
        if (id === 'wu_hua' || id === 'wu_zi') { next.delete('wu_hua_wu_zi'); }
      }
      return next;
    });
  }

  function handleScore() {
    const patternIds = Array.from(selectedIds);
    // Auto-include 自摸 from the radio
    if (isSelfDraw && !patternIds.includes('zi_mo')) patternIds.push('zi_mo');
    // Auto-include flower/honor patterns from counter + toggle (skip for 小胡 — it short-circuits to 1 tai anyway)
    if (!patternIds.includes('xiao_hu')) {
      if (flowerCount === 0 && noHonors) {
        patternIds.push('wu_hua_wu_zi');   // 3 tai — no flowers AND no honors
      } else if (flowerCount === 0) {
        patternIds.push('wu_hua');         // 1 tai — no flowers only
      } else if (noHonors) {
        patternIds.push('wu_zi');          // 1 tai — no honors only
      }
    }
    const totalTai = calculateTai(patternIds, flowerCount, isDealer, isSelfDraw);
    if (totalTai === 0) {
      Alert.alert('No Score', 'This hand has 0 tai — select at least one pattern before scoring.');
      return;
    }
    const hand: ScoredHand = {
      winnerId,
      drawMethod: isSelfDraw ? 'self' : 'discard',
      discarderId: isSelfDraw ? undefined : discarderId,
      selectedPatternIds: patternIds,
      flowerCount,
      totalTai,
      payments: [],
      dealerPlayerId: game.dealerPlayerId,
    };
    hand.payments = calculatePayments(hand, game.players, game.stakePerTai);

    // Update player scores and rotate dealer, then persist
    const updatedPlayers = game.players.map(p => {
      const paid = hand.payments.find(pay => pay.fromPlayerId === p.id);
      const received = hand.payments.find(pay => pay.toPlayerId === p.id);
      const delta = (received ? received.amount * (hand.payments.length) : 0)
                  - (paid ? paid.amount : 0);
      return { ...p, score: Math.round((p.score + delta) * 100) / 100 };
    });

    const nextDealerPlayerId = getNextDealerPlayerId(game.players, game.dealerPlayerId, winnerId);
    const updatedGame: GameState = {
      ...game,
      players: updatedPlayers,
      dealerPlayerId: nextDealerPlayerId,
      handNumber: (game.handNumber ?? 0) + 1,
      rounds: [...game.rounds, hand],
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedGame));
    setGame(updatedGame);
    setResult(hand);
    setScored(true);
  }

  function handleReset() {
    setSelectedIds(new Set());
    setFlowerCount(0);
    setNoHonors(false);
    setIsSelfDraw(true);
    setScored(false);
    setResult(null);
  }

  // ── Result screen ────────────────────────────────────────────────────────────

  if (scored && result) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Result</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultWinner}>🏆 {winner.name} wins!</Text>
          <Text style={styles.resultTai}>{result.totalTai} tai</Text>
          <Text style={styles.resultAmount}>
            {result.drawMethod === 'self'
              ? `$${(result.totalTai * game.stakePerTai).toFixed(2)} per player`
              : `$${(result.totalTai * game.stakePerTai).toFixed(2)} from ${game.players.find(p => p.id === result.discarderId)?.name}`}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Payments</Text>
        {result.payments.map(p => {
          const from = game.players.find(pl => pl.id === p.fromPlayerId);
          return (
            <View key={p.fromPlayerId} style={styles.paymentRow}>
              <Text style={styles.paymentText}>
                {from?.name} → {winner.name}
              </Text>
              <Text style={styles.paymentAmount}>${p.amount.toFixed(2)}</Text>
            </View>
          );
        })}

        {result.drawMethod === 'discard' && (
          <Text style={styles.discardNote}>
            (Discard win — only{' '}
            {game.players.find(p => p.id === result.discarderId)?.name} pays)
          </Text>
        )}

        <Text style={styles.sectionTitle}>Patterns Counted</Text>
        {result.selectedPatternIds.map(id => {
          const p = PATTERNS.find(p => p.id === id);
          if (!p) return null;
          return (
            <View key={id} style={styles.patternSummaryRow}>
              <Text style={styles.patternSummaryLabel}>{p.english}</Text>
              <Text style={styles.patternSummaryTai}>+{p.tai} tai</Text>
            </View>
          );
        })}
        {flowerCount > 0 && (
          <View style={styles.patternSummaryRow}>
            <Text style={styles.patternSummaryLabel}>{flowerCount} flower(s)</Text>
            <Text style={styles.patternSummaryTai}>+{flowerCount} tai</Text>
          </View>
        )}
        {result.dealerPlayerId === result.winnerId && !result.selectedPatternIds.includes('xiao_hu') && (
          <View style={styles.patternSummaryRow}>
            <Text style={styles.patternSummaryLabel}>Dealer bonus</Text>
            <Text style={styles.patternSummaryTai}>+1 tai</Text>
          </View>
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleReset}>
          <Text style={styles.saveBtnText}>Score Next Hand</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Scoring input screen ─────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Score Hand</Text>
      <View style={styles.dealerBanner}>
        <Text style={styles.dealerBannerText}>
          🀄 Dealer: {game.players.find(p => p.id === game.dealerPlayerId)?.name ?? '—'}
          {'  '}• Hand {(game.handNumber ?? 0) + 1}
        </Text>
      </View>

      {/* Winner */}
      <Text style={styles.sectionTitle}>Winner</Text>
      <View style={styles.chipRow}>
        {game.players.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, winnerId === p.id && styles.chipActive]}
            onPress={() => setWinnerId(p.id)}
          >
            <Text style={[styles.chipText, winnerId === p.id && styles.chipTextActive]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Draw method */}
      <Text style={styles.sectionTitle}>How did they win?</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, styles.chipHalf, isSelfDraw && styles.chipActive]}
          onPress={() => setIsSelfDraw(true)}
        >
          <Text style={[styles.chipText, isSelfDraw && styles.chipTextActive]}>
            🀄 Self Draw
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, styles.chipHalf, !isSelfDraw && styles.chipActive]}
          onPress={() => setIsSelfDraw(false)}
        >
          <Text style={[styles.chipText, !isSelfDraw && styles.chipTextActive]}>
            🃏 Discard
          </Text>
        </TouchableOpacity>
      </View>

      {/* Discarder (only shown for discard wins) */}
      {!isSelfDraw && (
        <>
          <Text style={styles.sectionTitle}>Who discarded?</Text>
          <View style={styles.chipRow}>
            {game.players.filter(p => p.id !== winnerId).map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, discarderId === p.id && styles.chipActive]}
                onPress={() => setDiscarderId(p.id)}
              >
                <Text style={[styles.chipText, discarderId === p.id && styles.chipTextActive]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Flower count + No Honors toggle */}
      <Text style={styles.sectionTitle}>Flowers & Honors</Text>
      <View style={styles.counterRow}>
        <TouchableOpacity
          style={styles.counterBtn}
          onPress={() => setFlowerCount(Math.max(0, flowerCount - 1))}
        >
          <Text style={styles.counterBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.counterValue}>{flowerCount}</Text>
        <TouchableOpacity
          style={styles.counterBtn}
          onPress={() => setFlowerCount(Math.min(8, flowerCount + 1))}
        >
          <Text style={styles.counterBtnText}>+</Text>
        </TouchableOpacity>
        <Text style={styles.counterLabel}>🌸 flowers</Text>
      </View>
      <TouchableOpacity
        style={[styles.chip, { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 20 }, noHonors && styles.chipActive]}
        onPress={() => setNoHonors(v => !v)}
      >
        <Text style={[styles.chipText, noHonors && styles.chipTextActive]}>
          無字 No honor tiles
        </Text>
      </TouchableOpacity>
      <Text style={styles.flowerHint}>
        {flowerCount === 0 && noHonors ? '→ 無花無字 (3 tai)' :
         flowerCount === 0 ? '→ 無花 (1 tai)' :
         noHonors ? '→ 無字 (1 tai)' :
         `→ ${flowerCount} tai from flowers`}
      </Text>

      {/* Pattern categories */}
      {CATEGORY_ORDER.map(cat => {
        const patterns = getPatternsByCategory(cat).filter(p => !AUTO_HANDLED.includes(p.id));
        return (
          <View key={cat}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABELS[cat]}</Text>
            {patterns.map(p => {
              const isSelected = selectedIds.has(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.patternRow, isSelected && styles.patternRowActive]}
                  onPress={() => togglePattern(p.id)}
                >
                  <View style={styles.patternInfo}>
                    <Text style={[styles.patternEnglish, isSelected && styles.patternTextActive]}>
                      {p.english}
                    </Text>
                    <Text style={[styles.patternChinese, isSelected && styles.patternSubActive]}>
                      {p.chinese}  {p.pinyin}
                    </Text>
                    {p.notes && (
                      <Text style={styles.patternNotes}>{p.notes}</Text>
                    )}
                  </View>
                  <Text style={[styles.patternTai, isSelected && styles.patternTextActive]}>
                    {p.tai} tai
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      {/* Calculate button */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleScore}>
        <Text style={styles.saveBtnText}>Calculate Score</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  content:   { padding: 20, paddingBottom: 80 },
  // paddingTop is set dynamically via insets (see ScrollView below)
  title: {
    fontSize: 28, fontWeight: '700', color: '#8B0000',
    marginBottom: 8, marginTop: 12,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#888',
    marginTop: 22, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Chips (winner, draw method, discarder)
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  chipHalf:         { flex: 1 },
  chipActive:       { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  chipText:         { fontSize: 15, color: '#333', fontWeight: '500', textAlign: 'center' },
  chipTextActive:   { color: '#fff', fontWeight: '700' },

  // Flower counter
  counterRow:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#8B0000', alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText:  { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 28 },
  counterValue:    { fontSize: 28, fontWeight: '700', color: '#333', minWidth: 32, textAlign: 'center' },
  counterLabel:    { fontSize: 13, color: '#888' },
  flowerHint:      { fontSize: 12, color: '#8B0000', marginTop: 8, fontStyle: 'italic' },
  dealerBanner: {
    backgroundColor: '#fff3f3', borderRadius: 8, paddingVertical: 8,
    paddingHorizontal: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#8B0000',
  },
  dealerBannerText: { fontSize: 13, color: '#8B0000', fontWeight: '600' },

  // Pattern rows
  patternRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  patternRowActive: { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  patternInfo:      { flex: 1 },
  patternEnglish:   { fontSize: 15, fontWeight: '600', color: '#222' },
  patternChinese:   { fontSize: 12, color: '#888', marginTop: 2 },
  patternNotes:     { fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' },
  patternTai:       { fontSize: 15, fontWeight: '700', color: '#8B0000', marginLeft: 10 },
  patternTextActive:{ color: '#fff' },
  patternSubActive: { color: 'rgba(255,255,255,0.7)' },

  // Result screen
  resultCard: {
    backgroundColor: '#8B0000', borderRadius: 16,
    padding: 24, alignItems: 'center', marginBottom: 8,
  },
  resultWinner:  { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  resultTai:     { fontSize: 48, fontWeight: '900', color: '#fff', lineHeight: 56 },
  resultAmount:  { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  paymentRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  paymentText:   { fontSize: 15, color: '#333' },
  paymentAmount: { fontSize: 15, fontWeight: '700', color: '#8B0000' },
  discardNote:   { fontSize: 12, color: '#888', fontStyle: 'italic', marginBottom: 8 },

  patternSummaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  patternSummaryLabel: { fontSize: 14, color: '#444' },
  patternSummaryTai:   { fontSize: 14, fontWeight: '600', color: '#8B0000' },

  saveBtn: {
    marginTop: 32, backgroundColor: '#8B0000',
    borderRadius: 14, paddingVertical: 18, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
