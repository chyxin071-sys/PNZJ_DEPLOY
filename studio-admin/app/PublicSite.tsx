"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, MapPin, Menu, Phone, Search, X } from "lucide-react";
import logoFull from "./assets/logo-full.png";
import logoMark from "./assets/logo-mark.png";
import designerQr from "./assets/designer-qr.png";
import { publicCases, type PublicCase } from "./public-data";
import { publicApi } from "./admin-api";

type SiteContent = {
  brand?: { name?: string; slogan?: string };
  company?: { address?: string; businessHours?: string; phone?: string };
  media?: { aboutCover?: string };
};

function normalizePublicCases(records: Array<Record<string, unknown>>) {
  return records.map((record) => {
    const cover = String(record.cover || "");
    const images = Array.isArray(record.images) && record.images.length
      ? record.images.map(String)
      : cover
        ? [cover]
        : [];
    return {
      id: String(record.id || record.caseNo || record._id || ""),
      name: String(record.name || record.title || "未命名案例"),
      community: String(record.community || ""),
      area: Number(record.area) || 0,
      layout: String(record.layout || ""),
      style: String(record.style || ""),
      cover,
      images,
      imageSections: Array.isArray(record.imageSections) ? record.imageSections : [],
      description: String(record.description || ""),
      layoutInfo: String(record.layoutInfo || ""),
      highlights: String(record.highlights || ""),
      tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    } satisfies PublicCase;
  }).filter((item) => item.id && item.cover);
}

function usePublicContent() {
  const [cases, setCases] = useState(publicCases);
  const [siteConfig, setSiteConfig] = useState<SiteContent>({});

  useEffect(() => {
    publicApi.getPublicContent().then((content) => {
      const nextCases = normalizePublicCases(content.cases);
      setCases(nextCases);
      setSiteConfig((content.siteConfig || {}) as SiteContent);
    }).catch((error) => {
      console.warn("Public content is using local fallback data.", error);
    });
  }, []);

  return { cases, siteConfig };
}

function PublicLightbox({ images, index, close, select }: { images: string[]; index: number; close: () => void; select: (index: number) => void }) {
  const previous = () => select((index - 1 + images.length) % images.length);
  const next = () => select((index + 1) % images.length);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  return <div className="public-lightbox"><button aria-label="关闭图片" className="public-lightbox-mask" onClick={close} /><img src={images[index]} alt="" /><span>{index + 1} / {images.length}</span><button className="public-lightbox-close" onClick={close}><X /></button>{images.length > 1 && <><button className="public-lightbox-arrow left" onClick={previous}><ChevronLeft /></button><button className="public-lightbox-arrow right" onClick={next}><ChevronRight /></button></>}</div>;
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return <header className="public-header"><a href="/" className="public-brand"><img src={logoFull.src} alt="品诺筑家整装" /></a><button className="public-menu" onClick={() => setOpen(!open)} aria-label="打开导航">{open ? <X /> : <Menu />}</button><nav className={open ? "open" : ""}><a href="/#home" onClick={() => setOpen(false)}>首页</a><a href="/#cases" onClick={() => setOpen(false)}>案例库</a><a href="/#about" onClick={() => setOpen(false)}>关于我们</a><a href="/#contact" onClick={() => setOpen(false)}>联系咨询</a></nav></header>;
}

function CaseCard({ item }: { item: PublicCase }) {
  return <a className="public-case-card" href={`/case/${item.id}`}><div><img src={item.cover} alt={item.name} /><span>{item.style}</span></div><h3>{item.name}</h3><p>{item.layout} · {item.area}㎡</p><footer><span>{item.community}</span><ArrowRight size={18} /></footer></a>;
}

export function PublicSite() {
  const { cases, siteConfig } = usePublicContent();
  const [style, setStyle] = useState("全部");
  const [query, setQuery] = useState("");
  const styles = ["全部", ...Array.from(new Set(cases.map((item) => item.style)))];
  const filtered = useMemo(() => cases.filter((item) => (style === "全部" || item.style === style) && (!query || item.community.includes(query) || item.name.includes(query))), [cases, query, style]);
  const heroCase = cases[0] || publicCases[0];
  const address = siteConfig.company?.address || "甘肃省嘉峪关市河西建材城品诺筑家整装";
  const businessHours = siteConfig.company?.businessHours || "9:00-18:00";
  const contactQr = designerQr.src;
  return <main className="public-site">
    <PublicHeader />
    <section className="public-hero" id="home" style={{ backgroundImage: `linear-gradient(90deg, rgba(16,15,13,.72), rgba(16,15,13,.08)), url(${heroCase.cover})` }}>
      <div><img src={logoMark.src} alt="" /><p>PINNUO HOME · JIAYUGUAN</p><h1>品诺筑家整装</h1><h2>用设计，让家真正落地</h2><a href="#cases">查看案例 <ArrowRight size={18} /></a></div>
    </section>
    <section className="public-cases" id="cases"><header><div><span>SELECTED WORKS</span><h2>案例库</h2></div><p>按小区与风格，快速找到更接近你理想生活的空间参考。</p></header><div className="public-case-tools"><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索小区或案例" /></label><div>{styles.map((item) => <button className={style === item ? "active" : ""} onClick={() => setStyle(item)} key={item}>{item}</button>)}</div></div><div className="public-case-grid">{filtered.map((item) => <CaseCard item={item} key={item.id} />)}</div></section>
    <section className="public-about" id="about"><div className="public-about-image" style={{ backgroundImage: `url(${siteConfig.media?.aboutCover || cases[4 % cases.length]?.cover || heroCase.cover})` }} /><div><span>OUR STORY</span><h2>扎根嘉峪关二十余年</h2><p>2002年，我们从福建远赴嘉峪关，从瓷砖销售起步。承蒙客户朋友一路信任与扶持，我们在这座城市安家，也把对家的理解沉淀进每一次服务。</p><p>2019年，品诺筑家整装正式成立，开启一站式全屋整装落地服务。品质立身，诚信做人，是我们的根，也是我们始终不变的承诺。</p><blockquote>{siteConfig.brand?.slogan || "良心做人，匠心做事。"}</blockquote></div></section>
    <section className="public-contact" id="contact"><div><span>DESIGN CONSULTATION</span><h2>聊聊你理想中的家</h2><p>提交咨询后，品诺筑家顾问会结合小区、户型与居住需求提供初步建议。</p><dl><div><MapPin /><dt>公司地址</dt><dd>{address}</dd></div><div><Clock3 /><dt>营业时间</dt><dd>每日 {businessHours}</dd></div><div><Phone /><dt>咨询方式</dt><dd>扫码添加品诺筑家顾问微信</dd></div></dl></div><figure><img src={contactQr} alt="品诺筑家顾问微信二维码" /><figcaption>扫码添加品诺筑家顾问微信</figcaption></figure></section>
    <footer className="public-footer"><img src={logoFull.src} alt="品诺筑家整装" /><p>品质立身，诚信做人，用心交付每一个家。</p><span>© 2026 品诺筑家整装</span></footer>
  </main>;
}

export function PublicCaseDetail({ item }: { item: PublicCase }) {
  const { cases } = usePublicContent();
  const resolvedItem = cases.find((record) => record.id === item.id) || item;
  const [active, setActive] = useState(0);
  const [sectionActives, setSectionActives] = useState<Record<number, number>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [sectionLightbox, setSectionLightbox] = useState<{ section: number; index: number } | null>(null);
  const [tab, setTab] = useState("案例说明");
  useEffect(() => setActive(0), [resolvedItem.id]);
  const images = resolvedItem.images.length ? resolvedItem.images : [resolvedItem.cover];
  const sections = resolvedItem.imageSections || [];
  const hasSections = sections.length > 0;
  const content: Record<string, string | string[]> = { "案例说明": resolvedItem.description, "户型信息": resolvedItem.layoutInfo, "设计亮点": resolvedItem.highlights, "标签": resolvedItem.tags };
  return <main className="public-site public-detail"><PublicHeader /><div className="public-detail-back"><a href="/#cases"><ChevronLeft size={18} />返回案例库</a></div>
    {/* Cover */}
    <section className="public-detail-cover">
      <button onClick={() => setLightbox(-1)}>
        <img src={resolvedItem.cover} alt={resolvedItem.name} />
        <span>点击查看大图</span>
      </button>
    </section>
    {/* Hero / meta */}
    <section className="public-detail-hero">
      <div>
        <span>{resolvedItem.style}</span>
        <h1>{resolvedItem.name}</h1>
        <p>{resolvedItem.community} · {resolvedItem.layout} · {resolvedItem.area}㎡</p>
      </div>
    </section>
    {/* Content tabs */}
    <section className="public-detail-copy">
      <nav>{Object.keys(content).map((name) => <button className={tab === name ? "active" : ""} onClick={() => setTab(name)} key={name}>{name}</button>)}</nav>
      {Array.isArray(content[tab]) ? <div className="public-tags">{(content[tab] as string[]).map((tag) => <span key={tag}>{tag}</span>)}</div> : <p>{content[tab] as string}</p>}
    </section>
    {/* Image sections */}
    {hasSections ? <section className="public-detail-sections">
      {sections.map((section, si) => <div className="public-detail-section" key={si}>
        <h3>{section.name}</h3>
        <div className="public-section-gallery">
          {section.images.map((img, ii) => <button className={(sectionActives[si] || 0) === ii ? "active" : ""} onClick={() => setSectionActives((current) => ({ ...current, [si]: ii }))} key={`${img}-${ii}`}><img src={img} alt={section.name} /></button>)}
        </div>
        <div className="public-section-preview">
          <button onClick={() => setSectionLightbox({ section: si, index: sectionActives[si] || 0 })}>
            <img src={section.images[sectionActives[si] || 0] || section.images[0]} alt={section.name} />
            <span>点击查看大图</span>
          </button>
        </div>
      </div>)}
    </section> : <section className="public-detail-hero">
      {/* Legacy: fallback gallery when no sections */}
      {!hasSections && <div className="public-detail-thumbs">{images.map((image, index) => <button className={active === index ? "active" : ""} onClick={() => setActive(index)} key={`${image}-${index}`}><img src={image} alt="" /></button>)}</div>}
      <button onClick={() => setLightbox(active)}>
        <img src={images[active]} alt={resolvedItem.name} />
        <span>点击查看大图</span>
      </button>
    </section>}
    <section className="public-detail-cta"><p>喜欢这个案例？让设计师结合你的户型给出建议。</p><a href="/#contact">咨询设计师 <ArrowRight size={18} /></a></section>
    {lightbox !== null && lightbox === -1 && <PublicLightbox images={[resolvedItem.cover]} index={0} close={() => setLightbox(null)} select={() => undefined} />}
    {lightbox !== null && lightbox >= 0 && images.length > 0 && <PublicLightbox images={images} index={Math.min(lightbox, images.length - 1)} close={() => setLightbox(null)} select={setLightbox} />}
    {sectionLightbox !== null && sections[sectionLightbox.section] && <PublicLightbox images={sections[sectionLightbox.section].images} index={sectionLightbox.index} close={() => setSectionLightbox(null)} select={(index) => setSectionLightbox((current) => current ? { ...current, index } : null)} />}
  </main>;
}
