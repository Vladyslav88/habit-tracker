// Сезонні сцени в шапці «Сьогодні» (SPEC §6): легкий інлайновий SVG, без зовнішніх картинок.
//
// Чотири шари з однаковим viewBox, накладені один на одний:
//   far    — далекі пагорби, дерева, хмари (затемнюється фільтром за часом доби)
//   ground — «земля» кольору --ground, що плавно переходить у фон сторінки (без фільтрів —
//            у Safari CSS-фільтри на дочірніх елементах SVG не працюють)
//   near   — обʼєкти на землі: гарбузи, сніговик, квіти, соняшники, пташки, метелики
//   lights — те, що світиться ввечері/вночі: гарбузи, гірлянда
// Анімації лише CSS і лише при prefers-reduced-motion: no-preference.

const VB = 'viewBox="0 0 400 140" preserveAspectRatio="xMidYMax slice"';

// ——— Дрібні будівельні блоки ———

function pumpkin(x, y, s) {
  return `<g class="pumpkin" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-9" rx="13" ry="10" class="pk-a"/>
    <ellipse cx="-6" cy="-9" rx="7.5" ry="9.6" class="pk-b"/>
    <ellipse cx="6" cy="-9" rx="7.5" ry="9.6" class="pk-b"/>
    <ellipse cx="0" cy="-9" rx="4.5" ry="10" class="pk-c"/>
    <path d="M0 -18q1-6 5-7" class="pk-stem"/>
  </g>`;
}

function pumpkinLight(x, y, s, i) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="0" cy="-9" r="24" fill="url(#pkGlow)" class="glow" style="--i:${i}"/>
    <path d="M-7 -12l3-4 3 4zM1 -12l3-4 3 4zM-7 -6l2 2 2-2 2 2 2-2 2 2 2-2-2 4h-8z" class="pk-face"/>
  </g>`;
}

function leafPile(x, y) {
  const leaves = [[-12, -2, -20, 'lf-a'], [-5, -5, 30, 'lf-b'], [3, -4, -40, 'lf-c'], [10, -2, 15, 'lf-a'], [-1, -8, 60, 'lf-d'], [6, -8, -10, 'lf-b']]
    .map(([dx, dy, r, c]) => `<ellipse cx="${dx}" cy="${dy}" rx="4.2" ry="2.2" transform="rotate(${r} ${dx} ${dy})" class="${c}"/>`).join('');
  return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="0" rx="17" ry="6" class="lf-base"/>${leaves}</g>`;
}

function fir(x, y, h) {
  const w = h * 0.42;
  const t = (top, bot, half) => `<path d="M${x} ${y - top}L${x + half} ${y - bot}H${x - half}Z" class="fir"/>
    <path d="M${x} ${y - top}L${x + half * 0.55} ${y - top + (top - bot) * 0.55}q-${half * 0.25} 3-${half * 0.55} 0q-${half * 0.3} 3-${half * 0.55} 0Z" class="fir-snow"/>`;
  return `<g><rect x="${x - 2}" y="${y - 8}" width="4" height="8" class="trunk"/>
    ${t(h, h * 0.55, w * 0.55)}${t(h * 0.78, h * 0.3, w * 0.78)}${t(h * 0.52, 6, w)}</g>`;
}

function scilla(x, y, h, c) {
  return `<g><path d="M${x} ${y}v-${h}" class="stem-thin"/>
    <path d="M${x} ${y - h - 3.4}l1 2.2 2.4-.4-1.4 2 1.4 2-2.4-.4-1 2.2-1-2.2-2.4.4 1.4-2-1.4-2 2.4.4z" class="${c}"/>
    <circle cx="${x}" cy="${y - h - 1}" r=".9" class="scilla-eye"/></g>`;
}

function sunflower(x, y, h, r) {
  const petals = Array.from({ length: 12 }, (_, i) => `<ellipse cx="${x}" cy="${y - h - r * 1.25}" rx="${r * 0.42}" ry="${r * 0.95}" transform="rotate(${i * 30} ${x} ${y - h})" class="sf-petal"/>`).join('');
  return `<g><path d="M${x} ${y}q-3-${h / 2} 0-${h}" class="sf-stem"/>
    <ellipse cx="${x - 7}" cy="${y - h * 0.45}" rx="7" ry="3" transform="rotate(-30 ${x - 7} ${y - h * 0.45})" class="sf-leaf"/>
    <ellipse cx="${x + 7}" cy="${y - h * 0.65}" rx="7" ry="3" transform="rotate(30 ${x + 7} ${y - h * 0.65})" class="sf-leaf"/>
    ${petals}<circle cx="${x}" cy="${y - h}" r="${r}" class="sf-core"/></g>`;
}

function cloud(x, y, s, i) {
  return `<g class="cloud" style="--i:${i}"><g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-22 6h44a8 8 0 0 0 0-16a12 12 0 0 0-22-6a10 10 0 0 0-17 6a8 8 0 0 0-5 16z" class="cloud-body"/></g></g>`;
}

function bird(x, y, i) {
  return `<g class="bird" style="--i:${i}"><g transform="translate(${x} ${y})"><path d="M-6 0q3-4 6 0q3-4 6 0" class="bird-line"/></g></g>`;
}

function butterfly(x, y, i, c) {
  return `<g class="butterfly" style="--i:${i}"><g transform="translate(${x} ${y})"><g class="bf-wings">
    <ellipse cx="-3.2" cy="-1.5" rx="3.4" ry="2.6" class="${c}"/><ellipse cx="3.2" cy="-1.5" rx="3.4" ry="2.6" class="${c}"/>
    <ellipse cx="-2.4" cy="2" rx="2.2" ry="1.8" class="${c}"/><ellipse cx="2.4" cy="2" rx="2.2" ry="1.8" class="${c}"/></g>
    <path d="M0-3v7" class="bf-body"/></g></g>`;
}

// ——— Сцени ———

const FAR_HILLS = `<path d="M0 94C60 76 130 74 200 86s120 12 200-8V140H0z" class="hill-far"/>
  <path d="M0 102C90 88 170 92 250 98s100-6 150-4V140H0z" class="hill-mid"/>`;

const GROUND = `<defs><linearGradient id="gFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" class="g-top"/><stop offset="1" class="g-bot"/></linearGradient></defs>
  <path d="M0 110C70 98 140 100 210 106s120 2 190-10V140H0z" class="ground"/>
  <rect x="0" y="112" width="400" height="28.5" fill="url(#gFade)"/>`;

const SCENES = {
  autumn: {
    far: `${FAR_HILLS}
      <g class="tree-rust">
        <path d="M330 100l-2.5-38h5z" class="trunk"/>
        <path d="M330 78l-12-10M331 70l11-9M329 86l-9-6" class="branch"/>
        <circle cx="318" cy="56" r="13" class="rl-a"/><circle cx="341" cy="52" r="14" class="rl-b"/>
        <circle cx="330" cy="40" r="13" class="rl-c"/><circle cx="352" cy="64" r="10" class="rl-d"/>
        <circle cx="308" cy="68" r="9" class="rl-b"/><circle cx="328" cy="62" r="11" class="rl-a"/>
        <circle cx="345" cy="38" r="8" class="rl-d"/>
      </g>`,
    near: `${pumpkin(64, 108, 1.15)}${pumpkin(92, 107, 0.8)}${pumpkin(122, 108, 0.95)}
      ${leafPile(178, 109)}${leafPile(252, 108)}
      <ellipse cx="300" cy="106" rx="3.5" ry="1.8" class="lf-a"/><ellipse cx="354" cy="104" rx="3.5" ry="1.8" class="lf-c"/>`,
    lights: `<defs><radialGradient id="pkGlow"><stop offset="0" stop-color="#FFC15A" stop-opacity=".75"/><stop offset=".45" stop-color="#FF9A2E" stop-opacity=".32"/><stop offset="1" stop-color="#FF8A1E" stop-opacity="0"/></radialGradient></defs>
      ${pumpkinLight(64, 108, 1.15, 0)}${pumpkinLight(92, 107, 0.8, 1)}${pumpkinLight(122, 108, 0.95, 2)}`,
  },
  winter: {
    far: `${FAR_HILLS}${fir(298, 100, 50)}${fir(330, 100, 66)}${fir(364, 98, 46)}`,
    near: `<ellipse cx="40" cy="110" rx="24" ry="6" class="drift"/><ellipse cx="110" cy="108" rx="18" ry="5" class="drift"/>
      <g class="snowman">
        <path d="M226 70l-15-9M213 62l-3-4M213 62l-4 1M244 70l15-10M257 61l2-4M257 61l4 1" class="twig"/>
        <circle cx="235" cy="94" r="13" class="snow-body"/><circle cx="235" cy="73" r="10" class="snow-body"/>
        <circle cx="235" cy="57" r="8" class="snow-body"/>
        <path d="M227 64q8 5 16 0l1 3q-9 5-18 0z" class="scarf"/><path d="M239 66l3 10-4 1-2-9z" class="scarf"/>
        <path d="M228 50h14v2h-14zM230.5 40h9v10h-9z" class="hat"/>
        <circle cx="232" cy="55.5" r="1.3" class="coal"/><circle cx="238" cy="55.5" r="1.3" class="coal"/>
        <path d="M235 58l10 1.5-10 1.5z" class="carrot"/>
        <circle cx="235" cy="74" r="1.3" class="coal"/><circle cx="235" cy="80" r="1.3" class="coal"/><circle cx="235" cy="88" r="1.3" class="coal"/>
      </g>`,
    lights: `<defs><radialGradient id="bulbGlow"><stop offset="0" stop-color="#FFF6D0" stop-opacity=".55"/><stop offset="1" stop-color="#FFF6D0" stop-opacity="0"/></radialGradient></defs>
    <g class="garland"><ellipse cx="328" cy="74" rx="52" ry="14" fill="url(#bulbGlow)" class="garland-halo"/>
      <path d="M284 70q14 14 30-2q14 16 32 0q10 10 24-2" class="garland-wire"/>
      ${[[288, 74.5], [296, 77.5], [305, 76.5], [313, 69], [322, 75.5], [331, 78.5], [340, 74.5], [348, 69.5], [356, 73.5], [364, 72]]
        .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.3" class="bulb b${i % 4}" style="--i:${i}"/>`).join('')}
    </g>`,
  },
  spring: {
    far: `${FAR_HILLS}
      <g><path d="M305 100l-2.5-34h5z" class="trunk"/><path d="M305 80l-10-8M306 74l9-8" class="branch"/>
        <circle cx="294" cy="66" r="11" class="bl-a"/><circle cx="315" cy="62" r="12" class="bl-b"/><circle cx="305" cy="52" r="11" class="bl-c"/>
        <circle cx="318" cy="74" r="8" class="bl-a"/><circle cx="292" cy="78" r="7" class="bl-c"/><circle cx="305" cy="66" r="7" class="bl-d"/></g>
      <g><path d="M354 98l-2-26h4z" class="trunk"/>
        <circle cx="346" cy="70" r="9" class="bl-b"/><circle cx="362" cy="68" r="9" class="bl-a"/><circle cx="354" cy="58" r="9" class="bl-d"/><circle cx="356" cy="72" r="6" class="bl-c"/></g>`,
    near: `${[[30, 109, 9, 'sc-a'], [42, 108, 12, 'sc-b'], [55, 108, 8, 'sc-a'], [74, 106, 11, 'sc-b'], [92, 106, 9, 'sc-a'], [108, 106, 12, 'sc-b'], [126, 106, 8, 'sc-a'], [146, 107, 10, 'sc-b']]
      .map(([x, y, h, c]) => scilla(x, y, h, c)).join('')}
      <ellipse cx="300" cy="104" rx="2" ry="1.2" class="bl-a"/><ellipse cx="322" cy="106" rx="2" ry="1.2" class="bl-c"/>
      ${bird(236, 22, 0)}${bird(252, 30, 1)}${bird(266, 18, 2)}
      ${butterfly(168, 78, 0, 'bf-a')}${butterfly(204, 90, 1, 'bf-b')}`,
    lights: '',
  },
  summer: {
    far: `${cloud(262, 28, 0.9, 0)}${cloud(340, 22, 0.7, 1)}${FAR_HILLS}`,
    near: `<path d="M30 110q2-8 4 0M40 108q2-9 4 0M120 106q2-8 4 0M150 106q2-7 4 0M200 107q2-8 4 0" class="grass"/>
      ${sunflower(300, 106, 50, 6.5)}${sunflower(334, 104, 64, 7.5)}${sunflower(366, 102, 44, 6)}`,
    lights: '',
  },
};

/** SVG-сцена для шапки. */
export function sceneMarkup(season) {
  const sc = SCENES[season] || SCENES.autumn;
  return `<div class="scene scene-${season}" aria-hidden="true">
    <svg class="sc-far" ${VB}>${sc.far}</svg>
    <svg class="sc-ground" ${VB}>${GROUND}</svg>
    <svg class="sc-near" ${VB}>${sc.near}</svg>
    ${sc.lights ? `<svg class="sc-lights" ${VB}>${sc.lights}</svg>` : ''}
  </div>`;
}

/** Гірлянда — з 15 грудня по 15 січня включно. */
export function isGarlandTime(now = new Date()) {
  const m = now.getMonth();
  const d = now.getDate();
  return (m === 11 && d >= 15) || (m === 0 && d <= 15);
}
