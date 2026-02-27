import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, ActionSheetIOS, Platform,
  Modal, Image, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDocuments, deleteDocument, uploadDocument } from '../api/client';
import { DEV_HOST } from '../api/config';

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
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState(null);

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
      const token = await AsyncStorage.getItem('token');
      const rawName = item.original_name || item.filename || 'document';
      // Sanitise filename for use as a local path
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const localUri = FileSystem.cacheDirectory + safeName;
      const downloadResumable = FileSystem.createDownloadResumable(
        `http://${DEV_HOST}:3005/api/documents/${item.id}/download`,
        localUri,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const download = await downloadResumable.downloadAsync();
      if (!download || download.status !== 200) {
        Alert.alert('Error', `Download failed with status ${download?.status}`);
        return;
      }
      // Show images inline, open other files via share sheet
      if (IMAGE_TYPES.includes(item.mime_type)) {
        setPreviewUri(download.uri);
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(download.uri, {
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
    try {
      await uploadDocument(file);
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
      await doUpload({
        uri: asset.uri,
        name: `photo_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
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
      await doUpload({
        uri: asset.uri,
        name: asset.fileName || `image_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await doUpload({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
      });
    }
  };

  const showUploadOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library', 'Browse Files'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) pickFromCamera();
          if (index === 2) pickFromGallery();
          if (index === 3) pickDocument();
        }
      );
    } else {
      Alert.alert('Upload Document', 'Choose a source', [
        { text: 'Take Photo', onPress: pickFromCamera },
        { text: 'Choose from Library', onPress: pickFromGallery },
        { text: 'Browse Files', onPress: pickDocument },
        { text: 'Cancel', style: 'cancel' },
      ]);
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{documents.length} Document{documents.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.uploadBtn} onPress={showUploadOptions} disabled={uploading}>
          {uploading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.uploadBtnText}>+ Upload</Text>
          }
        </TouchableOpacity>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.empty}>No documents yet</Text>
            <Text style={styles.emptySub}>Tap + Upload to add a photo or file</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemIcon}>
              <Text style={styles.fileIcon}>{getFileIcon(item.original_name || item.filename)}</Text>
            </View>
            <View style={styles.itemLeft}>
              <Text style={styles.itemName} numberOfLines={1}>{item.original_name || item.filename}</Text>
              {item.description ? <Text style={styles.itemType}>{item.description}</Text> : null}
              <Text style={styles.itemMeta}>
                {formatDate(item.created_at)}{item.file_size ? ` · ${formatSize(item.file_size)}` : ''}
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
        )}
      />

      <Modal visible={!!previewUri} transparent animationType="fade">
        <SafeAreaView style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUri(null)}>
            <Text style={styles.previewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  uploadBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  empty: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  item: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  itemIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  fileIcon: { fontSize: 20 },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  itemType: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#9ca3af' },
  actions: { alignItems: 'flex-end' },
  viewBtn: { paddingLeft: 12, paddingBottom: 6 },
  viewText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  deleteBtn: { paddingLeft: 12 },
  deleteText: { fontSize: 13, color: '#ef4444' },
  previewOverlay: { flex: 1, backgroundColor: '#000' },
  previewClose: { padding: 16 },
  previewCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  previewImage: { flex: 1, width: '100%' },
});
