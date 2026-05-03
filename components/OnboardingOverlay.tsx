import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const ONBOARDING_KEY = 'onboarding_complete';

const SLIDES = [
  {
    emoji: '🀄',
    title: 'Welcome to MahjongScore',
    body: "The scoring app built for your Taiwanese mahjong group. No more mental math or arguments about who owes what.",
  },
  {
    emoji: '⚙️',
    title: 'First: Set Up Your Players',
    body: "Tap the Game Setup tab (bottom right ⚙️). Enter everyone's names, set the stake per tai, and pick the starting dealer.",
  },
  {
    emoji: '🀄',
    title: 'Score Each Hand',
    body: "After someone wins, tap Score Hand (bottom left). Pick the winner, how they won, and check off any patterns in their hand. Payments are calculated automatically.",
  },
  {
    emoji: '🏆',
    title: 'Track the Game',
    body: "The Scores tab (middle) shows the live leaderboard and every hand played. You can undo the last hand if you make a mistake.",
  },
];

export function OnboardingOverlay() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(val => {
      if (!val) setVisible(true);
    });
  }, []);

  async function handleFinish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>

        <View style={styles.slideContent}>
          <Text style={styles.emoji}>{slide.emoji}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.buttonRow}>
          {index > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => setIndex(i => i - 1)}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={isLast ? handleFinish : () => setIndex(i => i + 1)}
          >
            <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next →'}</Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e8',
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 80,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#8B0000',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 34,
  },
  body: {
    fontSize: 17,
    color: '#444',
    textAlign: 'center',
    lineHeight: 26,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  dotActive: {
    backgroundColor: '#8B0000',
    width: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  backBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#555',
  },
  nextBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#8B0000',
  },
  nextBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
