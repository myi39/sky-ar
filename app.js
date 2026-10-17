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

function arLink(id) {
  const href = arUrl(id);
  if (!href) return null;

  if (platform() === 'ios') {
    // AR Quick Look requires the anchor to carry rel="ar" and to contain
    // exactly one child element, which must be an <img>.
    return el('a', { className: 'launch', rel: 'ar', href: href }, [
      el('img', { src: './images/thumb/' + id + '.jpg', alt: '' }),
      document.createTextNode('AR')
    ]);
  }

  return el('a', { className: 'launch', href: href, textContent: 'AR' });
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
