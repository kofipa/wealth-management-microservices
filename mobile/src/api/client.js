import axios from 'axios';
import { DEV_HOST } from './config';

const BASE_URLS = {
  user: `http://${DEV_HOST}:3001`,
  asset: `http://${DEV_HOST}:3002`,
  liability: `http://${DEV_HOST}:3003`,
  networth: `http://${DEV_HOST}:3004`,
  document: `http://${DEV_HOST}:3005`,
  service: `http://${DEV_HOST}:3006`,
  openbanking: `http://${DEV_HOST}:3007`,
};

// Synchronous token cache — updated by AuthContext on login/logout
let _activeToken = null;
export const setActiveToken = (token) => { _activeToken = token; };

// Auto-logout handler — set by AuthContext so it can clear state on 401/403
let _onUnauthorized = null;
let _unauthorizedFiring = false;
export const setUnauthorizedHandler = (fn) => { _onUnauthorized = fn; };

const createClient = (baseURL) => {
  const client = axios.create({ baseURL });

  client.interceptors.request.use((config) => {
    if (_activeToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${_activeToken}`;
    }
    return config;
  });

  // Detect expired / invalid tokens and auto-logout once
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;
      if ((status === 401 || status === 403) && _onUnauthorized && !_unauthorizedFiring) {
        _unauthorizedFiring = true;
        _onUnauthorized();
        setTimeout(() => { _unauthorizedFiring = false; }, 5000);
      }
      return Promise.reject(error);
    },
  );

  return client;
};

export const userClient = createClient(BASE_URLS.user);
export const assetClient = createClient(BASE_URLS.asset);
export const liabilityClient = createClient(BASE_URLS.liability);
export const networthClient = createClient(BASE_URLS.networth);
export const documentClient = createClient(BASE_URLS.document);
export const serviceClient = createClient(BASE_URLS.service);
export const openbankingClient = createClient(BASE_URLS.openbanking);

// Auth
export const login = (email, password) =>
  userClient.post('/api/users/login', { email, password });

export const register = (name, email, password) =>
  userClient.post('/api/users/register', { email, password });

export const resendVerification = (email) =>
  userClient.post('/api/users/resend-verification', { email });

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
export const getPropertyValuation = (postcode) =>
  assetClient.get('/api/assets/valuation/property', { params: { postcode } });
export const getStockQuote = (ticker) =>
  assetClient.get('/api/assets/price/quote', { params: { ticker } });
export const getVehicleValuation = (reg, purchase_price, purchase_date, rate) =>
  assetClient.get('/api/assets/valuation/vehicle', { params: { reg, purchase_price, purchase_date, rate } });

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
export const getNetWorthHistory = (days = 30) =>
  networthClient.get('/api/networth/history', { params: { days } });

// Documents
export const getDocuments = () => documentClient.get('/api/documents');
export const deleteDocument = (id) => documentClient.delete(`/api/documents/${id}`);
export const uploadDocument = async (file, description = '', relatedEntityType = 'general', relatedEntityId = null, category = 'other', expiryDate = null) => {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name || file.fileName || 'upload',
    type: file.mimeType || file.type || 'application/octet-stream',
  });
  if (description) form.append('description', description);
  form.append('related_entity_type', relatedEntityType);
  if (relatedEntityId) form.append('related_entity_id', String(relatedEntityId));
  form.append('category', category);
  if (expiryDate) form.append('expiry_date', expiryDate);
  return documentClient.post('/api/documents/upload', form, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${_activeToken}`,
    },
  });
};

export const exportNetWorthPdf = () =>
  networthClient.get('/api/networth/export/pdf', { responseType: 'arraybuffer' });

// Open Banking
export const getOpenBankingAuthUrl = () => openbankingClient.get('/api/openbanking/auth-url');
export const getOpenBankingStatus = () => openbankingClient.get('/api/openbanking/status');
export const getOpenBankingAccounts = () => openbankingClient.get('/api/openbanking/accounts');
export const disconnectOpenBanking = () => openbankingClient.delete('/api/openbanking/disconnect');

// Services
export const getServices = () => serviceClient.get('/api/services');
export const getServiceHealth = () => serviceClient.get('/api/services/health');

// Profile + Password
export const updateProfile = (data) => userClient.post('/api/users/profile', data);
export const changePassword = (current_password, new_password) =>
  userClient.post('/api/users/change-password', { current_password, new_password });

// Security Question
export const setSecurityQuestion = (question, answer) =>
  userClient.post('/api/users/security-question', { question, answer });
export const getSecurityQuestion = (email) =>
  userClient.get(`/api/users/security-question/${encodeURIComponent(email)}`);
export const verifySecurityQuestion = (email, answer) =>
  userClient.post('/api/users/verify-security-question', { email, answer });

// Nominees / Trusted Contacts
export const addNominee = (email, inactivity_days) =>
  userClient.post('/api/users/nominees', { email, inactivity_days });
export const getNominees = () => userClient.get('/api/users/nominees');
export const updateNominee = (id, email, inactivity_days) =>
  userClient.put(`/api/users/nominees/${id}`, { email, inactivity_days });
export const removeNominee = (id) => userClient.delete(`/api/users/nominees/${id}`);
export const getDelegatedAccounts = () => userClient.get('/api/users/delegated-accounts');
export const requestDelegation = (ownerId) =>
  userClient.post(`/api/users/delegate/${ownerId}`);
