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

function main() {
  const root = document.getElementById('app');
  renderList(root);
}

main();
