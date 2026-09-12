(function(root) {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  const emailPattern = /(?<![\w.+-])([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(?![\w+-])/gi;
  const trailingPunctuation = /[.,;:!?]+$/;

  function cleanUrl(value) {
    let result = value.replace(trailingPunctuation, '');
    while (result.endsWith(')') && (result.match(/\(/g) || []).length < (result.match(/\)/g) || []).length) result = result.slice(0, -1);
    return result;
  }

  function findLinks(value) {
    const text = String(value || '');
    const links = [], occupied = [];
    for (const match of text.matchAll(urlPattern)) {
      const url = cleanUrl(match[0]);
      if (url) { links.push({url, label: url, type: 'url'}); occupied.push([match.index, match.index + match[0].length]); }
    }
    for (const match of text.matchAll(emailPattern)) {
      if (occupied.some(([start, end]) => match.index >= start && match.index < end)) continue;
      const email = match[1];
      links.push({url: `mailto:${email}`, label: email, type: 'email'});
    }
    return links;
  }

  const api = {findLinks};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MachenLinks = api;
})(globalThis);
