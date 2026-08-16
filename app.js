'use strict';

// "01_Mob" -> "Mob". The numeric prefix is not unique (00_andI and
// 00_andYou1 both start with 00), so it is display-only; the full stem
// stays the identifier everywhere else.
function cardTitle(id) {
  return id.replace(/^\d+_/, '');
}

function el(tag, props, children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  (children || []).forEach(function (child) { node.appendChild(child); });
  return node;
}

function renderList(root) {
  const grid = el('div', { className: 'grid' }, CARDS.map(function (id) {
    return el('a', { className: 'card', href: '?c=' + encodeURIComponent(id) }, [
      el('img', { src: './images/thumb/' + id + '.jpg', alt: cardTitle(id), loading: 'lazy' }),
      el('span', { textContent: cardTitle(id) })
    ]);
  }));

  root.appendChild(grid);
}

function platform() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so check for touch as well.
  if (/iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function arLink(id) {
  const os = platform();

  if (os === 'ios') {
    // AR Quick Look requires the anchor to carry rel="ar" and to contain
    // exactly one child element, which must be an <img>.
    return el('a', { className: 'launch', rel: 'ar', href: './3d/usdz/' + id + '.usdz' }, [
      el('img', { src: './images/thumb/' + id + '.jpg', alt: '' }),
      document.createTextNode('AR')
    ]);
  }

  if (os === 'android') {
    // Scene Viewer needs an absolute URL for the model.
    const model = new URL('./3d/glb/' + id + '.glb', location.href).href;
    const fallback = encodeURIComponent(location.href);
    const intent =
      'intent://arvr.google.com/scene-viewer/1.0' +
      '?file=' + encodeURIComponent(model) +
      '&mode=ar_only' +
      '#Intent;scheme=https;package=com.google.ar.core;' +
      'action=android.intent.action.VIEW;' +
      'S.browser_fallback_url=' + fallback + ';end;';
    return el('a', { className: 'launch', href: intent, textContent: 'AR' });
  }

  return null;
}

function renderDetail(root, id) {
  const parts = [
    el('img', { className: 'hero', src: './images/' + id + '_front.jpg', alt: cardTitle(id) })
  ];

  const link = arLink(id);
  if (link) {
    parts.push(link);
  } else {
    // Kept only for platforms with no AR viewer. Without it the page is a
    // dead end: no button and no reason given.
    parts.push(el('p', {
      className: 'note',
      textContent: 'AR 表示は iPhone / Android でのみ利用できます。'
    }));
  }

  root.appendChild(el('div', { className: 'detail' }, parts));
}

function main() {
  const root = document.getElementById('app');
  const id = new URLSearchParams(location.search).get('c');

  if (id && CARDS.indexOf(id) !== -1) {
    renderDetail(root, id);
  } else {
    renderList(root);
  }
}

main();
