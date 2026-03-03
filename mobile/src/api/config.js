const IS_PRODUCTION = true;

export const BASE_URLS = IS_PRODUCTION ? {
  user: 'https://wealth-management-microservices-production.up.railway.app',
  asset: 'https://devoted-art-production.up.railway.app',
  liability: 'https://exemplary-curiosity-production.up.railway.app',
  networth: 'https://victorious-laughter-production.up.railway.app',
  document: 'https://robust-dedication-production-1fd0.up.railway.app',
  service: 'https://brave-harmony-production-357c.up.railway.app',
  openbanking: 'https://daring-embrace-production.up.railway.app',
} : {
  user: 'http://192.168.0.6:3001',
  asset: 'http://192.168.0.6:3002',
  liability: 'http://192.168.0.6:3003',
  networth: 'http://192.168.0.6:3004',
  document: 'http://192.168.0.6:3005',
  service: 'http://192.168.0.6:3006',
  openbanking: 'http://192.168.0.6:3007',
};
