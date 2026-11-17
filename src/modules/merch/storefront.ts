
import type { FastifyInstance } from 'fastify';

export interface MerchPreviewFamily {
  slug: string;
  name: string;
}

const FAMILIES: readonly MerchPreviewFamily[] = [
  {
    "slug": "camisetas-oversize",
    "name": "Camisetas oversize"
  },
  {
    "slug": "sudaderas-capucha",
    "name": "Sudaderas con capucha"
  },
  {
    "slug": "gorras-y-gorros",
    "name": "Gorras y gorros pescador"
  },
  {
    "slug": "lanyards",
    "name": "Lanyards 90 × 2,5 cm"
  },
  {
    "slug": "pulseras",
    "name": "Pulseras"
  },
  {
    "slug": "abanicos-poliester",
    "name": "Abanicos poliéster, varillas negras, 1 tinta"
  },
  {
    "slug": "abanicos-otras-gamas",
    "name": "Abanicos otras gamas"
  },
  {
    "slug": "mecheros",
    "name": "Mecheros Clipper"
  },
  {
    "slug": "llaveros-silicona",
    "name": "Llaveros de silicona 3D"
  },
  {
    "slug": "llaveros-otros",
    "name": "Llaveros otros materiales"
  },
  {
    "slug": "pegatinas-estandar",
    "name": "Pegatinas estándar"
  },
  {
    "slug": "pegatinas-otras",
    "name": "Pegatinas otros materiales"
  },
  {
    "slug": "displays-acrilicos",
    "name": "Displays acrílicos"
  },
  {
    "slug": "etiquetas",
    "name": "Etiquetas colgantes"
  },
  {
    "slug": "bolsas-embalaje",
    "name": "Bolsas de embalaje esmeriladas"
  },
  {
    "slug": "futbol-personalizado",
    "name": "Equipaciones de fútbol"
  },
  {
    "slug": "bragas-cuello",
    "name": "Bragas de cuello"
  },
  {
    "slug": "tarjetas-pvc-acreditaciones",
    "name": "Tarjetas y acreditaciones"
  },
  {
    "slug": "cubos-led",
    "name": "Cubos LED"
  },
  {
    "slug": "bolsas-envio",
    "name": "Bolsas de envío adhesivas"
  },
  {
    "slug": "otros-personalizados",
    "name": "Tote bags, calcetines, chapas, parches, tapones y UV especial"
  }
];
const CSS = "\n:root{color-scheme:dark;font-family:'Inter Tight',Inter,ui-sans-serif,system-ui,sans-serif;--orange:#E35D24;--ink:#080808;--card:#171717;--line:#363636}\n*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--ink);color:#f5f5f4}\na{color:inherit}a:focus-visible{outline:3px solid #ff9b5f;outline-offset:4px}\nheader{position:sticky;top:0;z-index:5;background:rgba(8,8,8,.95);border-bottom:1px solid var(--line)}\n.topbar{max-width:1200px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:18px;padding:20px 26px}\n.wordmark{font-weight:900;letter-spacing:-.065em;font-size:26px;text-decoration:none;white-space:nowrap}\n.wordmark span{color:var(--orange)}\n.topnav{display:flex;gap:22px;align-items:center;font-size:13px;text-transform:uppercase;letter-spacing:.08em}\n.topnav a{text-decoration:none}.topnav a:hover{color:var(--orange)}\n.shell{max-width:1200px;margin:auto;padding:0 26px}\n.hero{padding:95px 0 76px;border-bottom:1px solid var(--line);position:relative;overflow:hidden}\n.hero:after{content:\"MERCH\";position:absolute;right:-36px;bottom:-63px;font-size:clamp(150px,30vw,380px);font-weight:1000;letter-spacing:-.11em;color:rgba(227,93,36,.08);z-index:0;pointer-events:none;line-height:.8}\n.hero .inner{position:relative;z-index:1}\n.eyebrow{font-size:12px;letter-spacing:.20em;text-transform:uppercase;color:var(--orange);font-weight:750;display:flex;align-items:center;gap:14px}\n.dot{width:8px;height:8px;border-radius:50%;background:var(--orange);display:inline-block}\nh1{font-size:clamp(58px,11vw,150px);letter-spacing:-.075em;line-height:.85;margin:28px 0;font-weight:950;max-width:1000px}\nh1 em{font-style:normal;color:var(--orange)}\n.intro{max-width:680px;font-size:clamp(17px,2vw,22px);line-height:1.55;color:#c7c7c7}\n.notice{display:inline-flex;align-items:center;gap:10px;padding:12px 16px;border:1px solid #6e3c24;background:#21140d;border-radius:4px;font-size:12px;line-height:1.4;color:#f8ceb9;margin-top:22px}\n.highlights{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid var(--line)}\n.highlight{padding:27px 14px 27px 0;border-right:1px solid var(--line);margin-right:28px}\n.highlight:last-child{border:0;margin:0}\n.highlight strong{display:block;color:var(--orange);font-weight:850;font-size:13px;text-transform:uppercase;letter-spacing:.08em}\n.highlight p{color:#b7b7b7;font-size:14px;line-height:1.6;margin:9px 0 0}\n.section-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin:75px 0 28px}\nh2{font-size:clamp(33px,5vw,56px);line-height:1;letter-spacing:-.055em;margin:0}\n.section-head p{max-width:330px;color:#bababa;font-size:14px;line-height:1.5;margin:0}\n.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:90px}\n.product{background:var(--card);min-height:247px;border:1px solid #2f2f2f;padding:25px;display:flex;flex-direction:column;gap:0;transition:border-color .2s,transform .2s}\n.product:hover{border-color:var(--orange);transform:translateY(-2px)}\n.counter{color:var(--orange);font-size:12px;font-weight:750;letter-spacing:.12em}\n.product h3{font-size:clamp(21px,2.3vw,28px);line-height:1.1;letter-spacing:-.045em;margin:28px 0 12px}\n.product p{color:#a9a9a9;font-size:13px;line-height:1.55;margin:0 0 24px}\n.product a{margin-top:auto;display:inline-flex;align-items:center;gap:7px;font-weight:750;font-size:13px;text-decoration:none}\n.product a:hover{color:var(--orange)}\n.steps{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:57px 0 65px}\n.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:38px;margin-top:27px}\n.steps strong{color:var(--orange);font-size:15px}\n.steps p{color:#aaa;font-size:14px;line-height:1.55}\n.footer{padding:48px 0 80px;display:flex;justify-content:space-between;gap:20px;color:#a6a6a6;font-size:13px}\n.footer a{color:#f7f7f7}.footer a:hover{color:var(--orange)}\n@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.hero{padding:75px 0 65px}.highlights{grid-template-columns:1fr}.highlight{border:0;border-bottom:1px solid var(--line);margin:0}.highlight:last-child{border:0}.steps-grid{gap:18px}}\n@media(max-width:580px){.shell{padding:0 18px}.topbar{padding:17px 18px}.topnav{gap:13px;font-size:11px}.wordmark{font-size:23px}.hero{padding:65px 0 55px}.hero:after{font-size:170px}.hero h1{font-size:clamp(49px,14vw,90px)}.grid{grid-template-columns:1fr}.product{min-height:210px}.section-head{display:block;margin:55px 0 24px}.section-head p{margin-top:15px}.steps-grid{grid-template-columns:1fr;gap:10px}.footer{flex-direction:column}}\n@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.product{transition:none}}\n";

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Read-only catalog landing. No live payment or quotation endpoint is exposed
 * here. Use only in preview environments behind an explicit feature flag.
 */
export function renderMerchStorefrontPreview(): string {
  const cards = FAMILIES.map((family, index) => {
    const name = escapeHtml(family.name);
    const subject = encodeURIComponent('Presupuesto BASSSE Merch: ' + family.name);
    return [
      '<article class="product" id="producto-' + escapeHtml(family.slug) + '">',
      '<span class="counter">FAMILIA / ' + String(index + 1).padStart(2, '0') + '</span>',
      '<h3>' + name + '</h3>',
      '<p>Merchandising personalizado. Cantidades, técnicas y presupuesto sujetos a confirmación.</p>',
      '<a href="mailto:info@bassse.com?subject=' + subject + '">',
      'Solicitar presupuesto <span aria-hidden="true">↗</span></a>',
      '</article>',
    ].join('');
  }).join('');

  return [
    '<!doctype html><html lang="es"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="description" content="BASSSE Merch: merchandising personalizado para marcas, eventos y artistas. Vista previa sin pedidos ni cobros activos.">',
    '<title>BASSSE MERCH · Vista previa</title>',
    '<style>' + CSS + '</style>',
    '</head><body>',
    '<header><div class="topbar">',
    '<a class="wordmark" href="#inicio" aria-label="BASSSE Merch, inicio">BAS<span>S</span>SE<span>.</span></a>',
    '<nav class="topnav" aria-label="Navegación">',
    '<a href="#catalogo">Productos</a><a href="#proceso">Cómo trabajamos</a>',
    '</nav></div></header>',
    '<main id="inicio"><section class="hero"><div class="shell inner">',
    '<div class="eyebrow"><span class="dot" aria-hidden="true"></span> BASSSE / SPECIAL SOUND SERVICE</div>',
    '<h1>YOUR BRAND.<br><em>YOUR MERCH.</em></h1>',
    '<p class="intro">Merchandising personalizado para marcas, artistas, clubs y eventos. ',
    'Producción bajo pedido, materiales y acabados a medida.</p>',
    '<p class="notice"><span class="dot" aria-hidden="true"></span>',
    'VISTA PREVIA · Sin precios ni pagos habilitados. Las propuestas requieren confirmación.</p>',
    '</div></section>',
    '<section class="shell highlights" aria-label="Cómo realizamos los pedidos">',
    '<div class="highlight"><strong>01 / Selecciona</strong><p>Explora las familias de productos y cuéntanos lo que necesitas.</p></div>',
    '<div class="highlight"><strong>02 / Personaliza</strong><p>Confirmamos técnica, cantidad, archivos y presupuesto final.</p></div>',
    '<div class="highlight"><strong>03 / Producimos</strong><p>Tras el pago y la aprobación escrita del arte, comienza la fabricación.</p></div>',
    '</section>',
    '<section class="shell" id="catalogo"><div class="section-head">',
    '<h2>EL CATÁLOGO.</h2>',
    '<p>21 familias de merchandising. Todas las tarifas se revisan antes de ofrecer una compra directa.</p>',
    '</div><div class="grid">',cards,'</div></section>',
    '<section class="steps" id="proceso"><div class="shell">',
    '<div class="eyebrow">PRODUCCIÓN A MEDIDA</div><div class="section-head"><h2>DE LA IDEA A LA ENTREGA.</h2></div>',
    '<div class="steps-grid">',
    '<div><strong>01 · PRESUPUESTO</strong><p>Validamos cantidades, técnica de fabricación, impuestos y transporte antes de confirmar un importe.</p></div>',
    '<div><strong>02 · APROBACIÓN</strong><p>Revisamos el diseño final contigo y solicitamos tu aprobación expresa.</p></div>',
    '<div><strong>03 · PRODUCCIÓN</strong><p>Fabricamos, revisamos calidad y organizamos la entrega del pedido.</p></div>',
    '</div></div></section></main>',
    '<footer class="shell footer"><span>BASSSE · Special Sound Service</span>',
    '<a href="mailto:info@bassse.com">info@bassse.com</a></footer>',
    '</body></html>',
  ].join('');
}

export function registerMerchStorefrontPreview(app: FastifyInstance): void {
  app.get('/merch', (_req, reply) => reply
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('X-Robots-Tag', 'noindex, nofollow')
    .header('Cache-Control', 'no-store')
    .send(renderMerchStorefrontPreview()));
}
