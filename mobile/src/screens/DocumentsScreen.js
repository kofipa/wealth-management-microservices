import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Platform,
  Modal, Image, ScrollView, TextInput,
  KeyboardAvoidingView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile, Paths as FSPaths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { getDocuments, deleteDocument, uploadDocument } from '../api/client';
import { BASE_URLS } from '../api/config';
import { useTheme } from '../context/ThemeContext';

const CATEGORIES = [
  { id: 'identity',    label: 'Identity',    emoji: '🪪', color: '#7c3aed' },
  { id: 'property',    label: 'Property',    emoji: '🏠', color: '#16a34a' },
  { id: 'insurance',   label: 'Insurance',   emoji: '🛡️', color: '#0891b2' },
  { id: 'investments', label: 'Investments', emoji: '📈', color: '#d97706' },
  { id: 'banking',     label: 'Banking',     emoji: '🏦', color: '#2563eb' },
  { id: 'tax',         label: 'Tax',         emoji: '🧾', color: '#dc2626' },
  { id: 'legal',       label: 'Legal',       emoji: '⚖️', color: '#92400e' },
  { id: 'will',        label: 'Will',        emoji: '📜', color: '#b45309' },
  { id: 'other',       label: 'Other',       emoji: '📄', color: '#9ca3af' },
];

const ALL_FILTERS = [
  { id: 'all',      label: 'All',           emoji: '📂', color: '#6b7280' },
  { id: 'expiring', label: 'Expiring Soon',  emoji: '⏰', color: '#f59e0b' },
  ...CATEGORIES,
];

const getCat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

function getFileIcon(filename) {
  if (!filename) return '📄';
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
  if (ext === 'pdf') return '📑';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  return '📄';
}

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState(null);

  // Category filter
  const [activeFilter, setActiveFilter] = useState('all');

  // Upload modal
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  const load = async () => {
    try {
      const res = await getDocuments();
      setDocuments(res.data.documents || []);
    } catch {
      Alert.alert('Error', 'Could not load documents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleView = async (item) => {
    try {
      const delegatedToken = await SecureStore.getItemAsync('delegatedToken');
      const rawToken = await SecureStore.getItemAsync('token');
      const authToken = delegatedToken || rawToken;
      const rawName = item.original_name || item.filename || 'document';
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const url = `${BASE_URLS.document}/api/documents/${item.id}/download`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);

      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = new FSFile(FSPaths.cache, safeName);
      if (file.exists) file.delete();
      await file.write(bytes);

      if (IMAGE_TYPES.includes(item.mime_type)) {
        setPreviewUri(file.uri);
      } else if (item.mime_type === 'application/pdf') {
        if (Platform.OS === 'android') {
          // Android: convert to content:// URI and launch with VIEW intent directly
          const contentUri = await getContentUriAsync(file.uri);
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: 'application/pdf',
          });
        } else {
          // iOS: share sheet filtered to PDF-compatible apps
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(file.uri, {
              mimeType: 'application/pdf',
              dialogTitle: rawName,
              UTI: 'com.adobe.pdf',
            });
          }
        }
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, {
            mimeType: item.mime_type || 'application/octet-stream',
            dialogTitle: rawName,
          });
        } else {
          Alert.alert('Cannot open', 'No app available to open this file type');
        }
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open document');
    }
  };

  const doUpload = async (file) => {
    setUploading(true);
    setUploadModalVisible(false);
    try {
      await uploadDocument(file, uploadDescription, 'general', null, uploadCategory, uploadExpiryDate || null);
      setUploadDescription('');
      setUploadCategory('other');
      setUploadExpiryDate('');
      load();
    } catch (err) {
      Alert.alert('Upload failed', err.response?.data?.error || err.message || 'Could not upload file');
    } finally {
      setUploading(false);
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await doUpload({ uri: asset.uri, name: `photo_${Date.now()}.jpg`, mimeType: 'image/jpeg' });
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await doUpload({ uri: asset.uri, name: asset.fileName || `image_${Date.now()}.jpg`, mimeType: asset.mimeType || 'image/jpeg' });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await doUpload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'application/octet-stream' });
    }
  };

  const handleDelete = (id, filename) => {
    Alert.alert('Delete Document', `Delete "${filename}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(id);
            load();
          } catch {
            Alert.alert('Error', 'Could not delete document');
          }
        },
      },
    ]);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const getExpiryStatus = (doc) => {
    if (!doc.expiry_date) return null;
    const exp = new Date(doc.expiry_date);
    exp.setHours(0, 0, 0, 0);
    if (exp < today) return 'expired';
    if (exp <= in30) return 'soon';
    return null;
  };

  const filteredDocs = (() => {
    if (activeFilter === 'all') return documents;
    if (activeFilter === 'expiring') {
      return documents.filter((d) => {
        const s = getExpiryStatus(d);
        return s === 'expired' || s === 'soon';
      });
    }
    return documents.filter((d) => d.category === activeFilter);
  })();

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {filteredDocs.length} Document{filteredDocs.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={() => setUploadModalVisible(true)}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.uploadBtnText}>+ Upload</Text>
          }
        </TouchableOpacity>
      </View>

      {/* ── Category filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {ALL_FILTERS.map((cat) => {
          const active = activeFilter === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.filterChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
              onPress={() => setActiveFilter(cat.id)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {cat.emoji} {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Document list ── */}
      <FlatList
        data={filteredDocs}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.empty}>No documents{activeFilter !== 'all' ? ` in ${getCat(activeFilter).label}` : ''}</Text>
            <Text style={styles.emptySub}>
              {activeFilter !== 'all' ? 'Try a different category or tap + Upload' : 'Tap + Upload to add a file'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const cat = getCat(item.category);
          const expiryStatus = getExpiryStatus(item);
          return (
            <View style={styles.item}>
              <View style={styles.itemIcon}>
                <Text style={styles.fileIcon}>{getFileIcon(item.original_name || item.filename)}</Text>
              </View>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName} numberOfLines={1}>{item.original_name || item.filename}</Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.catBadge, { backgroundColor: cat.color + '18', borderColor: cat.color + '40' }]}>
                    <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.emoji} {cat.label}</Text>
                  </View>
                  {expiryStatus === 'expired' && (
                    <View style={styles.expiredBadge}>
                      <Text style={styles.expiredBadgeText}>Expired</Text>
                    </View>
                  )}
                  {expiryStatus === 'soon' && (
                    <View style={styles.expiringSoonBadge}>
                      <Text style={styles.expiringSoonBadgeText}>Exp soon</Text>
                    </View>
                  )}
                </View>
                {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
                <Text style={styles.itemMeta}>
                  {formatDate(item.created_at)}{item.file_size ? ` · ${formatSize(item.file_size)}` : ''}
                  {item.expiry_date ? ` · Expires ${formatDate(item.expiry_date)}` : ''}
                </Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => handleView(item)} style={styles.viewBtn}>
                  <Text style={styles.viewText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id, item.original_name || item.filename)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* ── Upload modal ── */}
      <Modal visible={uploadModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setUploadModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Category</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((cat) => {
                const active = uploadCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catOption, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                    onPress={() => setUploadCategory(cat.id)}
                  >
                    <Text style={styles.catOptionEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.catOptionLabel, active && styles.catOptionLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              value={uploadDescription}
              onChangeText={setUploadDescription}
              placeholder="e.g. Annual mortgage statement"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={styles.label}>Expiry Date (optional)</Text>
            <TouchableOpacity
              style={[styles.input, styles.datePickerBtn]}
              onPress={() => setShowExpiryPicker(true)}
            >
              <Text style={uploadExpiryDate ? styles.datePickerText : styles.datePickerPlaceholder}>
                {uploadExpiryDate
                  ? new Date(uploadExpiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Select expiry date (optional)'}
              </Text>
              <Text style={styles.datePickerIcon}>📅</Text>
            </TouchableOpacity>
            {uploadExpiryDate ? (
              <TouchableOpacity onPress={() => setUploadExpiryDate('')} style={{ marginTop: -14, marginBottom: 14, alignSelf: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: colors.danger }}>Clear date</Text>
              </TouchableOpacity>
            ) : null}
            {showExpiryPicker && (
              <DateTimePicker
                value={uploadExpiryDate ? new Date(uploadExpiryDate) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === 'android') setShowExpiryPicker(false);
                  if (selectedDate) {
                    setUploadExpiryDate(selectedDate.toISOString().split('T')[0]);
                  }
                }}
              />
            )}
            {showExpiryPicker && Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setShowExpiryPicker(false)}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.sectionLabel}>Choose Source</Text>
            <TouchableOpacity style={styles.sourceBtn} onPress={pickFromCamera}>
              <Text style={styles.sourceBtnText}>📷  Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sourceBtn} onPress={pickFromGallery}>
              <Text style={styles.sourceBtnText}>🖼️  Photo Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sourceBtn} onPress={pickDocument}>
              <Text style={styles.sourceBtnText}>📎  Browse Files</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Image preview modal ── */}
      <Modal visible={!!previewUri} transparent animationType="fade">
        <SafeAreaView style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUri(null)}>
            <Text style={styles.previewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  uploadBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Filter chips
  filterBar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 54 },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  filterChipText: { fontSize: 13, color: colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },

  // List
  list: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  empty: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },

  // Document card
  item: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  itemIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  fileIcon: { fontSize: 20 },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 },
  catBadge: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4 },
  catBadgeText: { fontSize: 11, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  expiredBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.dangerLight, borderColor: colors.danger },
  expiredBadgeText: { fontSize: 11, fontWeight: '600', color: colors.danger },
  expiringSoonBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.warningLight, borderColor: colors.warning },
  expiringSoonBadgeText: { fontSize: 11, fontWeight: '600', color: colors.warning },
  itemDesc: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  itemMeta: { fontSize: 12, color: colors.textTertiary },
  actions: { alignItems: 'flex-end', gap: 6, justifyContent: 'center' },
  viewBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary,
  },
  viewText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  deleteBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger,
  },
  deleteText: { fontSize: 13, color: colors.danger, fontWeight: '500' },

  // Upload modal
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 16, color: colors.primary },
  label: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginBottom: 10 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  catOption: { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  catOptionEmoji: { fontSize: 22, marginBottom: 4 },
  catOptionLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500', textAlign: 'center' },
  catOptionLabelActive: { color: '#fff' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  sourceBtn: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 10 },
  sourceBtnText: { fontSize: 16, color: colors.text, fontWeight: '500' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerText: { fontSize: 16, color: colors.text },
  datePickerPlaceholder: { fontSize: 16, color: colors.textTertiary },
  datePickerIcon: { fontSize: 18 },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 12 },
  doneBtnText: { fontSize: 16, color: colors.primary, fontWeight: '600' },

  // Image preview
  previewOverlay: { flex: 1, backgroundColor: '#000' },
  previewClose: { padding: 16 },
  previewCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  previewImage: { flex: 1, width: '100%' },
});
