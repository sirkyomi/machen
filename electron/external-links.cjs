function safeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 4000 || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.href;
    if (url.protocol === 'mailto:' && url.pathname) return url.href;
  } catch {}
  return null;
}

module.exports = {safeExternalUrl};
