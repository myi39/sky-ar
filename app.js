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
  const header = el('header', {}, [
    el('h1', { textContent: 'sky-ar' }),
    el('p', { className: 'lead', textContent: 'カードを選ぶと AR で表示できます' })
  ]);

  const grid = el('div', { className: 'grid' }, CARDS.map(function (id) {
    return el('a', { className: 'card', href: '?c=' + encodeURIComponent(id) }, [
      el('img', { src: './images/thumb/' + id + '.jpg', alt: cardTitle(id), loading: 'lazy' }),
      el('span', { textContent: cardTitle(id) })
    ]);
  }));

  root.appendChild(header);
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
      document.createTextNode('AR で表示')
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
    return el('a', { className: 'launch', href: intent, textContent: 'AR で表示' });
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
    parts.push(el('p', {
      className: 'note',
      textContent: 'ボタンを押すと AR ビューアが開きます。床や机に向けると設置できます。'
    }));
  } else {
    parts.push(el('p', {
      className: 'note',
      textContent: 'AR 表示は iPhone / Android でのみ利用できます。'
    }));
  }

  parts.push(el('a', { className: 'back', href: './', textContent: '← 一覧にもどる' }));

  root.appendChild(el('header', {}, [
    el('h1', { textContent: cardTitle(id) }),
    el('p', { className: 'lead', textContent: 'sky-ar' })
  ]));
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
