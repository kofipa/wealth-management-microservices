const IS_PRODUCTION = true;

export const BASE_URLS = IS_PRODUCTION ? {
  user: 'https://user.api.clearwelth.com',
  asset: 'https://asset.api.clearwelth.com',
  liability: 'https://liability.api.clearwelth.com',
  networth: 'https://networth.api.clearwelth.com',
  document: 'https://document.api.clearwelth.com',
  service: 'https://services.api.clearwelth.com',
  openbanking: 'https://openbanking.api.clearwelth.com',
} : {
  user: 'http://192.168.0.6:3001',
  asset: 'http://192.168.0.6:3002',
  liability: 'http://192.168.0.6:3003',
  networth: 'http://192.168.0.6:3004',
  document: 'http://192.168.0.6:3005',
  service: 'http://192.168.0.6:3006',
  openbanking: 'http://192.168.0.6:3007',
};
