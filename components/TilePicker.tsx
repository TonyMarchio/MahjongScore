import React from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TILE_CLASS_MAP, TILE_GROUPS } from '@/constants/tileMap';

interface Props {
  visible: boolean;
  onSelect: (classCode: string) => void;
  onClose: () => void;
}

export default function TilePicker({ visible, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={S.overlay}>
        <View style={[S.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={S.header}>
            <Text style={S.title}>Select Tile</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={S.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {TILE_GROUPS.map(group => (
              <View key={group.label} style={S.group}>
                <Text style={S.groupLabel}>{group.label}</Text>
                <View style={S.tileRow}>
                  {group.codes.map(code => (
                    <TouchableOpacity
                      key={code}
                      style={S.tileBtn}
                      onPress={() => onSelect(code)}
                    >
                      <Text style={S.tileCode}>{code}</Text>
                      <Text style={S.tileName} numberOfLines={2}>
                        {TILE_CLASS_MAP[code] ?? code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, maxHeight: '80%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#222' },
  close: { fontSize: 20, color: '#888', fontWeight: '600' },
  group: { paddingHorizontal: 16, paddingTop: 14 },
  groupLabel: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  tileBtn: {
    width: 62, paddingVertical: 8, paddingHorizontal: 4,
    backgroundColor: '#f5f0e8', borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#e0d8cc',
  },
  tileCode: { fontSize: 15, fontWeight: '800', color: '#8B0000' },
  tileName: { fontSize: 9, color: '#666', textAlign: 'center', marginTop: 2, lineHeight: 12 },
});
