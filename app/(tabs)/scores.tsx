import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from './explore';
import { GameState, CompletedGame, Player } from '@/utils/types';

export const HISTORY_KEY  = 'mahjong_game_history';
export const ALLTIME_KEY  = 'mahjong_alltime_totals';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AllTimeEntry {
  name: string;    // most recent name used for this seat
  total: number;   // cumulative net $ across all sessions
  games: number;   // sessions played
}
type AllTimeTotals = Record<string, AllTimeEntry>; // keyed by player id

const WIND_CHAR: Record<string, string> = {
  east: '東', south: '南', west: '西', north: '北',
};

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

export default function ScoresScreen() {
  const insets = useSafeAreaInsets();
  const [game, setGame]         = useState<GameState>(DEFAULT_GAME);
  const [history, setHistory]   = useState<CompletedGame[]>([]);
  const [allTime, setAllTime]   = useState<AllTimeTotals>({});
  const [tab, setTab]           = useState<'table' | 'history' | 'alltime'>('table');

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      try { if (raw) setGame(JSON.parse(raw)); } catch {}
    });
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      try { if (raw) setHistory(JSON.parse(raw)); } catch {}
    });
    AsyncStorage.getItem(ALLTIME_KEY).then(raw => {
      try { if (raw) setAllTime(JSON.parse(raw)); } catch {}
    });
  }, []));

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getDelta(playerId: string): number {
    const last = game.rounds[game.rounds.length - 1];
    if (!last) return 0;
    const paid = last.payments.find(p => p.fromPlayerId === playerId);
    const recv = last.payments.find(p => p.toPlayerId === playerId);
    return (recv ? recv.amount * last.payments.length : 0) - (paid ? paid.amount : 0);
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  function handleUndo() {
    if (!game.rounds.length) return;
    const last = game.rounds[game.rounds.length - 1];
    Alert.alert(
      'Undo Last Hand',
      `Undo ${game.players.find(p => p.id === last.winnerId)?.name}'s ${last.totalTai}-tai win?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo', style: 'destructive',
          onPress: () => {
            const players = game.players.map(p => {
              const paid = last.payments.find(x => x.fromPlayerId === p.id);
              const recv = last.payments.find(x => x.toPlayerId === p.id);
              const delta = (recv ? recv.amount * last.payments.length : 0) - (paid ? paid.amount : 0);
              return { ...p, score: Math.round((p.score - delta) * 100) / 100 };
            });
            const next: GameState = {
              ...game, players,
              dealerPlayerId: last.dealerPlayerId,
              handNumber: Math.max(0, (game.handNumber ?? 1) - 1),
              rounds: game.rounds.slice(0, -1),
            };
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            setGame(next);
          },
        },
      ]
    );
  }

  async function handleNewGame() {
    const hasRounds = game.rounds.length > 0;
    Alert.alert(
      'New Game',
      hasRounds
        ? 'Save this game to History, update All-Time totals, and start fresh?'
        : 'Start a new game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: hasRounds ? 'Save & New' : 'New Game',
          style: hasRounds ? 'destructive' : 'default',
          onPress: async () => {
            if (hasRounds) {
              // Save to history
              const entry: CompletedGame = {
                id: Date.now().toString(),
                completedAt: new Date().toISOString(),
                players: game.players,
                totalHands: game.handNumber ?? 0,
                stakePerTai: game.stakePerTai,
              };
              const updatedHistory = [entry, ...history];
              await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
              setHistory(updatedHistory);

              // Update all-time totals independently
              const current = { ...allTime };
              for (const p of game.players) {
                const prev = current[p.id] ?? { name: p.name, total: 0, games: 0 };
                current[p.id] = {
                  name: p.name,
                  total: Math.round((prev.total + p.score) * 100) / 100,
                  games: prev.games + 1,
                };
              }
              await AsyncStorage.setItem(ALLTIME_KEY, JSON.stringify(current));
              setAllTime(current);
            }

            const reset: GameState = {
              ...game,
              players: game.players.map(p => ({ ...p, score: 0 })),
              dealerPlayerId: game.players[0].id,
              handNumber: 0,
              rounds: [],
            };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
            setGame(reset);
          },
        },
      ]
    );
  }

  function handleClearHistory() {
    if (history.length === 0) return;
    Alert.alert(
      'Clear History',
      `Delete all ${history.length} saved session${history.length !== 1 ? 's' : ''}? This won't affect All-Time totals.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(HISTORY_KEY);
            setHistory([]);
          },
        },
      ]
    );
  }

  function handleSettleUp() {
    const entries = Object.entries(allTime);
    if (entries.length === 0) return;
    const loser = entries.reduce((a, b) => b[1].total < a[1].total ? b : a);
    Alert.alert(
      'Settle Up',
      `Mark the meal as settled? This resets All-Time totals for everyone.\n\n${loser[1].name} is buying 🍜`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle Up', style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(ALLTIME_KEY);
            setAllTime({});
          },
        },
      ]
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const byWind = (w: string) => game.players.find(p => p.seatWind === w)!;
  const isDealer = (p: Player) => p.id === game.dealerPlayerId;

  const allTimeEntries = Object.entries(allTime)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => b.total - a.total);
  const lowestTotal = allTimeEntries.length > 0
    ? Math.min(...allTimeEntries.map(e => e.total))
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <View style={S.tabs}>
        {(['table', 'history', 'alltime'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[S.tab, tab === t && S.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[S.tabTxt, tab === t && S.tabTxtActive]}>
              {t === 'table' ? 'Table'
                : t === 'history' ? `Log${history.length ? ` (${history.length})` : ''}`
                : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TABLE TAB ───────────────────────────────────────────── */}
      {tab === 'table' && (
        <ScrollView contentContainerStyle={S.content}>
          <View style={S.tableArea}>
            <View style={S.edgeRow}>
              <PlayerCard player={byWind('west')} dealer={isDealer(byWind('west'))} delta={getDelta(byWind('west').id)} />
            </View>
            <View style={S.midRow}>
              <PlayerCard player={byWind('north')} dealer={isDealer(byWind('north'))} delta={getDelta(byWind('north').id)} />
              <View style={S.centerCircle}>
                <Text style={S.centerWind}>{WIND_CHAR[game.prevalingWind]}</Text>
                <Text style={S.centerHand}>Hand {game.handNumber ?? 0}</Text>
              </View>
              <PlayerCard player={byWind('south')} dealer={isDealer(byWind('south'))} delta={getDelta(byWind('south').id)} />
            </View>
            <View style={S.edgeRow}>
              <PlayerCard player={byWind('east')} dealer={isDealer(byWind('east'))} delta={getDelta(byWind('east').id)} />
            </View>
          </View>

          <View style={S.btnRow}>
            <TouchableOpacity
              style={[S.btn, !game.rounds.length && S.btnOff]}
              onPress={handleUndo}
              disabled={!game.rounds.length}
            >
              <Text style={S.btnTxt}>↩ Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.btn, S.btnOutline]} onPress={handleNewGame}>
              <Text style={[S.btnTxt, S.btnOutlineTxt]}>New Game</Text>
            </TouchableOpacity>
          </View>

          {game.rounds.length > 0 ? (
            <>
              <Text style={S.section}>
                This Game — {game.rounds.length} hand{game.rounds.length !== 1 ? 's' : ''}
              </Text>
              {[...game.rounds].reverse().map((hand, i) => {
                const n = game.rounds.length - 1 - i;
                const winner = game.players.find(p => p.id === hand.winnerId);
                const disc = hand.discarderId ? game.players.find(p => p.id === hand.discarderId) : null;
                return (
                  <View key={n} style={S.handRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.handMeta}>Hand {n + 1}</Text>
                      <Text style={S.handMain}>{winner?.name} · {hand.totalTai} tai</Text>
                      <Text style={S.handSub}>
                        {hand.drawMethod === 'self' ? 'Self draw' : `Discard by ${disc?.name}`}
                      </Text>
                    </View>
                    <Text style={S.handAmt}>${(hand.totalTai * game.stakePerTai).toFixed(2)}</Text>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={S.empty}>No hands yet. Score a hand to see history here.</Text>
          )}
        </ScrollView>
      )}

      {/* ── HISTORY (LOG) TAB ───────────────────────────────────── */}
      {tab === 'history' && (
        <ScrollView contentContainerStyle={S.content}>
          {history.length > 0 && (
            <TouchableOpacity style={S.clearBtn} onPress={handleClearHistory}>
              <Text style={S.clearBtnTxt}>Clear Log</Text>
            </TouchableOpacity>
          )}

          {history.length === 0 ? (
            <Text style={S.empty}>
              No saved sessions yet.{'\n'}Finish a game and tap "New Game" to save it here.
            </Text>
          ) : (
            history.map(g => {
              const sorted = [...g.players].sort((a, b) => b.score - a.score);
              const d = new Date(g.completedAt);
              const dateStr = d.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              });
              return (
                <View key={g.id} style={S.histCard}>
                  <View style={S.histHead}>
                    <Text style={S.histDate}>{dateStr}</Text>
                    <Text style={S.histMeta}>{g.totalHands} hands · ${g.stakePerTai}/tai</Text>
                  </View>
                  {sorted.map((pl, i) => (
                    <View key={pl.id} style={S.histRow}>
                      <Text style={S.histRank}>{i + 1}</Text>
                      <Text style={S.histName}>{pl.name}</Text>
                      <Text style={[S.histScore, pl.score >= 0 ? S.pos : S.neg]}>
                        {pl.score >= 0 ? '+' : ''}${pl.score.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── ALL-TIME TAB ────────────────────────────────────────── */}
      {tab === 'alltime' && (
        <ScrollView contentContainerStyle={S.content}>
          {allTimeEntries.length === 0 ? (
            <Text style={S.empty}>
              No all-time data yet.{'\n'}Complete a session and tap "New Game" to start tracking.
            </Text>
          ) : (
            <>
              <View style={S.mealBanner}>
                <Text style={S.mealBannerText}>
                  🍜  Lowest total buys the next meal
                </Text>
              </View>

              {allTimeEntries.map((entry, i) => {
                const isLoser = entry.total === lowestTotal;
                return (
                  <View key={entry.id} style={[S.atCard, isLoser && S.atCardLoser]}>
                    <View style={S.atRankWrap}>
                      <Text style={S.atRank}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={S.atNameRow}>
                        <Text style={[S.atName, isLoser && S.atNameLoser]}>{entry.name}</Text>
                        {isLoser && <Text style={S.mealTag}>🍜 buying</Text>}
                      </View>
                      <Text style={S.atGames}>{entry.games} session{entry.games !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={[S.atTotal, entry.total >= 0 ? S.pos : S.neg]}>
                      {entry.total >= 0 ? '+' : ''}${entry.total.toFixed(2)}
                    </Text>
                  </View>
                );
              })}

              <TouchableOpacity style={S.settleBtn} onPress={handleSettleUp}>
                <Text style={S.settleBtnTxt}>Settle Up — Meal Paid 🍜</Text>
              </TouchableOpacity>
              <Text style={S.settleNote}>
                Resets all-time totals. Session log is kept.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({ player, dealer, delta }: { player: Player; dealer: boolean; delta: number }) {
  const pos = player.score >= 0;
  return (
    <View style={[C.card, dealer && C.dealerCard]}>
      <View style={[C.badge, dealer && C.badgeDealer]}>
        <Text style={[C.wind, dealer && C.windDealer]}>{WIND_CHAR[player.seatWind]}</Text>
      </View>
      <Text style={C.name} numberOfLines={1}>{player.name}</Text>
      <Text style={[C.score, pos ? C.pos : C.neg]}>
        {pos ? '+' : ''}${player.score.toFixed(2)}
      </Text>
      {delta !== 0 && (
        <Text style={[C.delta, delta > 0 ? C.pos : C.neg]}>
          {delta > 0 ? '+' : ''}${delta.toFixed(2)}
        </Text>
      )}
      {dealer && <Text style={C.tag}>莊</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 16, paddingBottom: 80 },

  tabs:         { flexDirection: 'row', margin: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 4 },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
  tabActive:    { backgroundColor: '#8B0000' },
  tabTxt:       { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTxtActive: { color: '#fff' },

  tableArea: { backgroundColor: '#c5b99a', borderRadius: 20, padding: 10, gap: 8 },
  edgeRow:   { alignItems: 'center' },
  midRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  centerCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#8B0000', alignItems: 'center', justifyContent: 'center',
  },
  centerWind: { fontSize: 28, fontWeight: '900', color: '#fff' },
  centerHand: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  btnRow:       { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn:          { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  btnOff:       { opacity: 0.35 },
  btnOutline:   { borderColor: '#8B0000' },
  btnTxt:       { fontSize: 15, fontWeight: '600', color: '#555' },
  btnOutlineTxt:{ color: '#8B0000' },

  section: {
    fontSize: 12, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginTop: 28, marginBottom: 10,
  },
  handRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  handMeta: { fontSize: 10, color: '#bbb', fontWeight: '700', textTransform: 'uppercase' },
  handMain: { fontSize: 14, fontWeight: '600', color: '#222', marginTop: 2 },
  handSub:  { fontSize: 11, color: '#888', marginTop: 1 },
  handAmt:  { fontSize: 14, fontWeight: '700', color: '#8B0000', marginLeft: 12 },

  empty: {
    textAlign: 'center', color: '#aaa', fontSize: 14,
    marginTop: 48, lineHeight: 22, fontStyle: 'italic',
  },

  // History / Log tab
  clearBtn:    { alignSelf: 'flex-end', marginBottom: 12, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0d0d0' },
  clearBtnTxt: { fontSize: 13, color: '#c0392b', fontWeight: '600' },

  histCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#eee',
  },
  histHead: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 10, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  histDate:  { fontSize: 15, fontWeight: '700', color: '#222' },
  histMeta:  { fontSize: 12, color: '#888' },
  histRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  histRank:  { fontSize: 13, fontWeight: '700', color: '#ccc', width: 22 },
  histName:  { flex: 1, fontSize: 14, color: '#333' },
  histScore: { fontSize: 15, fontWeight: '700' },

  // All-time tab
  mealBanner: {
    backgroundColor: '#fff8e8', borderRadius: 12,
    padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#f0e0b0',
    alignItems: 'center',
  },
  mealBannerText: { fontSize: 14, fontWeight: '600', color: '#8a6000' },

  atCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#eee', gap: 14,
  },
  atCardLoser: { borderColor: '#e8c87a', backgroundColor: '#fffdf0', borderWidth: 1.5 },
  atRankWrap:  { width: 28, alignItems: 'center' },
  atRank:      { fontSize: 16, fontWeight: '800', color: '#ccc' },
  atNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  atName:      { fontSize: 16, fontWeight: '700', color: '#222' },
  atNameLoser: { color: '#8a6000' },
  atGames:     { fontSize: 12, color: '#aaa', marginTop: 2 },
  atTotal:     { fontSize: 18, fontWeight: '800', minWidth: 70, textAlign: 'right' },
  mealTag:     { fontSize: 12, fontWeight: '700', color: '#8a6000', backgroundColor: '#fff8e8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  settleBtn: {
    marginTop: 24, backgroundColor: '#8B0000',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  settleBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  settleNote:   { textAlign: 'center', color: '#aaa', fontSize: 12, marginTop: 10, fontStyle: 'italic' },

  pos: { color: '#2a7a2a' },
  neg: { color: '#8B0000' },
});

const C = StyleSheet.create({
  card:        { width: 108, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#e0d8cc' },
  dealerCard:  { borderColor: '#8B0000', borderWidth: 2 },
  badge:       { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  badgeDealer: { backgroundColor: '#8B0000' },
  wind:        { fontSize: 16, fontWeight: '800', color: '#8B0000' },
  windDealer:  { color: '#fff' },
  name:        { fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  score:       { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  delta:       { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  tag:         { marginTop: 5, fontSize: 10, color: '#8B0000', fontWeight: '800', backgroundColor: '#fff3f3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pos:         { color: '#2a7a2a' },
  neg:         { color: '#8B0000' },
});
