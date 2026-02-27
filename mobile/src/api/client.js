import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage'; // used by uploadDocument
import { DEV_HOST } from './config';

const BASE_URLS = {
  user: `http://${DEV_HOST}:3001`,
  asset: `http://${DEV_HOST}:3002`,
  liability: `http://${DEV_HOST}:3003`,
  networth: `http://${DEV_HOST}:3004`,
  document: `http://${DEV_HOST}:3005`,
  service: `http://${DEV_HOST}:3006`,
};

// Synchronous token cache — updated by AuthContext on login/logout
let _activeToken = null;
export const setActiveToken = (token) => { _activeToken = token; };

const createClient = (baseURL) => {
  const client = axios.create({ baseURL });

  client.interceptors.request.use((config) => {
    if (_activeToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${_activeToken}`;
    }
    return config;
  });

  return client;
};

export const userClient = createClient(BASE_URLS.user);
export const assetClient = createClient(BASE_URLS.asset);
export const liabilityClient = createClient(BASE_URLS.liability);
export const networthClient = createClient(BASE_URLS.networth);
export const documentClient = createClient(BASE_URLS.document);
export const serviceClient = createClient(BASE_URLS.service);

// Auth
export const login = (email, password) =>
  userClient.post('/api/users/login', { email, password });

export const register = (name, email, password) =>
  userClient.post('/api/users/register', { email, password });

export const getProfile = () =>
  userClient.get('/api/users/profile');

export const forgotPassword = (email) =>
  userClient.post('/api/users/forgot-password', { email });

export const resetPassword = (email, token, newPassword) =>
  userClient.post('/api/users/reset-password', { email, token, newPassword });

// Assets
export const getAssets = () => assetClient.get('/api/assets');
export const createAsset = (data) => {
  // API has type-specific endpoints: /api/assets/cash|investment|property|other
  const type = ['cash', 'investment', 'property'].includes(data.type) ? data.type : 'other';
  return assetClient.post(`/api/assets/${type}`, data);
};
export const updateAsset = (id, data) => assetClient.put(`/api/assets/${id}`, data);
export const deleteAsset = (id) => assetClient.delete(`/api/assets/${id}`);
export const getAssetTotal = () => assetClient.get('/api/assets/total/value');

// Liabilities
export const getLiabilities = () => liabilityClient.get('/api/liabilities');
export const createLiability = (data) => {
  // API has type-specific endpoints: /api/liabilities/short-term|long-term
  const type = data.type === 'long-term' ? 'long-term' : 'short-term';
  return liabilityClient.post(`/api/liabilities/${type}`, data);
};
export const updateLiability = (id, data) => liabilityClient.put(`/api/liabilities/${id}`, data);
export const deleteLiability = (id) => liabilityClient.delete(`/api/liabilities/${id}`);
export const getLiabilityTotal = () => liabilityClient.get('/api/liabilities/total/amount');

// Net Worth
export const getNetWorth = () => networthClient.get('/api/networth/calculate');
export const getNetWorthBreakdown = () => networthClient.get('/api/networth/breakdown');

// Documents
export const getDocuments = () => documentClient.get('/api/documents');
export const deleteDocument = (id) => documentClient.delete(`/api/documents/${id}`);
export const uploadDocument = async (file, description = '') => {
  const delegatedToken = await AsyncStorage.getItem('delegatedToken');
  const token = await AsyncStorage.getItem('token');
  const authToken = delegatedToken || token;
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name || file.fileName || 'upload',
    type: file.mimeType || file.type || 'application/octet-stream',
  });
  if (description) form.append('description', description);
  form.append('related_entity_type', 'general');
  return documentClient.post('/api/documents/upload', form, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${authToken}`,
    },
  });
};

// Services
export const getServices = () => serviceClient.get('/api/services');
export const getServiceHealth = () => serviceClient.get('/api/services/health');

// Nominees / Trusted Contacts
export const addNominee = (email, inactivity_days) =>
  userClient.post('/api/users/nominees', { email, inactivity_days });
export const getNominees = () => userClient.get('/api/users/nominees');
export const removeNominee = (id) => userClient.delete(`/api/users/nominees/${id}`);
export const getDelegatedAccounts = () => userClient.get('/api/users/delegated-accounts');
export const requestDelegation = (ownerId) =>
  userClient.post(`/api/users/delegate/${ownerId}`);
