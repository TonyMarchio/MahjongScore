import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { TileSet, TILE_CATEGORIES, loadTileSets, deleteTileSet, exportTileSet } from '@/utils/tileSets';

export default function ManageSetsScreen() {
  const insets = useSafeAreaInsets();
  const [sets, setSets] = useState<TileSet[]>([]);

  useFocusEffect(useCallback(() => {
    loadTileSets().then(setSets);
  }, []));

  async function handleShare(set: TileSet) {
    try {
      const filePath = await exportTileSet(set);
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/x-mahjongset',
        dialogTitle: `Share "${set.name}"`,
        UTI: 'com.anthonymarchio.mahjongscore.tileset',
      });
    } catch {
      Alert.alert('Error', 'Could not share this tile set — try again.');
    }
  }

  function handleDelete(set: TileSet) {
    Alert.alert('Delete Set', `Delete "${set.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteTileSet(set.id);
          setSets(prev => prev.filter(s => s.id !== set.id));
        },
      },
    ]);
  }

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={S.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Tile Sets</Text>
        <TouchableOpacity onPress={() => router.push('/create-set')}>
          <Text style={S.headerNew}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {sets.length === 0 ? (
          <>
            <Text style={S.empty}>No tile sets yet.</Text>
            <Text style={S.emptySub}>
              Create a set by photographing one tile from each category. You can then select a set when using the camera scorer.
            </Text>
            <TouchableOpacity style={S.createBtn} onPress={() => router.push('/create-set')}>
              <Text style={S.createBtnTxt}>Create Your First Set</Text>
            </TouchableOpacity>
          </>
        ) : (
          sets.map(set => {
            const capturedCount = TILE_CATEGORIES.filter(c => set.references[c.key]).length;
            const dateStr = new Date(set.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            });
            return (
              <View key={set.id} style={S.card}>

                {/* Name + meta */}
                <View style={S.cardTop}>
                  <View>
                    <Text style={S.setName}>{set.name}</Text>
                    <Text style={S.setMeta}>{capturedCount}/6 tiles · {dateStr}</Text>
                  </View>
                  {capturedCount < 6 && (
                    <View style={S.incompleteBadge}>
                      <Text style={S.incompleteTxt}>Incomplete</Text>
                    </View>
                  )}
                </View>

                {/* Thumbnail strip */}
                <View style={S.thumbRow}>
                  {TILE_CATEGORIES.map(cat => {
                    const uri = set.references[cat.key];
                    return (
                      <View key={cat.key} style={[S.thumb, !uri && S.thumbEmpty]}>
                        {uri
                          ? <Image source={{ uri }} style={S.thumbImg} contentFit="cover" />
                          : <Text style={S.thumbChinese}>{cat.chinese}</Text>
                        }
                      </View>
                    );
                  })}
                </View>

                {/* Actions */}
                <View style={S.cardActions}>
                  <View style={S.cardActionsLeft}>
                    <TouchableOpacity
                      style={S.editBtn}
                      onPress={() => router.push({ pathname: '/create-set', params: { editId: set.id, editName: set.name } })}
                    >
                      <Text style={S.editBtnTxt}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.shareBtn} onPress={() => handleShare(set)}>
                      <Text style={S.shareBtnTxt}>Share</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(set)}>
                    <Text style={S.deleteTxt}>Delete</Text>
                  </TouchableOpacity>
                </View>

              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 16, paddingBottom: 60 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#f5f0e8', borderBottomWidth: 1, borderBottomColor: '#e8e0d5',
  },
  headerBack:  { fontSize: 15, color: '#8B0000', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  headerNew:   { fontSize: 15, color: '#8B0000', fontWeight: '700' },

  empty:    { textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#888', marginTop: 48 },
  emptySub: { textAlign: 'center', fontSize: 14, color: '#aaa', marginTop: 10, lineHeight: 21, paddingHorizontal: 24 },

  createBtn: {
    marginTop: 28, marginHorizontal: 40,
    backgroundColor: '#8B0000', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  createBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: '#eee',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  setName: { fontSize: 16, fontWeight: '700', color: '#222' },
  setMeta: { fontSize: 12, color: '#888', marginTop: 3 },

  incompleteBadge: { backgroundColor: '#fff3e0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  incompleteTxt:   { fontSize: 11, color: '#e67e22', fontWeight: '700' },

  thumbRow:   { flexDirection: 'row', gap: 6, marginBottom: 14 },
  thumb:      { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f5f0e8', alignItems: 'center', justifyContent: 'center' },
  thumbEmpty: { backgroundColor: '#f0ebe3', borderWidth: 1, borderColor: '#e0d8cc', borderStyle: 'dashed' },
  thumbImg:   { width: 44, height: 44 },
  thumbChinese: { fontSize: 16, fontWeight: '700', color: '#c8b89a' },

  cardActions:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  cardActionsLeft: { flexDirection: 'row', gap: 8 },
  editBtn:     { backgroundColor: '#f5f0e8', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  editBtnTxt:  { fontSize: 14, fontWeight: '600', color: '#8B0000' },
  shareBtn:    { backgroundColor: '#eef4fb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  shareBtnTxt: { fontSize: 14, fontWeight: '600', color: '#2980b9' },
  deleteTxt:   { fontSize: 14, color: '#c0392b', fontWeight: '500' },
});
