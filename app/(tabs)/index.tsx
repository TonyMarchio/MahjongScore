import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from './explore';
import { CAMERA_PREFILL_KEY } from './camera';
import { PATTERNS, calculateTai, calculatePayments, getPatternsByCategory, getNextDealerPlayerId } from '@/utils/scoring';
import { GameState, ScoredHand, PatternCategory } from '@/utils/types';
import { generateRandomHandConfig } from '@/utils/devSeedData';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const AUTO_HANDLED = ['zhuang_jia', 'zi_mo', 'mei_ge_hua', 'wu_hua', 'wu_zi', 'wu_hua_wu_zi'];

const COLLAPSED_BAR_HEIGHT = 70;
const EXPANDED_PANEL_HEIGHT = 340;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakdownItem {
  key: string;
  label: string;
  chinese?: string;
  tai: number;
  removable: boolean;
  patternId?: string;
}

// ─── Default game state ───────────────────────────────────────────────────────

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ScoreHandScreen() {
  const insets = useSafeAreaInsets();
  const [game, setGame] = useState<GameState>(DEFAULT_GAME);
  const [winnerId, setWinnerId] = useState<string>('p1');
  const [isSelfDraw, setIsSelfDraw] = useState(true);
  const [discarderId, setDiscarderId] = useState<string>('p2');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [flowerCount, setFlowerCount] = useState(0);
  const [noHonors, setNoHonors] = useState(false);
  const [patternCounts, setPatternCounts] = useState<Record<string, number>>({});
  const [scored, setScored] = useState(false);
  const [result, setResult] = useState<ScoredHand | null>(null);
  const [barExpanded, setBarExpanded] = useState(false);

  const expandAnim = useSharedValue(0);

  // Reload game state and apply camera prefill on tab focus
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY).then(raw => {
        try { if (raw) setGame(JSON.parse(raw)); } catch {}
      });
      AsyncStorage.getItem(CAMERA_PREFILL_KEY).then(raw => {
        if (!raw) return;
        try {
          const prefill = JSON.parse(raw);
          if (prefill.flowerCount !== undefined) setFlowerCount(prefill.flowerCount);
          if (prefill.noHonors !== undefined) setNoHonors(prefill.noHonors);
          if (prefill.patternIds?.length) setSelectedIds(new Set(prefill.patternIds));
          if (prefill.patternCounts) setPatternCounts(prefill.patternCounts);
          AsyncStorage.removeItem(CAMERA_PREFILL_KEY);
        } catch {}
      });
    }, [])
  );

  useEffect(() => {
    if (discarderId === winnerId) {
      const next = game.players.find(p => p.id !== winnerId);
      if (next) setDiscarderId(next.id);
    }
  }, [winnerId]);

  const winner   = game.players.find(p => p.id === winnerId)!;
  const isDealer = winnerId === game.dealerPlayerId;

  // ── Running tai (mirrors handleScore id-building, read-only) ────────────────
  const runningTai = useMemo(() => {
    const ids = Array.from(selectedIds);
    if (isSelfDraw && !ids.includes('zi_mo')) ids.push('zi_mo');
    if (!ids.includes('xiao_hu')) {
      if (flowerCount === 0 && noHonors)      ids.push('wu_hua_wu_zi');
      else if (flowerCount === 0)             ids.push('wu_hua');
      else if (noHonors)                      ids.push('wu_zi');
    }
    for (const [id, count] of Object.entries(patternCounts)) {
      if (count > 0 && !ids.includes(id)) ids.push(id);
    }
    return calculateTai(ids, flowerCount, isDealer, isSelfDraw, patternCounts);
  }, [selectedIds, flowerCount, noHonors, isSelfDraw, isDealer, patternCounts]);

  // ── Payment preview text ────────────────────────────────────────────────────
  const paymentText = useMemo(() => {
    if (runningTai === 0) return '';
    const amount = (runningTai * game.stakePerTai).toFixed(2);
    if (isSelfDraw) return `$${amount} / player`;
    const name = game.players.find(p => p.id === discarderId)?.name ?? '?';
    return `$${amount} from ${name}`;
  }, [runningTai, game.stakePerTai, isSelfDraw, discarderId, game.players]);

  // ── Breakdown items for expanded panel ─────────────────────────────────────
  const breakdownItems = useMemo((): BreakdownItem[] => {
    if (selectedIds.has('xiao_hu')) {
      return [{ key: 'xiao_hu', label: 'Small win — capped at 1 tai', chinese: '小胡', tai: 1, removable: true, patternId: 'xiao_hu' }];
    }

    const items: BreakdownItem[] = [];

    if (flowerCount > 0) {
      items.push({ key: 'flowers', label: `${flowerCount} flower${flowerCount > 1 ? 's' : ''}`, tai: flowerCount, removable: false });
    }
    if (flowerCount === 0 && noHonors) {
      items.push({ key: 'wu_hua_wu_zi', label: 'No flowers & No honors', chinese: '無花無字', tai: 3, removable: false });
    } else {
      if (flowerCount === 0) items.push({ key: 'wu_hua', label: 'No flowers', chinese: '無花', tai: 1, removable: false });
      if (noHonors)          items.push({ key: 'wu_zi',  label: 'No honor tiles', chinese: '無字', tai: 1, removable: false });
    }
    if (isSelfDraw) {
      items.push({ key: 'zi_mo', label: 'Self draw', chinese: '自摸', tai: 1, removable: false });
    }
    if (isDealer) {
      items.push({ key: 'zhuang_jia', label: 'Dealer bonus', chinese: '莊家', tai: 1, removable: false });
    }
    for (const id of selectedIds) {
      if (AUTO_HANDLED.includes(id) || id === 'xiao_hu') continue;
      const p = PATTERNS.find(pat => pat.id === id);
      if (!p) continue;
      items.push({ key: id, label: p.english, chinese: p.chinese, tai: p.tai, removable: true, patternId: id });
    }
    for (const [id, count] of Object.entries(patternCounts)) {
      if (count <= 0) continue;
      const p = PATTERNS.find(pat => pat.id === id);
      if (!p) continue;
      const label = count > 1 ? `${count}× ${p.english}` : p.english;
      items.push({ key: `cnt_${id}`, label, chinese: p.chinese, tai: p.tai * count, removable: false });
    }

    return items;
  }, [selectedIds, flowerCount, noHonors, isSelfDraw, isDealer, patternCounts]);

  // ── Animated style for expanded panel ──────────────────────────────────────
  const expandedPanelStyle = useAnimatedStyle(() => ({
    height: interpolate(expandAnim.value, [0, 1], [0, EXPANDED_PANEL_HEIGHT]),
  }));

  // ── Handlers ────────────────────────────────────────────────────────────────

  function togglePattern(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (id === 'wu_hua_wu_zi') { next.delete('wu_hua'); next.delete('wu_zi'); }
        if (id === 'wu_hua' || id === 'wu_zi') { next.delete('wu_hua_wu_zi'); }
      }
      return next;
    });
  }

  function toggleBar() {
    const next = !barExpanded;
    setBarExpanded(next);
    expandAnim.value = withTiming(next ? 1 : 0, { duration: 240 });
  }

  function handleScore() {
    const patternIds = Array.from(selectedIds);
    if (isSelfDraw && !patternIds.includes('zi_mo')) patternIds.push('zi_mo');
    if (!patternIds.includes('xiao_hu')) {
      if (flowerCount === 0 && noHonors)  patternIds.push('wu_hua_wu_zi');
      else if (flowerCount === 0)         patternIds.push('wu_hua');
      else if (noHonors)                  patternIds.push('wu_zi');
    }
    for (const [id, count] of Object.entries(patternCounts)) {
      if (count > 0 && !patternIds.includes(id)) patternIds.push(id);
    }
    const totalTai = calculateTai(patternIds, flowerCount, isDealer, isSelfDraw, patternCounts);
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

    const updatedPlayers = game.players.map(p => {
      const paid     = hand.payments.find(pay => pay.fromPlayerId === p.id);
      const received = hand.payments.find(pay => pay.toPlayerId   === p.id);
      const delta    = (received ? received.amount * hand.payments.length : 0)
                     - (paid    ? paid.amount : 0);
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
    setPatternCounts({});
    setIsSelfDraw(true);
    setScored(false);
    setResult(null);
    setBarExpanded(false);
    expandAnim.value = 0;
  }

  function handleRandomHand() {
    const cfg = generateRandomHandConfig();
    setSelectedIds(new Set(cfg.selectedIds));
    setPatternCounts(cfg.patternCounts);
    setFlowerCount(cfg.flowerCount);
    setNoHonors(cfg.noHonors);
    setIsSelfDraw(cfg.isSelfDraw);
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
              <Text style={styles.paymentText}>{from?.name} → {winner.name}</Text>
              <Text style={styles.paymentAmount}>${p.amount.toFixed(2)}</Text>
            </View>
          );
        })}
        {result.drawMethod === 'discard' && (
          <Text style={styles.discardNote}>
            (Discard win — only {game.players.find(p => p.id === result.discarderId)?.name} pays)
          </Text>
        )}

        <Text style={styles.sectionTitle}>Patterns Counted</Text>
        {result.selectedPatternIds.map(id => {
          const p = PATTERNS.find(p => p.id === id);
          if (!p) return null;
          const count = p.countable ? (patternCounts[id] ?? 1) : 1;
          return (
            <View key={id} style={styles.patternSummaryRow}>
              <Text style={styles.patternSummaryLabel}>{count > 1 ? `${count}× ` : ''}{p.english}</Text>
              <Text style={styles.patternSummaryTai}>+{p.tai * count} tai</Text>
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

  const bottomPad = COLLAPSED_BAR_HEIGHT + insets.bottom + 32;

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottomPad }]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Score Hand</Text>
          {__DEV__ && (
            <TouchableOpacity style={styles.devRandomBtn} onPress={handleRandomHand}>
              <Text style={styles.devRandomBtnText}>🎲 Random</Text>
            </TouchableOpacity>
          )}
        </View>
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
              <Text style={[styles.chipText, winnerId === p.id && styles.chipTextActive]}>{p.name}</Text>
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
            <Text style={[styles.chipText, isSelfDraw && styles.chipTextActive]}>🀄 Self Draw</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, styles.chipHalf, !isSelfDraw && styles.chipActive]}
            onPress={() => setIsSelfDraw(false)}
          >
            <Text style={[styles.chipText, !isSelfDraw && styles.chipTextActive]}>🃏 Discard</Text>
          </TouchableOpacity>
        </View>

        {/* Discarder */}
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
                  <Text style={[styles.chipText, discarderId === p.id && styles.chipTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Flower count + No Honors toggle */}
        <Text style={styles.sectionTitle}>Flowers & Honors</Text>
        <View style={styles.counterRow}>
          <TouchableOpacity style={styles.counterBtn} onPress={() => setFlowerCount(Math.max(0, flowerCount - 1))}>
            <Text style={styles.counterBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.counterValue}>{flowerCount}</Text>
          <TouchableOpacity style={styles.counterBtn} onPress={() => setFlowerCount(Math.min(8, flowerCount + 1))}>
            <Text style={styles.counterBtnText}>+</Text>
          </TouchableOpacity>
          <Text style={styles.counterLabel}>🌸 flowers</Text>
        </View>
        <TouchableOpacity
          style={[styles.chip, { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 20 }, noHonors && styles.chipActive]}
          onPress={() => setNoHonors(v => !v)}
        >
          <Text style={[styles.chipText, noHonors && styles.chipTextActive]}>無字 No honor tiles</Text>
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
                if (p.countable) {
                  const count  = patternCounts[p.id] ?? 0;
                  const active = count > 0;
                  return (
                    <View key={p.id} style={[styles.patternRow, active && styles.patternRowActive]}>
                      <View style={styles.patternInfo}>
                        <Text style={[styles.patternEnglish, active && styles.patternTextActive]}>{p.english}</Text>
                        <Text style={[styles.patternChinese, active && styles.patternSubActive]}>{p.chinese}  {p.pinyin}</Text>
                        {p.notes && <Text style={styles.patternNotes}>{p.notes}</Text>}
                      </View>
                      <View style={styles.inlineCounter}>
                        <TouchableOpacity
                          style={[styles.inlineCounterBtn, active && styles.inlineCounterBtnActive]}
                          onPress={() => setPatternCounts(prev => {
                            const c = prev[p.id] ?? 0;
                            if (c <= 0) return prev;
                            const next = { ...prev };
                            if (c === 1) delete next[p.id];
                            else next[p.id] = c - 1;
                            return next;
                          })}
                        >
                          <Text style={[styles.inlineCounterBtnText, active && styles.inlineCounterBtnTextActive]}>−</Text>
                        </TouchableOpacity>
                        <Text style={[styles.inlineCounterValue, active && styles.patternTextActive]}>{count}</Text>
                        <TouchableOpacity
                          style={[styles.inlineCounterBtn, active && styles.inlineCounterBtnActive]}
                          onPress={() => setPatternCounts(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))}
                        >
                          <Text style={[styles.inlineCounterBtnText, active && styles.inlineCounterBtnTextActive]}>+</Text>
                        </TouchableOpacity>
                        <Text style={[styles.patternTai, active && styles.patternTextActive]}>{p.tai} tai ea</Text>
                      </View>
                    </View>
                  );
                }

                const isSelected = selectedIds.has(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.patternRow, isSelected && styles.patternRowActive]}
                    onPress={() => togglePattern(p.id)}
                  >
                    <View style={styles.patternInfo}>
                      <Text style={[styles.patternEnglish, isSelected && styles.patternTextActive]}>{p.english}</Text>
                      <Text style={[styles.patternChinese, isSelected && styles.patternSubActive]}>{p.chinese}  {p.pinyin}</Text>
                      {p.notes && <Text style={styles.patternNotes}>{p.notes}</Text>}
                    </View>
                    <Text style={[styles.patternTai, isSelected && styles.patternTextActive]}>{p.tai} tai</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Sticky bottom bar ─────────────────────────────────────────────── */}
      <View style={styles.stickyBarContainer} pointerEvents="box-none">

        {/* Expanded breakdown panel */}
        <Animated.View style={[styles.expandedPanel, expandedPanelStyle]}>
          <TouchableOpacity style={styles.expandedHeader} onPress={toggleBar} activeOpacity={0.7}>
            <Text style={styles.expandedTitle}>Score Breakdown</Text>
            <Text style={styles.expandedClose}>▾ Close</Text>
          </TouchableOpacity>

          <ScrollView style={styles.expandedList} nestedScrollEnabled>
            {breakdownItems.length === 0 ? (
              <Text style={styles.expandedEmpty}>Select patterns above to see breakdown</Text>
            ) : (
              breakdownItems.map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.breakdownRow, item.removable && styles.breakdownRowRemovable]}
                  onPress={item.removable ? () => togglePattern(item.patternId!) : undefined}
                  activeOpacity={item.removable ? 0.65 : 1}
                >
                  <View style={styles.breakdownInfo}>
                    <Text style={styles.breakdownLabel}>{item.label}</Text>
                    {item.chinese && <Text style={styles.breakdownChinese}>{item.chinese}</Text>}
                  </View>
                  <View style={styles.breakdownRight}>
                    <Text style={styles.breakdownTai}>+{item.tai} tai</Text>
                    {item.removable && <Text style={styles.breakdownX}>✕</Text>}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <View style={styles.expandedTotalRow}>
            <Text style={styles.expandedTotalLabel}>Total</Text>
            <Text style={styles.expandedTotalTai}>{runningTai} tai</Text>
          </View>
        </Animated.View>

        {/* Collapsed bar */}
        <View style={[styles.collapsedBar, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity style={styles.barLeft} onPress={toggleBar} activeOpacity={0.7}>
            {runningTai > 0 ? (
              <>
                <Text style={styles.barTai}>{runningTai} tai  <Text style={styles.barArrow}>{barExpanded ? '▾' : '▴'}</Text></Text>
                <Text style={styles.barPayment}>{paymentText}</Text>
              </>
            ) : (
              <Text style={styles.barTaiZero}>0 tai — select patterns  <Text style={styles.barArrow}>▴</Text></Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.calcBtn, runningTai === 0 && styles.calcBtnDisabled]}
            onPress={handleScore}
            disabled={runningTai === 0}
          >
            <Text style={[styles.calcBtnTxt, runningTai === 0 && styles.calcBtnTxtDisabled]}>
              Calculate →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#f5f0e8' },
  container:  { flex: 1, backgroundColor: '#f5f0e8' },
  content:    { padding: 20, paddingBottom: 80 },

  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8, marginTop: 12,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#8B0000' },
  devRandomBtn: {
    backgroundColor: '#1a1a2e', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  devRandomBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#888',
    marginTop: 22, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  chipHalf:       { flex: 1 },
  chipActive:     { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  chipText:       { fontSize: 15, color: '#333', fontWeight: '500', textAlign: 'center' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  counterRow:     { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#8B0000', alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 28 },
  counterValue:   { fontSize: 28, fontWeight: '700', color: '#333', minWidth: 32, textAlign: 'center' },
  counterLabel:   { fontSize: 13, color: '#888' },
  flowerHint:     { fontSize: 12, color: '#8B0000', marginTop: 8, fontStyle: 'italic' },

  dealerBanner: {
    backgroundColor: '#fff3f3', borderRadius: 8, paddingVertical: 8,
    paddingHorizontal: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#8B0000',
  },
  dealerBannerText: { fontSize: 13, color: '#8B0000', fontWeight: '600' },

  patternRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  patternRowActive:  { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  patternInfo:       { flex: 1 },
  patternEnglish:    { fontSize: 15, fontWeight: '600', color: '#222' },
  patternChinese:    { fontSize: 12, color: '#888', marginTop: 2 },
  patternNotes:      { fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' },
  patternTai:        { fontSize: 15, fontWeight: '700', color: '#8B0000', marginLeft: 10 },
  patternTextActive: { color: '#fff' },
  patternSubActive:  { color: 'rgba(255,255,255,0.7)' },

  inlineCounter:             { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineCounterBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(139,0,0,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  inlineCounterBtnActive:    { backgroundColor: 'rgba(255,255,255,0.2)' },
  inlineCounterBtnText:      { color: '#8B0000', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  inlineCounterBtnTextActive:{ color: '#fff' },
  inlineCounterValue: {
    fontSize: 20, fontWeight: '700', color: '#333',
    minWidth: 24, textAlign: 'center' as const,
  },

  resultCard: {
    backgroundColor: '#8B0000', borderRadius: 16,
    padding: 24, alignItems: 'center', marginBottom: 8,
  },
  resultWinner: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  resultTai:    { fontSize: 48, fontWeight: '900', color: '#fff', lineHeight: 56 },
  resultAmount: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

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

  // ── Sticky bar ──────────────────────────────────────────────────────────────

  stickyBarContainer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
  },

  // Expanded breakdown panel
  expandedPanel: {
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 12,
  },
  expandedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#eee',
    backgroundColor: '#f5f0e8',
  },
  expandedTitle: { fontSize: 14, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.6 },
  expandedClose: { fontSize: 14, fontWeight: '600', color: '#8B0000' },

  expandedList:  { flex: 1, maxHeight: EXPANDED_PANEL_HEIGHT - 110 },
  expandedEmpty: { color: '#bbb', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: 24 },

  expandedTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#eee',
    backgroundColor: '#f5f0e8',
  },
  expandedTotalLabel: { fontSize: 15, fontWeight: '700', color: '#333' },
  expandedTotalTai:   { fontSize: 20, fontWeight: '800', color: '#8B0000' },

  // Breakdown rows
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  breakdownRowRemovable: { backgroundColor: '#fff9f9' },
  breakdownInfo:   { flex: 1 },
  breakdownLabel:  { fontSize: 14, fontWeight: '600', color: '#222' },
  breakdownChinese:{ fontSize: 11, color: '#888', marginTop: 1 },
  breakdownRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownTai:    { fontSize: 14, fontWeight: '700', color: '#8B0000' },
  breakdownX:      { fontSize: 11, color: '#cc2222', fontWeight: '700' },

  // Collapsed bar
  collapsedBar: {
    backgroundColor: '#8B0000',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  barLeft:    { flex: 1, paddingRight: 12 },
  barTai:     { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  barTaiZero: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.6)', lineHeight: 22 },
  barArrow:   { fontSize: 16, color: 'rgba(255,255,255,0.8)' },
  barPayment: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  calcBtn: {
    backgroundColor: '#fff',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
  },
  calcBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.25)' },
  calcBtnTxt:      { color: '#8B0000', fontSize: 14, fontWeight: '700' },
  calcBtnTxtDisabled: { color: 'rgba(255,255,255,0.5)' },
});
