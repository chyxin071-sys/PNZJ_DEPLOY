"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, MapPin, Menu, Phone, Search, X } from "lucide-react";
import logoFull from "./assets/logo-full.png";
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
  return <header className="public-header"><a href="/" className="public-brand"><img src={logoFull.src} alt="品诺筑家整装" /></a><button className="public-menu" onClick={() => setOpen(!open)} aria-label="打开导航">{open ? <X /> : <Menu />}</button><nav className={open ? "open" : ""}><a href="/#works" onClick={() => setOpen(false)}>空间案例</a><a href="/#approach" onClick={() => setOpen(false)}>整装方法</a><a href="/#about" onClick={() => setOpen(false)}>关于品诺</a><a href="/#contact" onClick={() => setOpen(false)}>预约咨询</a><a className="public-nav-erp" href="/erp">客户中心</a></nav></header>;
}

function CaseCard({ item, index }: { item: PublicCase; index: number }) {
  return <a className={`public-case-card public-case-card-${index % 5}`} href={`/case/${item.id}`}><div><img src={item.cover} alt={item.name} loading={index > 3 ? "lazy" : "eager"} decoding="async" /><span>{String(index + 1).padStart(2, "0")}</span><i>VIEW PROJECT <ArrowRight size={15} /></i></div><header><div><p>{item.community} · {item.style}</p><h3>{item.name}</h3></div><p>{item.layout}<br />{item.area}㎡</p></header></a>;
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
  const secondary = cases[1] || heroCase;
  const aboutImage = siteConfig.media?.aboutCover || cases[4 % Math.max(cases.length, 1)]?.cover || heroCase.cover;
  return <main className="public-site public-home">
    <PublicHeader />
    <section className="public-hero" id="home">
      <img className="public-hero-image" src={heroCase.cover} alt={heroCase.name} />
      <div className="public-hero-shade" />
      <div className="public-hero-copy"><p>PINNUO HOME / JIAYUGUAN</p><h1>家，不止被设计<br />更需要被实现</h1><div><span>品诺有心，筑家有道</span><a href={`/case/${heroCase.id}`}>探索本案 <ArrowRight size={18} /></a></div></div>
      <a className="public-hero-index" href="#works"><span>SCROLL TO EXPLORE</span><b>01</b></a>
    </section>
    <section className="public-intro" id="approach"><header><span>01 / OUR APPROACH</span><p>从生活方式出发，以设计统筹施工、主材、定制与软装，让审美与落地不再割裂。</p></header><h2>我们不交付一张效果图<br />我们交付一个真正住得好的家</h2><div className="public-intro-stats"><div><b>2002</b><span>品牌服务起点</span></div><div><b>1:1</b><span>效果与落地协同</span></div><div><b>全案</b><span>设计到交付闭环</span></div></div></section>
    <section className="public-featured"><a href={`/case/${secondary.id}`}><img src={secondary.cover} alt={secondary.name} /><div><span>FEATURED RESIDENCE</span><h2>{secondary.name}</h2><p>{secondary.community} / {secondary.layout} / {secondary.area}㎡</p></div></a></section>
    <section className="public-cases" id="works"><header><div><span>02 / SELECTED WORKS</span><h2>空间案例</h2></div><p>按真实小区、户型与生活需求整理。每个案例都呈现从概念到空间落地的完整思考。</p></header><div className="public-case-tools"><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索小区、案例或户型" /></label><div>{styles.map((item) => <button className={style === item ? "active" : ""} onClick={() => setStyle(item)} key={item}>{item}</button>)}</div><span>{filtered.length} PROJECTS</span></div><div className="public-case-grid">{filtered.map((item, index) => <CaseCard item={item} index={index} key={item.id} />)}</div>{filtered.length === 0 && <div className="public-no-cases">没有找到匹配案例，试试其他关键词。</div>}</section>
    <section className="public-about" id="about"><div className="public-about-image" style={{ backgroundImage: `url(${aboutImage})` }} /><div><span>03 / ABOUT PINNUO</span><h2>在嘉峪关<br />认真做好每一个家</h2><p>从材料经营到全案整装，我们对家的理解来自二十余年的真实交付。设计不是孤立的表达，而是预算、工艺、尺度与日常生活共同形成的答案。</p><p>品诺筑家坚持把复杂的装修过程整合成清晰、可控、可落地的服务。</p><blockquote>{siteConfig.brand?.slogan || "品诺有心，筑家有道"}</blockquote></div></section>
    <section className="public-contact" id="contact"><div><span>DESIGN CONSULTATION</span><h2>聊聊你理想中的家</h2><p>提交咨询后，品诺筑家顾问会结合小区、户型与居住需求提供初步建议。</p><dl><div><MapPin /><dt>公司地址</dt><dd>{address}</dd></div><div><Clock3 /><dt>营业时间</dt><dd>每日 {businessHours}</dd></div><div><Phone /><dt>咨询方式</dt><dd>扫码添加品诺筑家顾问微信</dd></div></dl></div><figure><img src={contactQr} alt="品诺筑家顾问微信二维码" /><figcaption>扫码添加品诺筑家顾问微信</figcaption></figure></section>
    <footer className="public-footer"><div><img src={logoFull.src} alt="品诺筑家整装" /><p>品诺有心，筑家有道</p></div><div><a href="#works">案例</a><a href="#approach">方法</a><a href="#about">关于</a><a href="#contact">联系</a></div><span>© 2026 PINNUO HOME</span></footer>
  </main>;
}

export function PublicCaseDetail({ item }: { item: PublicCase }) {
  const { cases } = usePublicContent();
  const resolvedItem = cases.find((record) => record.id === item.id) || item;
  const [active, setActive] = useState(0);
  const [sectionActives, setSectionActives] = useState<Record<number, number>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [sectionLightbox, setSectionLightbox] = useState<{ section: number; index: number } | null>(null);
  useEffect(() => setActive(0), [resolvedItem.id]);
  const images = resolvedItem.images.length ? resolvedItem.images : [resolvedItem.cover];
  const sections = resolvedItem.imageSections || [];
  const hasSections = sections.length > 0;
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
    {/* Numbered text content */}
    <section className="public-detail-story">
      <article><span>01</span><div><h2>案例说明</h2><p>{resolvedItem.description || "暂无案例说明"}</p></div></article>
      <article><span>02</span><div><h2>户型信息</h2><p>{resolvedItem.layoutInfo || "暂无户型信息"}</p></div></article>
      <article><span>03</span><div><h2>设计亮点</h2><p>{resolvedItem.highlights || "暂无设计亮点"}</p></div></article>
    </section>
    {/* Image sections */}
    {hasSections ? <section className="public-detail-sections">
      {sections.map((section, si) => <div className="public-detail-section" key={si}>
        <h3>{section.name}</h3>
        <div className="public-section-gallery">
          {section.images.map((img, ii) => <button className={(sectionActives[si] || 0) === ii ? "active" : ""} onClick={() => setSectionActives((current) => ({ ...current, [si]: ii }))} key={`${img}-${ii}`}><img src={img} alt={section.name} loading="lazy" decoding="async" /></button>)}
        </div>
        <div className="public-section-preview">
          <button onClick={() => setSectionLightbox({ section: si, index: sectionActives[si] || 0 })}>
            <img src={section.images[sectionActives[si] || 0] || section.images[0]} alt={section.name} loading="lazy" decoding="async" />
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
    <section className="public-detail-brand-end"><img src={logoFull.src} alt="品诺筑家整装" /><div><strong>品诺有心，筑家有道</strong><span>扫码添加设计顾问，获取专属设计建议</span></div><img className="public-brand-end-qr" src={designerQr.src} alt="咨询二维码" /></section>
    <section className="public-detail-cta"><p>喜欢这个案例？让设计师结合你的户型给出建议。</p><a href="/#contact">咨询设计师 <ArrowRight size={18} /></a></section>
    {lightbox !== null && lightbox === -1 && <PublicLightbox images={[resolvedItem.cover]} index={0} close={() => setLightbox(null)} select={() => undefined} />}
    {lightbox !== null && lightbox >= 0 && images.length > 0 && <PublicLightbox images={images} index={Math.min(lightbox, images.length - 1)} close={() => setLightbox(null)} select={setLightbox} />}
    {sectionLightbox !== null && sections[sectionLightbox.section] && <PublicLightbox images={sections[sectionLightbox.section].images} index={sectionLightbox.index} close={() => setSectionLightbox(null)} select={(index) => setSectionLightbox((current) => current ? { ...current, index } : null)} />}
  </main>;
}
