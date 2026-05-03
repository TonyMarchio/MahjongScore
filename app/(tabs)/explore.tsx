import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Wind, GameState, Player } from '@/utils/types';

const WINDS: Wind[] = ['east', 'south', 'west', 'north'];
const WIND_LABEL: Record<Wind, string> = {
  east: '東 East', south: '南 South', west: '西 West', north: '北 North',
};
export const STORAGE_KEY = 'mahjong_game_state';

const DEFAULT_PLAYERS: Player[] = [
  { id: 'p1', name: 'Player 1', seatWind: 'east',  score: 0 },
  { id: 'p2', name: 'Player 2', seatWind: 'south', score: 0 },
  { id: 'p3', name: 'Player 3', seatWind: 'west',  score: 0 },
  { id: 'p4', name: 'Player 4', seatWind: 'north', score: 0 },
];

const DEFAULT_GAME_STATE: GameState = {
  prevalingWind: 'east',
  stakePerTai: 0.25,
  players: DEFAULT_PLAYERS,
  dealerPlayerId: 'p1',
  handNumber: 0,
  rounds: [],
};

export default function GameSetupScreen() {
  const insets = useSafeAreaInsets();
  const [playerNames, setPlayerNames] = useState(['', '', '', '']);
  const [prevalingWind, setPrevalingWind] = useState<Wind>('east');
  const [stakePerTai, setStakePerTai] = useState('0.25');
  const [dealerPlayerId, setDealerPlayerId] = useState('p1');
  const loaded = useRef(false);
  // Holds the full loaded game so we can preserve history & scores on save
  const savedGameRef = useRef<GameState>(DEFAULT_GAME_STATE);

  // Load saved settings on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      try {
        if (raw) {
          const saved: GameState = JSON.parse(raw);
          savedGameRef.current = saved;
          setPlayerNames(saved.players.map(p => p.name));
          setPrevalingWind(saved.prevalingWind);
          setStakePerTai(String(saved.stakePerTai));
          setDealerPlayerId(saved.dealerPlayerId ?? 'p1');
        }
      } catch {}
      loaded.current = true;
    });
  }, []);

  // Auto-save whenever anything changes (skip until initial load is done).
  // Spreads over savedGameRef to preserve handNumber, rounds, and player scores.
  useEffect(() => {
    if (!loaded.current) return;
    const names = playerNames.map((n, i) => n.trim() || `Player ${i + 1}`);
    const players: Player[] = savedGameRef.current.players.map((p, i) => ({ ...p, name: names[i] }));
    const gameState: GameState = {
      ...savedGameRef.current,
      prevalingWind,
      stakePerTai: parseFloat(stakePerTai) || 0.25,
      players,
      dealerPlayerId,
    };
    savedGameRef.current = gameState;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  }, [playerNames, prevalingWind, stakePerTai, dealerPlayerId]);

  const names = playerNames.map((n, i) => n.trim() || `Player ${i + 1}`);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Game Setup</Text>

      {/* Player Names */}
      <Text style={styles.sectionTitle}>Players (in seating order)</Text>
      {DEFAULT_PLAYERS.map((p, i) => (
        <View key={p.id} style={styles.playerRow}>
          <Text style={styles.windBadge}>{i + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder={`Player ${i + 1}`}
            value={playerNames[i]}
            onChangeText={text => {
              const updated = [...playerNames];
              updated[i] = text;
              setPlayerNames(updated);
            }}
            autoCapitalize="words"
          />
        </View>
      ))}

      {/* Starting Dealer */}
      <Text style={styles.sectionTitle}>Starting Dealer</Text>
      <View style={styles.chipRow}>
        {DEFAULT_PLAYERS.map((p, i) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, dealerPlayerId === p.id && styles.chipActive]}
            onPress={() => setDealerPlayerId(p.id)}
          >
            <Text style={[styles.chipText, dealerPlayerId === p.id && styles.chipTextActive]}>
              {names[i]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Prevailing Wind */}
      <Text style={styles.sectionTitle}>Prevailing Wind</Text>
      <View style={styles.chipRow}>
        {WINDS.map(w => (
          <TouchableOpacity
            key={w}
            style={[styles.chip, prevalingWind === w && styles.chipActive]}
            onPress={() => setPrevalingWind(w)}
          >
            <Text style={[styles.chipText, prevalingWind === w && styles.chipTextActive]}>
              {WIND_LABEL[w]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stake Per Tai */}
      <Text style={styles.sectionTitle}>Stake per Tai ($)</Text>
      <View style={styles.chipRow}>
        {['0.10', '0.25', '0.50', '1.00'].map(val => (
          <TouchableOpacity
            key={val}
            style={[styles.chip, stakePerTai === val && styles.chipActive]}
            onPress={() => setStakePerTai(val)}
          >
            <Text style={[styles.chipText, stakePerTai === val && styles.chipTextActive]}>
              ${val}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="Or type a custom amount..."
        keyboardType="decimal-pad"
        value={stakePerTai}
        onChangeText={setStakePerTai}
      />

      <Text style={styles.autoSaveNote}>Settings save automatically</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f0e8' },
  content:    { padding: 20, paddingBottom: 60 },
  title: {
    fontSize: 28, fontWeight: '700', color: '#8B0000',
    marginBottom: 24, marginTop: 12,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#888',
    marginTop: 24, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  playerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  windBadge:  { fontSize: 16, width: 24, textAlign: 'center', color: '#888', fontWeight: '600' },
  input: {
    flex: 1, backgroundColor: '#fff',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, borderWidth: 1, borderColor: '#ddd',
  },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
    alignItems: 'center', minWidth: '40%',
  },
  chipActive:     { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  chipText:       { fontSize: 15, color: '#333', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  autoSaveNote: { textAlign: 'center', color: '#aaa', fontSize: 13, marginTop: 32, fontStyle: 'italic' },
});
