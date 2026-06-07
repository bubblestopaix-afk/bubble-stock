// Configuration de l'app Bubble Stock
// URL de l'API Apps Script (déploiement "API" — sera renseignée au déploiement)
window.BS_CONFIG = {
  // API Supabase (Edge Function) — l'ancienne API Apps Script reste dispo en secours :
  // https://script.google.com/macros/s/AKfycbz07_a43IWg__7OK-Dxl9vQTCs6Hbo6EqOtZJpdiD6o0goLCKnXAJijMVzmHZa4kcFh/exec
  API_URL: 'https://zpnoopitysojsvuqnbuo.supabase.co/functions/v1/stock-api',
  MAGASINS: ['PERTUIS', 'TOULOUSE', 'LYON'],
  VERSION: 'PWA-1.0'
};
