import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { importTileSetFromFile, loadTileSets, saveTileSets } from '@/utils/tileSets';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const incomingUrl = Linking.useURL();

  useEffect(() => {
    if (!incomingUrl?.includes('.mahjongset')) return;
    handleIncomingSet(incomingUrl);
  }, [incomingUrl]);

  async function handleIncomingSet(fileUri: string) {
    try {
      const set = await importTileSetFromFile(fileUri);
      Alert.alert(
        'Import Tile Set',
        `Import "${set.name}" and add it to your Tile Sets?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              const existing = await loadTileSets();
              await saveTileSets([set, ...existing]);
              Alert.alert('Imported!', `"${set.name}" has been added to your Tile Sets.`);
            },
          },
        ],
      );
    } catch {
      Alert.alert('Import Failed', 'This file could not be imported. Make sure it was shared from MahjongScore.');
    }
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="manage-sets" options={{ headerShown: false }} />
        <Stack.Screen name="create-set"  options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
